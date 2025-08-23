const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { safeEqual, looksLikeToken, mdEscape } = require('../helpers/security');

const { authenticateAPI, requireAuthOrAPI } = require('../middleware/auth');

const router = express.Router();

// Prevent crawling
router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// In-memory session store (replace with Redis in prod)
const proofSessions = new Map();

// Validate access middleware
const validateProofAccess = async (req, res, next) => {
  try {
    const { proofId } = req.params;
    const { token } = req.query;

    if (!proofId || !token || !looksLikeToken(token)) {
      return res.status(400).render('error', { message: 'Invalid proof link. Please check your email.' });
    }

    const proofData = proofSessions.get(proofId);
    if (!proofData) {
      return res.status(404).render('error', { message: 'Proof not found or has expired.' });
    }

    if (!looksLikeToken(proofData.accessToken) || !safeEqual(proofData.accessToken, token)) {
      return res.status(401).render('error', { message: 'Invalid access token. Please use the link from your email.' });
    }

    const expiryTime = proofData.createdAt + (7 * 24 * 60 * 60 * 1000);
    if (Date.now() > expiryTime) {
      const data = proofData.proofData;
      const salesRepEmail = `${data.salesRepFirst}.${data.salesRepLast}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com';
      return res.status(410).render('error', { 
        message: 'This proof link has expired after 7 days.',
        details: `For project "${data.projectName}" (Proof #${data.artProofNumber})`,
        nextSteps: `Please contact your sales representative ${data.salesRepFirst} ${data.salesRepLast} at ${salesRepEmail} to request a new proof link.`,
        isExpired: true
      });
    }

    req.proofData = proofData;
    next();
  } catch (err) {
    console.error('Error validating proof access:', err);
    res.status(500).render('error', { message: 'Unable to validate proof access. Please try again.' });
  }
};

// Admin login page (no auth required)
router.get('/admin/login', (req, res) => {
  res.render('admin-login', {
    cspNonce: res.locals.cspNonce
  });
});

// Sales rep dashboard (must be before /:proofId route)
router.get('/admin', requireAuthOrAPI, (req, res) => {
  res.render('admin-dashboard', {
    cspNonce: res.locals.cspNonce
  });
});

// Advanced admin dashboard for proof creation
router.get('/admin/dashboard', requireAuthOrAPI, (req, res) => {
  res.render('admin-advanced', {
    cspNonce: res.locals.cspNonce
  });
});

// Get proof status (for sales rep dashboard)
router.get('/admin/status/:proofId', requireAuthOrAPI, (req, res) => {
  try {
    const { proofId } = req.params;
    const proofData = proofSessions.get(proofId);
    
    if (!proofData) {
      return res.status(404).json({ error: 'Proof not found' });
    }
    
    const expiryTime = proofData.createdAt + (7 * 24 * 60 * 60 * 1000);
    const timeRemaining = expiryTime - Date.now();
    const isExpired = timeRemaining <= 0;
    
    res.json({
      proofId,
      projectName: proofData.proofData.projectName,
      artProofNumber: proofData.proofData.artProofNumber,
      customerEmail: proofData.proofData.customerEmail,
      status: proofData.status,
      createdAt: new Date(proofData.createdAt).toISOString(),
      expiresAt: new Date(expiryTime).toISOString(),
      isExpired,
      timeRemainingMs: Math.max(0, timeRemaining),
      remindersSent: proofData.remindersSent || [],
      hasResponse: Boolean(proofData.customerResponse)
    });
    
  } catch (error) {
    console.error('Error getting proof status:', error);
    res.status(500).json({ error: 'Failed to get proof status' });
  }
});

