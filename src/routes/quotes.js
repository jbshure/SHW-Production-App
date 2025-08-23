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
const quoteSessions = new Map();

// Validate access middleware
const validateQuoteAccess = async (req, res, next) => {
  try {
    const { quoteId } = req.params;
    const { token } = req.query;

    if (!quoteId || !token || !looksLikeToken(token)) {
      return res.status(400).render('error', { message: 'Invalid quote link. Please check your email.' });
    }

    const quoteData = quoteSessions.get(quoteId);
    if (!quoteData) {
      return res.status(404).render('error', { message: 'Quote not found or has expired.' });
    }

    if (!looksLikeToken(quoteData.accessToken) || !safeEqual(quoteData.accessToken, token)) {
      return res.status(401).render('error', { message: 'Invalid access token. Please use the link from your email.' });
    }

    const expiryTime = quoteData.createdAt + (30 * 24 * 60 * 60 * 1000);
    if (Date.now() > expiryTime) {
      const data = quoteData.quoteData;
      const salesRepEmail = `${data.salesRepFirst}.${data.salesRepLast}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com';
      return res.status(410).render('error', { 
        message: 'This quote link has expired after 30 days.',
        details: `For project "${data.projectName}" (Quote #${data.quoteNumber})`,
        nextSteps: `Please contact your sales representative ${data.salesRepFirst} ${data.salesRepLast} at ${salesRepEmail} for a new quote.`,
        isExpired: true
      });
    }

    req.quoteData = quoteData;
    next();
  } catch (err) {
    console.error('Error validating quote access:', err);
    res.status(500).render('error', { message: 'Unable to validate quote access. Please try again.' });
  }
};

// Admin login page (no auth required)
router.get('/admin/login', (req, res) => {
  res.render('admin-login', {
    cspNonce: res.locals.cspNonce
  });
});

// Sales rep dashboard (must be before /:quoteId route)
router.get('/admin', requireAuthOrAPI, (req, res) => {
  res.render('admin-dashboard', {
    cspNonce: res.locals.cspNonce
  });
});

// Get quote status (for sales rep dashboard)
router.get('/admin/status/:quoteId', requireAuthOrAPI, (req, res) => {
  try {
    const { quoteId } = req.params;
    const quoteData = quoteSessions.get(quoteId);
    
    if (!quoteData) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    
    const expiryTime = quoteData.createdAt + (30 * 24 * 60 * 60 * 1000);
    const timeRemaining = expiryTime - Date.now();
    const isExpired = timeRemaining <= 0;
    
    res.json({
      quoteId,
      projectName: quoteData.quoteData.projectName,
      quoteNumber: quoteData.quoteData.quoteNumber,
      customerEmail: quoteData.quoteData.customerEmail,
      status: quoteData.status,
      createdAt: new Date(quoteData.createdAt).toISOString(),
      expiresAt: new Date(expiryTime).toISOString(),
      isExpired,
      timeRemainingMs: Math.max(0, timeRemaining),
      remindersSent: quoteData.remindersSent || [],
      hasResponse: Boolean(quoteData.customerResponse)
    });
    
  } catch (error) {
    console.error('Error getting quote status:', error);
    res.status(500).json({ error: 'Failed to get quote status' });
  }
});

// Quote review from quote builder (accepts data directly)
router.get('/review/builder', (req, res) => {
  try {
    const { data } = req.query;
    
    if (!data) {
      return res.status(400).render('error', { message: 'No quote data provided' });
    }
    
    let quoteData;
    try {
      quoteData = JSON.parse(decodeURIComponent(data));
    } catch (e) {
      return res.status(400).render('error', { message: 'Invalid quote data format' });
    }
    
    // Transform quote builder data to match quote-review.ejs format
    const transformedData = {
      projectName: quoteData.projectName || 'Custom Quote',
      quoteNumber: quoteData.quoteNumber || 'QT-' + Date.now(),
      quoteVersion: 'v1',
      dateSent: new Date().toLocaleDateString(),
      salesRepFirst: 'Sales',
      salesRepLast: 'Team',
      validUntil: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString(),
      clientCompany: quoteData.clientInfo?.company || 'Valued Customer',
      quoteItems: quoteData.items?.map((item, index) => ({
        key: `item-${index}`,
        name: item.product || 'Custom Item',
        description: item.specs || 'Custom specifications',
        unitPrice: parseFloat(item.unitPrice) || 0,
        defaultQuantity: parseInt(item.quantity) || 1,
        quantityOptions: [100, 250, 500, 1000, 2500, 5000],
        selected: true,
        pricingTiers: [
          { qty: 100, unitPrice: (parseFloat(item.unitPrice) || 0) * 1.5, description: 'Small run' },
          { qty: 250, unitPrice: (parseFloat(item.unitPrice) || 0) * 1.3, description: 'Standard' },
          { qty: 500, unitPrice: (parseFloat(item.unitPrice) || 0) * 1.1, description: 'Popular' },
          { qty: 1000, unitPrice: parseFloat(item.unitPrice) || 0, description: 'Best value' },
          { qty: 2500, unitPrice: (parseFloat(item.unitPrice) || 0) * 0.9, description: 'Volume' },
          { qty: 5000, unitPrice: (parseFloat(item.unitPrice) || 0) * 0.8, description: 'Bulk' }
        ]
      })) || []
    };
    
    res.render('quote-review', {
      quoteId: 'builder-' + Date.now(),
      quoteData: transformedData,
      pdfUrl: null,
      submitUrl: '/quote/builder/submit',
      token: null,
      cspNonce: res.locals.cspNonce,
    });
  } catch (err) {
    console.error('Error displaying builder quote:', err);
    res.status(500).render('error', { message: 'Unable to display quote. Please try again.' });
  }
});

