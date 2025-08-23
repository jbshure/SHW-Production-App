const express = require('express');
const crypto = require('crypto');
const trelloService = require('../services/trelloService');
const proofService = require('../services/proofService');

const router = express.Router();

// Middleware to verify Trello webhook signature
const verifyTrelloWebhook = (req, res, next) => {
  const webhookSecret = process.env.TRELLO_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.warn('TRELLO_WEBHOOK_SECRET not configured');
    return next();
  }

  const receivedSignature = req.get('X-Trello-Webhook');
  if (!receivedSignature) {
    return res.status(400).json({ error: 'Missing webhook signature' });
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha1', webhookSecret)
    .update(payload)
    .digest('base64');

  if (receivedSignature !== expectedSignature) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};

// Handle Trello webhook events
router.post('/trello', verifyTrelloWebhook, async (req, res) => {
  try {
    const { action } = req.body;
    
    if (!action) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    console.log(`Received Trello webhook: ${action.type}`);

    // Handle different action types
    switch (action.type) {
      case 'updateCard':
        await handleCardUpdate(action);
        break;
        
      case 'addLabelToCard':
        await handleLabelAdded(action);
        break;
        
      case 'commentCard':
        await handleCardComment(action);
        break;
        
      case 'createCard':
        await handleCardCreated(action);
        break;
        
      default:
        console.log(`Unhandled webhook action: ${action.type}`);
    }

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Handle card updates (mainly list movements)
async function handleCardUpdate(action) {
  const { data, memberCreator } = action;
  const card = data.card;
  
  // Check if card was moved between lists
  if (data.listBefore && data.listAfter) {
    const fromList = data.listBefore.name;
    const toList = data.listAfter.name;
    
    console.log(`Card "${card.name}" moved from "${fromList}" to "${toList}"`);
    
    // Handle proof ready trigger
    if (toList === 'Art Approval' || fromList === 'Quoting') {
      await handleProofReadyTrigger(card.id, memberCreator);
    }
    
    // Handle approved cards - could be moved to production lists
    if (toList === 'Supplier Invoicing, Pre-Prod Sample & Bulk Production' || toList === 'In Production') {
      await handleCardApproved(card.id);
    }
    
    // Handle revision needed cards - moved back to quoting
    if (toList === 'Quoting' && fromList === 'Art Approval') {
      await handleRevisionNeeded(card.id);
    }
  }
}

// Handle labels being added to cards
async function handleLabelAdded(action) {
  const { data } = action;
  const card = data.card;
  const label = data.label;
  
  console.log(`Label "${label.name}" added to card "${card.name}"`);
  
  // Handle "Art Proof Ready" label specifically
  if (label.name === 'Art Proof Ready') {
    await handleProofReadyTrigger(card.id, action.memberCreator);
  }
}

// Handle card comments
async function handleCardComment(action) {
  const { data } = action;
  const card = data.card;
  const comment = data.text;
  
  console.log(`Comment added to card "${card.name}": ${comment.substring(0, 50)}...`);
  
  // Check for customer feedback patterns
  if (comment.includes('Customer feedback:') || comment.includes('CUSTOMER_RESPONSE:')) {
    await handleCustomerFeedback(card.id, comment);
  }
}

// Handle new card creation
async function handleCardCreated(action) {
  const { data } = action;
  const card = data.card;
  
  console.log(`New card created: "${card.name}"`);
  
  // Add any initial setup for new project cards
  // This could include adding standard checklists, labels, etc.
}

// Handle proof ready trigger
async function handleProofReadyTrigger(cardId, triggeredBy) {
  try {
    console.log(`Processing proof ready trigger for card ${cardId}`);
    
    // Get card details
    const card = await trelloService.getCard(cardId);
    
    // Generate proof document
    const proofData = await proofService.generateProof(card);
    
    // Store proof data for customer access
    const proofRoutes = require('./proofs');
    await proofRoutes.storeProofData(proofData.proofId, proofData);
    
    // Update Trello card with proof information and link
    await trelloService.processProofReady(cardId, proofData.proofLink);
    
    // Send proof to customer
    await proofService.sendProofToCustomer(proofData, card);
    
    console.log(`Proof generated and sent for card ${cardId}`);
  } catch (error) {
    console.error(`Error processing proof ready for card ${cardId}:`, error);
    
    // Add error comment to card
    await trelloService.addCommentToCard(
      cardId, 
      `❌ Error generating proof: ${error.message}`
    );
  }
}

// Handle card approved
async function handleCardApproved(cardId) {
  try {
    console.log(`Processing approval for card ${cardId}`);
    
    // Notify production team
    const card = await trelloService.getCard(cardId);
    await proofService.notifyProductionTeam(card);
    
    console.log(`Production team notified for approved card ${cardId}`);
  } catch (error) {
    console.error(`Error processing approval for card ${cardId}:`, error);
  }
}

// Handle revision needed
async function handleRevisionNeeded(cardId) {
  try {
    console.log(`Processing revision needed for card ${cardId}`);
    
    // Notify design team
    const card = await trelloService.getCard(cardId);
    await proofService.notifyDesignTeam(card);
    
    console.log(`Design team notified for revision needed card ${cardId}`);
  } catch (error) {
    console.error(`Error processing revision needed for card ${cardId}:`, error);
  }
}

// Handle customer feedback from external sources
async function handleCustomerFeedback(cardId, feedback) {
  try {
    console.log(`Processing customer feedback for card ${cardId}`);
    
    // Parse feedback to determine if it's approval or rejection
    const isApproval = feedback.toLowerCase().includes('approved') || 
                      feedback.toLowerCase().includes('accept');
    
    await trelloService.processCustomerApproval(cardId, isApproval, feedback);
    
    console.log(`Customer feedback processed for card ${cardId}: ${isApproval ? 'Approved' : 'Revision needed'}`);
  } catch (error) {
    console.error(`Error processing customer feedback for card ${cardId}:`, error);
  }
}

// Test webhook endpoint for development
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoint is active',
    timestamp: new Date().toISOString(),
    webhookUrl: `${req.protocol}://${req.get('host')}/webhooks/trello`
  });
});

module.exports = router;