// Manual refresh endpoint for sales reps (requires authentication)
router.post('/admin/refresh/:proofId', requireAuthOrAPI, async (req, res) => {
  try {
    const { proofId } = req.params;
    const { salesRepEmail, extendDays = 7 } = req.body;
    
    // Validate sales rep email format if provided
    if (salesRepEmail && !salesRepEmail.endsWith('@shureprint.com')) {
      return res.status(400).json({ error: 'Sales rep email must be @shureprint.com domain' });
    }
    
    const proofData = proofSessions.get(proofId);
    if (!proofData) {
      return res.status(404).json({ error: 'Proof not found' });
    }
    
    // Extend the proof by resetting creation time
    const extensionMs = parseInt(extendDays) * 24 * 60 * 60 * 1000;
    proofData.createdAt = Date.now() - (7 * 24 * 60 * 60 * 1000) + extensionMs;
    proofData.status = 'pending'; // Reset status
    proofData.remindersSent = []; // Clear reminder history
    
    proofSessions.set(proofId, proofData);
    
    // Add Trello comment about manual refresh and update labels (ignore failures for test proofs)
    try {
      const trelloService = require('../services/trelloService');
      
      // Auto-apply EXTENDED label with urgency indicators
      await trelloService.updateProofStatusLabels(proofData.trelloCardId, 'extended', { extendDays });
      
      await trelloService.addCommentToCard(proofData.trelloCardId, 
        `🔄 **PROOF REFRESHED** - Link manually extended by ${extendDays} days by ${salesRepEmail}\n\nNew expiration: ${new Date(Date.now() + extensionMs).toLocaleDateString()}`);
    } catch (trelloError) {
      console.log(`Trello comment failed (expected for test proofs): ${trelloError.message}`);
    }
    
    res.json({ 
      success: true, 
      message: `Proof refreshed successfully. Link extended by ${extendDays} days.`,
      newExpirationDate: new Date(Date.now() + extensionMs).toLocaleDateString(),
      proofLink: proofData.proofLink
    });
    
  } catch (error) {
    console.error('Error refreshing proof:', error);
    res.status(500).json({ error: 'Failed to refresh proof' });
  }
});

// Review page
router.get('/:proofId', validateProofAccess, (req, res) => {
  try {
    const { proofData } = req;
    const { proofId } = req.params;

    res.render('proof-review', {
      proofId,
      proofData: proofData.proofData,
      pdfUrl: `/proof/${proofId}/pdf?token=${req.query.token}`,
      submitUrl: `/proof/${proofId}/submit`,
      token: req.query.token,
      cspNonce: res.locals.cspNonce,
    });
  } catch (err) {
    console.error('Error displaying proof:', err);
    res.status(500).render('error', { message: 'Unable to display proof. Please try again.' });
  }
});