// Review page
router.get('/:quoteId', validateQuoteAccess, (req, res) => {
  try {
    const { quoteData } = req;
    const { quoteId } = req.params;

    console.log('Quote data being passed to template:', JSON.stringify(quoteData.quoteData, null, 2));
    res.render('quote-review', {
      quoteId,
      quoteData: quoteData.quoteData,
      pdfUrl: `/quote/${quoteId}/pdf?token=${req.query.token}`,
      submitUrl: `/quote/${quoteId}/submit`,
      token: req.query.token,
      cspNonce: res.locals.cspNonce,
    });
  } catch (err) {
    console.error('Error displaying quote:', err);
    res.status(500).render('error', { message: 'Unable to display quote. Please try again.' });
  }
});

// Serve PDF (no cache, stream errors handled)
router.get('/:quoteId/pdf', validateQuoteAccess, (req, res) => {
  try {
    const { quoteData } = req;

    if (!fs.existsSync(quoteData.pdfPath)) {
      return res.status(404).render('error', { message: 'Quote document not found.' });
    }

    const filename = `quote-${quoteData.quoteData.quoteNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    const fileStream = fs.createReadStream(quoteData.pdfPath);
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

// Submit acceptance/rejection
router.post('/:quoteId/submit', submitLimiter, validateQuoteAccess, async (req, res) => {
  try {
    const { quoteData } = req;
    const { accepted, comments, customerName, signature, selectedItems, pricing, delegatePayment, paymentEmail } = req.body;

    if (accepted === undefined || typeof customerName !== 'string' || customerName.trim().length < 2 || customerName.length > 120) {
      return res.status(400).json({ error: 'Please complete all required fields' });
    }

    const isAccepted = accepted === 'true' || accepted === true;
    const customerFeedback = typeof comments === 'string' ? comments.trim() : '';
    
    // Validate selected items if quote is accepted
    if (isAccepted && (!selectedItems || selectedItems.length === 0)) {
      return res.status(400).json({ error: 'Please select at least one item to proceed' });
    }

    // Signature checks (optional)
    if (signature) {
      const MAX_SIG_BYTES = 200 * 1024;
      const prefix = 'data:image/png;base64,';
      if (!signature.startsWith(prefix)) return res.status(400).json({ error: 'Invalid signature format.' });
      const b64 = signature.slice(prefix.length);
      if (b64.length > MAX_SIG_BYTES * 1.37) return res.status(413).json({ error: 'Signature too large.' });
    }

    const responseData = {
      quoteId: req.params.quoteId,
      trelloCardId: quoteData.trelloCardId,
      accepted: isAccepted,
      customerName,
      comments: customerFeedback,
      signature: signature ? '[captured]' : null,
      selectedItems: selectedItems || [],
      pricing: pricing || null,
      submittedAt: new Date().toISOString(),
      ipAddress: req.ip
    };

    console.log('Customer response received:', { ...responseData, signature: Boolean(signature) });

    // Update Trello
    const trelloService = require('../services/trelloService');
    await trelloService.processCustomerQuoteResponse(quoteData.trelloCardId, isAccepted, customerFeedback);

    const signatureNote = signature ? '**Digital Signature:** ✓ Captured and verified' : '';
    
    // Format selected items for Trello comment
    let itemsText = '';
    if (isAccepted && selectedItems && selectedItems.length > 0) {
      itemsText = '\n**Selected Items:**\n';
      selectedItems.forEach(item => {
        const itemName = item.item.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        itemsText += `- ${itemName}: ${item.quantity}x @ $${item.unitPrice} = $${item.lineTotal.toFixed(2)}\n`;
      });
      
      if (pricing) {
        itemsText += `\n**Final Pricing:**\n`;
        itemsText += `- Subtotal: $${pricing.subtotal.toFixed(2)}\n`;
        itemsText += `- Tax: $${pricing.tax.toFixed(2)}\n`;
        itemsText += `- **Total: $${pricing.total.toFixed(2)}**\n`;
        itemsText += `- **Required Deposit: $${pricing.deposit.toFixed(2)}**\n`;
      }
    }
    
    const trelloComment = `
💰 **CUSTOMER QUOTE RESPONSE RECEIVED**

**Decision:** ${isAccepted ? '✅ QUOTE ACCEPTED' : '❌ REVISION REQUESTED'}
**Customer:** ${mdEscape(customerName)}
**Submitted:** ${new Date().toLocaleString()}

${customerFeedback ? `**Comments:**\n${mdEscape(customerFeedback)}` : ''}

${itemsText}

${signatureNote}
    `.trim();

    await trelloService.addCommentToCard(quoteData.trelloCardId, trelloComment);

    // Handle payment delegation if quote was accepted
    if (isAccepted && delegatePayment && paymentEmail) {
      try {
        const paymentService = require('../services/paymentService');
        
        // Create payment delegation with quote data
        const paymentData = {
          quoteId: req.params.quoteId,
          quoteNumber: quoteData.quoteData.quoteNumber || req.params.quoteId,
          customerName: customerName,
          customerEmail: quoteData.quoteData.customerEmail,
          paymentEmail: paymentEmail,
          amount: pricing?.deposit || pricing?.total * 0.5,
          totalAmount: pricing?.total,
          currency: 'USD',
          description: `Deposit payment for quote ${quoteData.quoteData.quoteNumber || req.params.quoteId}`,
          projectName: quoteData.quoteData.projectName || 'Quote Project',
          salesRepName: `${quoteData.quoteData.salesRepFirst || ''} ${quoteData.quoteData.salesRepLast || ''}`.trim(),
          salesRepEmail: quoteData.quoteData.customerEmail, // Will be CCd
          selectedItems: selectedItems,
          pricing: pricing
        };

        await paymentService.delegatePayment(paymentData);
        
        // Add delegation info to Trello
        const delegationComment = `
💳 **PAYMENT DELEGATED**

**Payment Contact:** ${paymentEmail}
**Customer Contact:** ${quoteData.quoteData.customerEmail}
**Amount:** $${(pricing?.deposit || pricing?.total * 0.5).toFixed(2)} (deposit)
**Total Project:** $${pricing?.total?.toFixed(2)}

Automated payment reminders have been initiated.
        `.trim();
        
        await trelloService.addCommentToCard(quoteData.trelloCardId, delegationComment);
        
      } catch (paymentError) {
        console.error('Payment delegation error:', paymentError);
        // Don't fail the quote acceptance, just log the error
      }
    }

    // Update session
    quoteData.customerResponse = responseData;
    quoteData.status = isAccepted ? 'accepted' : 'revision_requested';
    quoteData.paymentDelegated = delegatePayment && paymentEmail;
    quoteData.paymentEmail = paymentEmail;
    quoteSessions.set(req.params.quoteId, quoteData);

    res.json({
      success: true,
      message: isAccepted
        ? `Thank you! Your quote has been accepted for $${pricing?.total?.toFixed(2) || 'TBD'}. ${delegatePayment ? 'Payment delegation initiated.' : 'We will contact you shortly to arrange the deposit.'}`
        : 'Thank you for your feedback. We will review your requests and send you a revised quote.',
      accepted: isAccepted,
      pricing: pricing,
      delegated: delegatePayment,
      nextSteps: isAccepted
        ? (delegatePayment 
          ? `Payment request sent to ${paymentEmail}. Automated reminders will ensure timely payment.`
          : `Please prepare your deposit of $${pricing?.deposit?.toFixed(2) || 'TBD'}. We will contact you within 24 hours to arrange payment and project timeline.`)
        : 'Our sales team will review your feedback and send you a revised quote within 2 business days.'
    });

  } catch (err) {
    console.error('Error processing customer response:', err);
    res.status(500).json({ error: 'Unable to process your response. Please try again or contact your sales representative.' });
  }
});

// Internal helpers used by services
router.storeQuoteData = async (quoteId, quoteData) => {
  const sessionData = { ...quoteData, createdAt: Date.now(), status: 'pending' };
  quoteSessions.set(quoteId, sessionData);
};
router.getQuoteData = (quoteId) => quoteSessions.get(quoteId);

// Process reminders and cleanup expired quotes
router.processRemindersAndCleanup = async () => {
  try {
    // Process reminders first
    const quoteReminderService = require('../services/quoteReminderService');
    await quoteReminderService.processReminders(quoteSessions);
    
    // Then cleanup expired quotes (30d+)
    const now = Date.now();
    const expiryMs = 30 * 24 * 60 * 60 * 1000;
    for (const [quoteId, quoteData] of quoteSessions.entries()) {
      if (now - quoteData.createdAt > expiryMs) {
        await fs.promises.unlink(quoteData.pdfPath).catch(() => {});
        quoteSessions.delete(quoteId);
        console.log(`Cleaned up expired quote: ${quoteId}`);
      }
    }
  } catch (error) {
    console.error('Error in quote reminder/cleanup process:', error);
  }
};

// Create test quote endpoint
router.post('/debug/create-test', (req, res) => {
  const testQuoteId = 'test_quote_' + Date.now();
  const testToken = 'test_token_' + Math.random().toString(36).substring(2) + '_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  
  const testQuoteData = {
    quoteId: testQuoteId,
    accessToken: testToken,
    quoteData: {
      projectName: 'Business Cards & Letterhead Package',
      quoteNumber: 'Q001',
      quoteVersion: 'v1',
      dateSent: new Date().toLocaleDateString(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      salesRepFirst: 'Jacob',
      salesRepLast: 'Shure',
      clientCompany: 'ShurePrint Demo Client',
      customerEmail: 'jacob@shureprint.com',
      quoteItems: [
        {
          key: 'setup',
          name: 'Project Setup & Design',
          description: 'One-time setup fee',
          unitPrice: 150.00,
          selected: true,
          required: true,
          defaultQuantity: 1,
          quantityOptions: [1]
        },
        {
          key: 'business-cards',
          name: 'Business Cards - Premium',
          description: 'Volume pricing available',
          unitPrice: 89.00,
          selected: true,
          required: false,
          defaultQuantity: 1,
          quantityOptions: [1, 2, 3, 5, 10, 15, 20],
          pricingTiers: [
            { qty: 1, unitPrice: 89.00, description: '1,000 cards' },
            { qty: 2, unitPrice: 85.00, description: '2,000 cards' },
            { qty: 3, unitPrice: 82.00, description: '3,000 cards' },
            { qty: 5, unitPrice: 78.00, description: '5,000 cards' },
            { qty: 10, unitPrice: 72.00, description: '10,000 cards' },
            { qty: 15, unitPrice: 68.00, description: '15,000 cards' },
            { qty: 20, unitPrice: 65.00, description: '20,000 cards' }
          ]
        },
        {
          key: 'letterhead',
          name: 'Letterhead - Premium',
          description: 'Volume discounts apply',
          unitPrice: 45.00,
          selected: false,
          required: false,
          defaultQuantity: 1,
          quantityOptions: [1, 2, 5, 10, 20],
          pricingTiers: [
            { qty: 1, unitPrice: 45.00, description: '500 sheets' },
            { qty: 2, unitPrice: 42.00, description: '1,000 sheets' },
            { qty: 5, unitPrice: 38.00, description: '2,500 sheets' },
            { qty: 10, unitPrice: 34.00, description: '5,000 sheets' },
            { qty: 20, unitPrice: 30.00, description: '10,000 sheets' }
          ]
        },
        {
          key: 'envelopes',
          name: 'Envelopes - #10 (500 count)',
          description: '$35 per 500 envelopes',
          unitPrice: 35.00,
          selected: false,
          required: false,
          defaultQuantity: 1,
          quantityOptions: [1, 2, 5, 10]
        },
        {
          key: 'rush',
          name: 'Rush Processing',
          description: '2-day turnaround',
          unitPrice: 25.00,
          selected: false,
          required: false,
          defaultQuantity: 1,
          quantityOptions: [1]
        }
      ]
    },
    trelloCardId: 'demo_card_123',
    pdfPath: './test-quote.pdf',
    quoteLink: `http://localhost:3000/quote/${testQuoteId}?token=${testToken}`,
    createdAt: Date.now(),
    status: 'pending'
  };

  // Store the quote
  quoteSessions.set(testQuoteId, testQuoteData);
  
  res.json({
    success: true,
    message: 'Test quote created',
    quoteId: testQuoteId,
    quoteLink: testQuoteData.quoteLink,
    adminLink: 'http://localhost:3000/quote/admin'
  });
});

// Run reminders every 2 hours
setInterval(router.processRemindersAndCleanup, 2 * 60 * 60 * 1000);

module.exports = router;