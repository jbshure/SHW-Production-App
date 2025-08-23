const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { fileTypeFromFile } = require('file-type');
const { authenticateAPI } = require('../middleware/auth');
const trelloService = require('../services/trelloService');
const proofService = require('../services/proofService');
const proofRoutes = require('./proofs');
const pdfService = require('../services/pdfService');

const router = express.Router();

// Prevent crawling
router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
});

// Burst limiter on hot endpoints
const burstLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(['/projects', '/projects/:cardId', '/projects/:cardId/upload', '/projects/:cardId/generate-proof', '/projects/:cardId/move', '/projects/:cardId/comments'], burstLimiter);

// Upload storage (absolute path)
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await fs.promises.mkdir(uploadRoot, { recursive: true }).catch(() => {});
    cb(null, uploadRoot);
  },
  filename: (req, file, cb) => {
    const base = path.basename(file.originalname, path.extname(file.originalname)).slice(0, 80);
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${suffix}${path.extname(file.originalname).toLowerCase()}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: +(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024) }, // 10MB
});

// ALLOWED MIME for magic-byte check
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);

// Get Trello stats for home page
router.get('/trello/stats', async (req, res) => {
  try {
    // Fetch board cards
    const cards = await trelloService.getBoardCards();
    
    // Calculate stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const stats = {
      activeCards: 0,
      pendingApprovals: 0,
      monthlyProjects: 0,
      recentActivity: []
    };
    
    // Process cards for stats
    cards.forEach(card => {
      // Count active cards (not in Done list)
      if (!card.list?.toLowerCase().includes('done') && !card.list?.toLowerCase().includes('complete')) {
        stats.activeCards++;
      }
      
      // Count pending approvals
      if (card.list?.toLowerCase().includes('approval') || card.list?.toLowerCase().includes('review')) {
        stats.pendingApprovals++;
      }
      
      // Count monthly projects
      const cardDate = new Date(card.dateLastActivity || card.due);
      if (cardDate >= startOfMonth) {
        stats.monthlyProjects++;
      }
      
      // Add to recent activity (last 10 cards)
      if (stats.recentActivity.length < 10) {
        stats.recentActivity.push({
          title: card.name,
          list: card.list || 'Unknown',
          date: card.dateLastActivity,
          type: determineActivityType(card),
          labels: card.labels?.slice(0, 2).map(l => ({ name: l.name, color: l.color }))
        });
      }
    });
    
    // Sort recent activity by date
    stats.recentActivity.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching Trello stats:', error);
    // Return default values on error
    res.json({
      activeCards: 0,
      pendingApprovals: 0,
      monthlyProjects: 0,
      recentActivity: []
    });
  }
});

function determineActivityType(card) {
  const list = (card.list || '').toLowerCase();
  if (list.includes('new')) return 'new';
  if (list.includes('progress')) return 'in_progress';
  if (list.includes('complete') || list.includes('done')) return 'completed';
  if (list.includes('urgent')) return 'urgent';
  if (card.dateLastActivity) {
    const hoursSinceUpdate = (Date.now() - new Date(card.dateLastActivity)) / (1000 * 60 * 60);
    if (hoursSinceUpdate < 24) return 'moved';
  }
  return 'default';
}