// Serve PDF (no cache, stream errors handled)
router.get('/:proofId/pdf', validateProofAccess, (req, res) => {
  try {
    const { proofData } = req;

    if (!fs.existsSync(proofData.pdfPath)) {
      return res.status(404).render('error', { message: 'Proof document not found.' });
    }

    const filename = `proof-${proofData.proofData.artProofNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const fileStream = fs.createReadStream(proofData.pdfPath);
    fileStream.on('error', (e) => {
      console.error('PDF stream error:', e);
      if (!res.headersSent) res.status(500).end('File read error');
      else res.end();
    });
    fileStream.pipe(res);
  } catch (err) {
    console.error('Error serving PDF:', err);
    res.status(500).json({ error: 'Unable to serve PDF file' });
  }
});

// Limit submissions
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Submit approval/rejection
router.post('/:proofId/submit', submitLimiter, validateProofAccess, async (req, res) => {
  try {
    const { proofData } = req;
    const { approved, comments, customerName, signature } = req.body;

    if (approved === undefined || typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.length > 120) {
      return res.status(400).json({ error: 'Please complete all required fields' });
    }

    const isApproved = approved === 'true' || approved === true;
    const customerFeedback = typeof comments === 'string' ? comments.trim() : '';

    // Signature checks (optional)
    if (signature) {
      const MAX_SIG_BYTES = 200 * 1024;
      const prefix = 'data:image/png;base64,';
      if (!signature.startsWith(prefix)) return res.status(400).json({ error: 'Invalid signature format.' });
      const b64 = signature.slice(prefix.length);
      if (b64.length > MAX_SIG_BYTES * 1.37) return res.status(413).json({ error: 'Signature too large.' });
    }

    const responseData = {
      proofId: req.params.proofId,
      trelloCardId: proofData.trelloCardId,
      approved: isApproved,
      customerName,
      comments: customerFeedback,
      signature: signature ? '[captured]' : null,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip
    };

    console.log('Customer response received:', { ...responseData, signature: Boolean(signature) });

    // Update Trello
    const trelloService = require('../services/trelloService');
    await trelloService.processCustomerApproval(proofData.trelloCardId, isApproved, customerFeedback);

    const signatureNote = signature ? '**Digital Signature:** ✓ Captured and verified' : '';
    const trelloComment = `
🎯 **CUSTOMER RESPONSE RECEIVED**

**Decision:** ${isApproved ? '✅ APPROVED' : '❌ REVISION NEEDED'}
**Customer:** ${mdEscape(customerName)}
**Submitted:** ${new Date().toLocaleString()}

${customerFeedback ? `**Comments:**\n${mdEscape(customerFeedback)}` : ''}

${signatureNote}
    `.trim();

    await trelloService.addCommentToCard(proofData.trelloCardId, trelloComment);

    // Update session
    proofData.customerResponse = responseData;
    proofData.status = isApproved ? 'approved' : 'revision_needed';
    proofSessions.set(req.params.proofId, proofData);

    res.json({
      success: true,
      message: isApproved
        ? 'Thank you! Your proof has been approved and sent to production.'
        : 'Thank you for your feedback. Our design team will make the requested revisions.',
      approved: isApproved,
      nextSteps: isApproved
        ? 'Your project will now proceed to production. You will receive updates on the progress.'
        : 'We will make the requested changes and send you a new proof for approval.'
    });

  } catch (err) {
    console.error('Error processing customer response:', err);
    res.status(500).json({ error: 'Unable to process your response. Please try again or contact your sales representative.' });
  }
});

// Internal helpers used by services
router.storeProofData = async (proofId, proofData) => {
  const sessionData = { ...proofData, createdAt: Date.now(), status: 'pending' };
  proofSessions.set(proofId, sessionData);
  
  // Note: No initial labeling needed - PROOF SENT label applied when email is sent
};
router.getProofData = (proofId) => proofSessions.get(proofId);

// Process reminders and cleanup expired proofs
router.processRemindersAndCleanup = async () => {
  try {
    // Process reminders first
    const reminderService = require('../services/reminderService');
    await reminderService.processReminders(proofSessions);
    
    // Then cleanup expired proofs (7d+)
    const now = Date.now();
    const expiryMs = 7 * 24 * 60 * 60 * 1000;
    for (const [proofId, proofData] of proofSessions.entries()) {
      if (now - proofData.createdAt > expiryMs) {
        await fs.promises.unlink(proofData.pdfPath).catch(() => {});
        proofSessions.delete(proofId);
        console.log(`Cleaned up expired proof: ${proofId}`);
      }
    }
  } catch (error) {
    console.error('Error in reminder/cleanup process:', error);
  }
};

// Debug endpoint to check stored proofs
router.get('/debug/proofs', (req, res) => {
  const proofList = [];
  for (const [proofId, proofData] of proofSessions.entries()) {
    proofList.push({
      proofId,
      projectName: proofData.proofData?.projectName,
      createdAt: new Date(proofData.createdAt).toISOString(),
      isExpired: Date.now() > (proofData.createdAt + (7 * 24 * 60 * 60 * 1000)),
      accessToken: proofData.accessToken?.substring(0, 10) + '...'
    });
  }
  res.json({ 
    totalProofs: proofList.length,
    proofs: proofList 
  });
});

// Create test proof endpoint
router.post('/debug/create-test', (req, res) => {
  const testProofId = 'test_proof_' + Date.now();
  const testToken = 'test_token_' + Math.random().toString(36).substring(2) + '_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  
  const testProofData = {
    proofId: testProofId,
    accessToken: testToken,
    proofData: {
      projectName: 'Test Business Cards',
      artProofNumber: 'T001',
      proofVersion: 'v1',
      dateSent: new Date().toLocaleDateString(),
      salesRepFirst: 'Jane',
      salesRepLast: 'Doe',
      clientCompany: 'Test Company',
      customerEmail: 'test@example.com',
      artworkAttachments: []
    },
    trelloCardId: 'fake_card_123',
    pdfPath: './test-proof.pdf',
    proofLink: `http://localhost:3000/proof/${testProofId}?token=${testToken}`,
    createdAt: Date.now(),
    status: 'pending'
  };

  // Store the proof
  proofSessions.set(testProofId, testProofData);
  
  res.json({
    success: true,
    message: 'Test proof created',
    proofId: testProofId,
    proofLink: testProofData.proofLink,
    adminLink: 'http://localhost:3000/proof/admin'
  });
});


// Run reminders every 2 hours
setInterval(router.processRemindersAndCleanup, 2 * 60 * 60 * 1000);

module.exports = router;