// List projects
router.get('/projects', authenticateAPI, async (req, res) => {
  try {
    const cards = await trelloService.getBoardCards();
    const projects = cards.map(card => ({
      id: card.id,
      name: card.name,
      listName: card.list?.name || 'Unknown',
      description: card.desc,
      labels: (card.labels || []).map(l => ({ id: l.id, name: l.name, color: l.color })),
      members: (card.members || []).map(m => ({ id: m.id, fullName: m.fullName, username: m.username })),
      attachments: (card.attachments || []).length,
      dueDate: card.due,
      url: card.url,
      lastActivity: card.dateLastActivity
    }));
    res.json({ success: true, count: projects.length, projects });
  } catch (e) {
    console.error('Error fetching projects:', e);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get one project
router.get('/projects/:cardId', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    if (!cardId || cardId.length < 8) return res.status(400).json({ error: 'Invalid cardId' });
    const card = await trelloService.getCard(cardId);

    const project = {
      id: card.id,
      name: card.name,
      listName: card.list?.name || 'Unknown',
      description: card.desc,
      labels: card.labels || [],
      members: card.members || [],
      attachments: card.attachments || [],
      checklists: card.checklists || [],
      customFieldItems: card.customFieldItems || [],
      dueDate: card.due,
      url: card.url,
      lastActivity: card.dateLastActivity,
      actions: Array.isArray(card.actions) ? card.actions.slice(0, 10) : []
    };
    res.json({ success: true, project });
  } catch (e) {
    console.error('Error fetching project:', e);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Generate proof
router.post('/projects/:cardId/generate-proof', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = await trelloService.getCard(cardId);
    if (!card) return res.status(404).json({ error: 'Project not found' });

    const proofData = await proofService.generateProof(card);
    await proofRoutes.storeProofData(proofData.proofId, proofData);

    await trelloService.processProofReady(cardId, proofData.proofLink);
    await proofService.sendProofToCustomer(proofData, card);

    res.json({
      success: true,
      message: 'Proof generated and sent successfully',
      proofId: proofData.proofId,
      proofLink: proofData.proofLink
      // Do NOT return pdfPath publicly
    });
  } catch (e) {
    console.error('Error generating proof:', e);
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

// Upload artwork files
router.post('/projects/:cardId/upload', authenticateAPI, upload.array('files', 10), async (req, res) => {
  try {
    const { cardId } = req.params;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

    const card = await trelloService.getCard(cardId);
    if (!card) return res.status(404).json({ error: 'Project not found' });

    const validated = [];
    for (const f of files) {
      const type = await fileTypeFromFile(f.path).catch(() => null);
      const mime = type?.mime || f.mimetype;
      if (!ALLOWED_MIME.has(mime)) {
        await fs.promises.unlink(f.path).catch(() => {});
        return res.status(415).json({ error: `Unsupported file type: ${mime || 'unknown'}` });
      }
      validated.push({ originalName: f.originalname, size: f.size, mimetype: mime });
    }

    const comment = `📎 Files uploaded via API:\n${validated.map(f => `• ${f.originalName}`).join('\n')}`;
    await trelloService.addCommentToCard(cardId, comment);

    res.json({ success: true, message: `${validated.length} file(s) uploaded`, files: validated });
  } catch (e) {
    console.error('Error uploading files:', e);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Update proof and resend by proof ID
router.post('/proof/update-by-proof-id/:proofId', async (req, res) => {
  try {
    const { proofId } = req.params;
    const { salesRepEmail } = req.body;
    
    // Basic auth check
    if (!salesRepEmail || !salesRepEmail.endsWith('@shureprint.com')) {
      return res.status(401).json({ error: 'Unauthorized - Sales rep email required' });
    }

    // Find the proof data to get the card ID
    const proofRoutes = require('./proofs');
    const existingProofData = proofRoutes.getProofData(proofId);
    
    if (!existingProofData) {
      return res.status(404).json({ error: 'Proof not found' });
    }

    const cardId = existingProofData.trelloCardId;
    const card = await trelloService.getCard(cardId);
    if (!card) return res.status(404).json({ error: 'Associated project not found' });

    // Generate new proof (this creates a new version)
    const proofData = await proofService.generateProof(card);
    
    // Store new proof data (this will replace the old session data with same proofId)
    await proofRoutes.storeProofData(proofData.proofId, proofData);

    // Update Trello with new proof
    await trelloService.processProofReady(cardId, proofData.proofLink);
    
    // Add comment about proof update
    await trelloService.addCommentToCard(cardId, 
      `🔄 **PROOF UPDATED** - New proof version ${proofData.proofData.proofVersion} generated and sent by ${salesRepEmail}`);
    
    // Send updated proof to customer
    await proofService.sendProofToCustomer(proofData, card);

    res.json({
      success: true,
      message: 'Proof updated and resent successfully',
      proofId: proofData.proofId,
      proofLink: proofData.proofLink,
      version: proofData.proofData.proofVersion,
      cardId
    });

  } catch (error) {
    console.error('Error updating proof by proof ID:', error);
    res.status(500).json({ error: 'Failed to update proof' });
  }
});

// Update proof and resend by card ID (for revisions)
router.post('/proof/:cardId/update', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const card = await trelloService.getCard(cardId);
    if (!card) return res.status(404).json({ error: 'Project not found' });

    // Get existing proof data to find previous proof ID if it exists
    const proofRoutes = require('./proofs');
    let existingProofId = null;
    
    // Find existing proof for this card - we need access to the sessions Map
    // Since it's not exposed, we'll just generate a new proof and let cleanup happen naturally
    
    // Generate new proof (this creates a new version)
    const proofData = await proofService.generateProof(card);
    
    // Store new proof data
    await proofRoutes.storeProofData(proofData.proofId, proofData);

    // Update Trello with new proof
    await trelloService.processProofReady(cardId, proofData.proofLink);
    
    // Add comment about proof update
    await trelloService.addCommentToCard(cardId, 
      `🔄 **PROOF UPDATED** - New proof version ${proofData.proofData.proofVersion} generated and sent to customer`);
    
    // Send updated proof to customer
    await proofService.sendProofToCustomer(proofData, card);

    res.json({
      success: true,
      message: 'Proof updated and resent successfully',
      proofId: proofData.proofId,
      proofLink: proofData.proofLink,
      version: proofData.proofData.proofVersion
    });

  } catch (error) {
    console.error('Error updating proof:', error);
    res.status(500).json({ error: 'Failed to update proof' });
  }
});

// Send quote email endpoint
router.post('/send-quote-email', async (req, res) => {
  try {
    const { to, customerName, projectName, quoteNumber, totalAmount, portalUrl, deliveryTime, salesRep, salesEmail } = req.body;
    
    if (!to || !customerName || !projectName || !quoteNumber) {
      return res.status(400).json({ error: 'Missing required fields: to, customerName, projectName, quoteNumber' });
    }
    
    const nodemailer = require('nodemailer');
    
    // Create SMTP transporter using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
    
    // Create email HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
        <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
          <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">SHUREPRINT</h1>
          <p style="color: #666666; margin: 5px 0; font-size: 14px;">Your Quote is Ready</p>
        </div>
        
        <div style="padding: 30px 20px; background-color: #FFF9F0;">
          <h2 style="color: #111111; margin-top: 0;">Hello ${customerName},</h2>
          <p style="color: #333333;">Thank you for choosing SHUREPRINT for your <strong style="color: #111111;">${projectName}</strong> project!</p>
          
          <div style="background-color: #FAF9F7; border: 1px solid #E2DFDA; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <strong style="color: #111111;">Quote Details:</strong><br>
            <span style="color: #333333;">Quote Number: </span><strong style="color: #111111;">${quoteNumber}</strong><br>
            <span style="color: #333333;">Total Amount: </span><strong style="color: #111111;">${totalAmount}</strong><br>
            <span style="color: #333333;">Estimated Delivery: </span><strong style="color: #111111;">${deliveryTime || '1-2 weeks'}</strong>
          </div>
          
          <p style="color: #333333;"><strong style="color: #111111;">Next Steps:</strong></p>
          <ol style="color: #333333;">
            <li>Review your quote details</li>
            <li>Select your preferred quantity</li>
            <li>Complete secure payment to begin production</li>
          </ol>
          
          ${portalUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="background-color: #E3FF33; color: #111111; padding: 15px 30px; border: 2px solid #111111; text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; font-size: 14px; letter-spacing: 0.5px;">
              REVIEW & APPROVE QUOTE
            </a>
          </div>
          ` : ''}
          
          <p style="color: #333333;">Questions? Contact ${salesRep || 'our team'} at ${salesEmail || 'quotes@shureprint.com'}</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #E2DFDA;">
          <p style="font-size: 12px; color: #666666;">
            Best regards,<br>The SHUREPRINT Team
          </p>
        </div>
      </div>
    `;
    
    // Send email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: `Your SHUREPRINT Quote ${quoteNumber} - Review & Approve`,
      html: emailHtml,
      text: `Hello ${customerName},

Thank you for choosing SHUREPRINT for your ${projectName} project!

Quote Details:
- Quote Number: ${quoteNumber}
- Total Amount: ${totalAmount}
- Estimated Delivery: ${deliveryTime || '1-2 weeks'}

Next Steps:
1. Review your quote details
2. Select your preferred quantity
3. Complete secure payment to begin production

${portalUrl ? `Review & Approve: ${portalUrl}` : ''}

Questions? Contact ${salesRep || 'our team'} at ${salesEmail || 'quotes@shureprint.com'}

Best regards,
The SHUREPRINT Team`
    });
    
    console.log('Quote email sent:', info.messageId);
    res.json({ 
      success: true, 
      message: `Quote email sent successfully to ${to}`,
      messageId: info.messageId
    });
    
  } catch (error) {
    console.error('Error sending quote email:', error);
    res.status(500).json({ 
      error: 'Failed to send email: ' + error.message,
      success: false
    });
  }
});

// Test email endpoint - send sample proof email
router.post('/test-email', authenticateAPI, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address required in request body' });
    }

    console.log(`Generating test email for: ${email}`);
    
    // Create mock proof data
    const mockProofData = {
      proofId: `test_proof_${Date.now()}`,
      proofLink: `${process.env.BASE_URL || 'http://localhost:3000'}/proof/test_${Date.now()}?token=test-token-123`,
      pdfPath: null, // No PDF attachment for test
      proofData: {
        projectName: 'Test Project - Business Cards',
        artProofNumber: 'TEST-001',
        proofVersion: 'v1',
        dateSent: new Date().toLocaleDateString(),
        salesRepFirst: 'John',
        salesRepLast: 'Doe', 
        clientCompany: 'Test Company',
        customerEmail: email,
        artworkAttachments: [
          {
            id: 'test-artwork',
            name: 'business-card-design.pdf',
            url: 'https://drive.google.com/file/d/sample'
          }
        ]
      }
    };

    // Create mock card object
    const mockCard = {
      id: 'test-card-123',
      name: 'Test Project - Business Cards',
      desc: `Test project for ${email}`
    };

    // Send test email using the proof service
    const proofService = require('../services/proofService');
    await proofService.sendProofToCustomer(mockProofData, mockCard);

    res.json({
      success: true,
      message: `Test proof email sent to ${email}`,
      proofLink: mockProofData.proofLink
    });
  } catch (e) {
    console.error('Error sending test email:', e);
    res.status(500).json({ error: 'Failed to send test email: ' + e.message });
  }
});

// Board metadata
router.get('/board/metadata', authenticateAPI, async (req, res) => {
  try {
    const [lists, labels, board] = await Promise.all([
      trelloService.getBoardLists(),
      trelloService.getBoardLabels(),
      trelloService.getBoardInfo()
    ]);
    res.json({
      success: true,
      board: { id: board.id, name: board.name, url: board.url },
      lists: (lists || []).map(l => ({ id: l.id, name: l.name, position: l.pos })),
      labels: (labels || []).map(lb => ({ id: lb.id, name: lb.name, color: lb.color }))
    });
  } catch (e) {
    console.error('Error fetching board metadata:', e);
    res.status(500).json({ error: 'Failed to fetch board metadata' });
  }
});

// Board cards (no auth required for admin dashboard)
router.get('/board/cards', async (req, res) => {
  try {
    const cards = await trelloService.getBoardCards();
    const lists = await trelloService.getBoardLists();
    
    // Create a map of list IDs to names for easier lookup
    const listMap = {};
    (lists || []).forEach(list => {
      listMap[list.id] = list.name;
    });
    
    // Enhance cards with list names and filter out closed cards
    const enhancedCards = (cards || [])
      .filter(card => !card.closed)
      .map(card => ({
        id: card.id,
        name: card.name,
        idShort: card.idShort,
        listId: card.idList,
        listName: listMap[card.idList] || 'Unknown List',
        due: card.due,
        labels: (card.labels || []).map(label => ({ name: label.name, color: label.color }))
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically
    
    res.json({
      success: true,
      cards: enhancedCards,
      total: enhancedCards.length
    });
  } catch (e) {
    console.error('Error fetching board cards:', e);
    res.status(500).json({ error: 'Failed to fetch board cards' });
  }
});

// Move project
router.post('/projects/:cardId/move', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { listId, listName } = req.body || {};
    if (!listId && !listName) return res.status(400).json({ error: 'Missing list information' });

    let targetListId = listId;
    if (!targetListId && listName) {
      const lists = await trelloService.getBoardLists();
      const targetList = (lists || []).find(list => list.name === listName);
      if (!targetList) return res.status(404).json({ error: `No list found with name: ${listName}` });
      targetListId = targetList.id;
    }

    const result = await trelloService.moveCardToList(cardId, targetListId);
    res.json({ success: true, message: 'Project moved successfully', cardId: result.id, newListId: result.idList });
  } catch (e) {
    console.error('Error moving project:', e);
    res.status(500).json({ error: 'Failed to move project' });
  }
});

// Add comment
router.post('/projects/:cardId/comments', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { comment } = req.body || {};
    if (!comment) return res.status(400).json({ error: 'Comment required' });

    const result = await trelloService.addCommentToCard(cardId, comment);
    res.json({ success: true, message: 'Comment added successfully', commentId: result.id });
  } catch (e) {
    console.error('Error adding comment:', e);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Update project (description and recipients) - syncs with Trello
router.post('/projects/:cardId/update', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { description, recipients } = req.body || {};
    
    if (!description && !recipients) {
      return res.status(400).json({ error: 'Description or recipients required' });
    }

    // Update Trello card description
    if (description) {
      await trelloService.updateCardDescription(cardId, description);
    }

    // Add comment about recipient updates if provided
    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      const recipientComment = `📧 Recipients updated via admin dashboard:\n${recipients.join('\n')}`;
      await trelloService.addCommentToCard(cardId, recipientComment);
    }

    res.json({ 
      success: true, 
      message: 'Project updated successfully',
      description: description || null,
      recipients: recipients || []
    });
  } catch (e) {
    console.error('Error updating project:', e);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Proof status
router.get('/proofs/:proofId/status', authenticateAPI, async (req, res) => {
  try {
    const { proofId } = req.params;
    const proofData = proofRoutes.getProofData(proofId);
    if (!proofData) return res.status(404).json({ error: 'Proof not found' });

    res.json({
      success: true,
      proofId,
      status: proofData.status || 'pending',
      createdAt: proofData.createdAt,
      customerResponse: proofData.customerResponse || null,
      proofData: {
        projectName: proofData.proofData.projectName,
        artProofNumber: proofData.proofData.artProofNumber,
        clientCompany: proofData.proofData.clientCompany,
        proofVersion: proofData.proofData.proofVersion
      }
    });
  } catch (e) {
    console.error('Error getting proof status:', e);
    res.status(500).json({ error: 'Failed to get proof status' });
  }
});

// Create quote with Trello card and PDF attachment
router.post('/quotes/create', authenticateAPI, async (req, res) => {
  try {
    const { quoteData, createTrelloCard = true, attachPDF = true } = req.body;
    
    if (!quoteData) {
      return res.status(400).json({ error: 'Quote data required' });
    }

    // Validate required fields
    const requiredFields = ['quoteNumber', 'projectName', 'clientCompany', 'customerEmail', 'salesRepFirst', 'salesRepLast'];
    for (const field of requiredFields) {
      if (!quoteData[field]) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    let trelloCard = null;
    let pdfBuffer = null;

    // Generate PDF if needed
    if (attachPDF || !createTrelloCard) {
      try {
        pdfBuffer = await pdfService.generateQuotePDF(quoteData);
        console.log('Quote PDF generated successfully');
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError);
        // Continue without PDF - don't fail the whole process
      }
    }

    // Create Trello card with PDF attachment
    if (createTrelloCard) {
      try {
        trelloCard = await trelloService.createQuoteCard(quoteData, pdfBuffer);
        console.log(`Trello card created: ${trelloCard.id}`);
      } catch (trelloError) {
        console.error('Error creating Trello card:', trelloError);
        // Don't fail the whole request if Trello fails
      }
    }

    // Store quote data in session (if using the quote review system)
    const quoteId = `quote_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const accessToken = require('crypto').randomBytes(32).toString('base64url');
    
    // Store in quotes session if quotes router is available
    try {
      const quotesRouter = require('./quotes');
      if (quotesRouter && quotesRouter.storeQuoteSession) {
        quotesRouter.storeQuoteSession(quoteId, {
          quoteId,
          accessToken,
          quoteData,
          trelloCardId: trelloCard?.id || null,
          createdAt: Date.now(),
          status: 'pending'
        });
      }
    } catch (e) {
      console.log('Quote session storage not available');
    }

    res.json({
      success: true,
      message: 'Quote created successfully',
      quoteId,
      trelloCardId: trelloCard?.id || null,
      trelloCardUrl: trelloCard?.url || null,
      pdfGenerated: !!pdfBuffer,
      quoteReviewUrl: `/quote/${quoteId}?token=${accessToken}`
    });
  } catch (error) {
    console.error('Error creating quote:', error);
    res.status(500).json({ error: 'Failed to create quote', details: error.message });
  }
});

// Update existing Trello card with quote PDF
router.post('/projects/:cardId/attach-quote', authenticateAPI, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { quoteData } = req.body;
    
    if (!quoteData) {
      return res.status(400).json({ error: 'Quote data required' });
    }

    // Get the card to verify it exists
    const card = await trelloService.getCard(cardId);
    if (!card) {
      return res.status(404).json({ error: 'Trello card not found' });
    }

    // Generate PDF
    const pdfBuffer = await pdfService.generateQuotePDF(quoteData);
    
    // Attach PDF to existing card
    const attachment = await trelloService.attachFileToCard(cardId, {
      file: pdfBuffer,
      name: `Quote_${quoteData.quoteNumber}_${new Date().toISOString().split('T')[0]}.pdf`
    });

    // Add comment about the quote
    await trelloService.addCommentToCard(cardId, 
      `📄 **Quote Attached**\n` +
      `Quote #: ${quoteData.quoteNumber}\n` +
      `Total: $${quoteData.totalAmount || 'TBD'}\n` +
      `Valid Until: ${quoteData.validUntil}`
    );

    res.json({
      success: true,
      message: 'Quote PDF attached to card successfully',
      attachmentId: attachment.id,
      attachmentUrl: attachment.url
    });
  } catch (error) {
    console.error('Error attaching quote to card:', error);
    res.status(500).json({ error: 'Failed to attach quote', details: error.message });
  }
});

// Create webhook (restrict hosts)
router.post('/webhooks/create', authenticateAPI, async (req, res) => {
  try {
    const { callbackUrl } = req.body || {};
    if (!callbackUrl) return res.status(400).json({ error: 'Callback URL required' });

    const ALLOWED_WEBHOOK_HOSTS = (process.env.WEBHOOK_HOSTS || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    let u;
    try {
      u = new URL(callbackUrl);
      if (u.protocol !== 'https:') return res.status(400).json({ error: 'Callback must be HTTPS' });
      if (!ALLOWED_WEBHOOK_HOSTS.includes(u.hostname)) {
        return res.status(400).json({ error: 'Callback host not allowed' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid callback URL' });
    }

    const webhook = await trelloService.createWebhook(callbackUrl);
    res.json({ success: true, message: 'Webhook created successfully', webhookId: webhook.id, callbackUrl: webhook.callbackURL });
  } catch (e) {
    console.error('Error creating webhook:', e);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

// Multer error handler
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large' });
    if (error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files' });
  }
  next(error);
});

module.exports = router;