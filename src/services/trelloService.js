const axios = require('axios');

class TrelloService {
  constructor(config = null) {
    // Use provided config or try to get it
    if (!config) {
      try {
        const { getConfig } = require('../config/firebase-config');
        config = getConfig();
      } catch (error) {
        config = process.env;
      }
    }
    
    this.apiKey  = config.TRELLO_API_KEY || process.env.TRELLO_API_KEY;
    this.token   = config.TRELLO_TOKEN || process.env.TRELLO_API_TOKEN;
    this.boardId = config.TRELLO_BOARD_ID || process.env.TRELLO_BOARD_ID;

    if (!this.apiKey || !this.token || !this.boardId) {
      throw new Error('Missing TRELLO_API_KEY/TRELLO_API_TOKEN/TRELLO_BOARD_ID');
    }

    this.client = axios.create({
      baseURL: 'https://api.trello.com/1',
      timeout: 15000,
    });

    // Always append key/token as query params
    this.client.interceptors.request.use((config) => {
      config.params = { ...(config.params || {}), key: this.apiKey, token: this.token };
      return config;
    });

    // Simple retry on 429/5xx
    this.client.interceptors.response.use(undefined, async (error) => {
      const { response, config } = error || {};
      if (!response || !config) throw error;
      const status = response.status;
      const shouldRetry = status === 429 || (status >= 500 && status < 600);
      config.__retryCount = config.__retryCount || 0;
      if (shouldRetry && config.__retryCount < 3) {
        config.__retryCount += 1;
        const retryAfterHeader = response.headers?.['retry-after'];
        const wait = retryAfterHeader ? Number(retryAfterHeader) * 1000 : (500 * config.__retryCount);
        await new Promise(r => setTimeout(r, wait));
        return this.client(config);
      }
      throw error;
    });

    this.cache = { lists: { at: 0, data: null }, labels: { at: 0, data: null } };
  }

  async getBoardCards() {
    const { data } = await this.client.get(`/boards/${this.boardId}/cards`, {
      params: { fields: 'all', attachments: true, members: true, labels: true }
    });
    return data;
  }

  async getBoardInfo() {
    const { data } = await this.client.get(`/boards/${this.boardId}`, {
      params: { fields: 'name,desc,url' }
    });
    return data;
  }

  async getCard(cardId) {
    const { data } = await this.client.get(`/cards/${cardId}`, {
      params: {
        fields: 'all',
        attachments: true,
        members: true,
        labels: true,
        customFieldItems: true,
        actions: 'commentCard',
        actions_limit: 100,
      }
    });
    return data;
  }

  async moveCardToList(cardId, listId) {
    const { data } = await this.client.put(`/cards/${cardId}`, null, { params: { idList: listId } });
    return data;
  }

  async addCommentToCard(cardId, comment) {
    const { data } = await this.client.post(`/cards/${cardId}/actions/comments`, null, { params: { text: comment } });
    return data;
  }

  async addLabelToCard(cardId, labelId) {
    const { data } = await this.client.post(`/cards/${cardId}/idLabels`, null, { params: { value: labelId } });
    return data;
  }

  async removeLabelFromCard(cardId, labelId) {
    const { data } = await this.client.delete(`/cards/${cardId}/idLabels/${labelId}`);
    return data;
  }

  async removeAllProofLabelsFromCard(cardId) {
    // Remove existing proof status labels before adding new ones
    const proofLabelNames = [
      'PROOF APPROVED', 'PROOF REVISION NEEDED', 'PROOF SENT', 
      'EXPIRED', 'EXTENDED'
    ];
    
    try {
      const labels = await this.getBoardLabels();
      const card = await this.getCard(cardId);
      
      for (const cardLabel of card.labels) {
        if (proofLabelNames.includes(cardLabel.name.toUpperCase())) {
          await this.removeLabelFromCard(cardId, cardLabel.id);
        }
      }
    } catch (error) {
      console.warn('Could not remove existing proof labels:', error.message);
    }
  }

  async updateProofStatusLabels(cardId, status, additionalInfo = {}) {
    try {
      const labels = await this.getBoardLabels();
      
      // Remove existing proof status labels first
      await this.removeAllProofLabelsFromCard(cardId);
      
      // Define label mappings based on status
      const labelMappings = {
        'proof_sent': ['PROOF SENT'],
        'approved': ['PROOF APPROVED'],
        'revision_needed': ['PROOF REVISION NEEDED'],
        'expired': ['EXPIRED'],
        'extended': ['EXTENDED']
      };
      
      const labelsToAdd = labelMappings[status] || [];
      
      // Add relevant labels
      for (const labelName of labelsToAdd) {
        const label = labels.find(l => l.name.toUpperCase() === labelName.toUpperCase());
        if (label) {
          await this.addLabelToCard(cardId, label.id);
          console.log(`Added label "${labelName}" to card ${cardId}`);
        } else {
          console.warn(`Label "${labelName}" not found on board - please create it`);
        }
      }
      
      // Add time-sensitive labels for expired/extended proofs
      if (status === 'extended' && additionalInfo.extendDays) {
        const extendDays = additionalInfo.extendDays;
        const urgencyLabel = extendDays <= 3 ? 'URGENT' : extendDays <= 7 ? 'HIGH PRIORITY' : null;
        
        if (urgencyLabel) {
          const label = labels.find(l => l.name.toUpperCase() === urgencyLabel.toUpperCase());
          if (label) {
            await this.addLabelToCard(cardId, label.id);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error updating proof status labels:', error.message);
      return false;
    }
  }

  async setCardDueDate(cardId, dueISO) {
    const { data } = await this.client.put(`/cards/${cardId}`, null, { params: { due: dueISO } });
    return data;
  }

  async updateCardDescription(cardId, newDescription) {
    const { data } = await this.client.put(`/cards/${cardId}`, null, { params: { desc: newDescription } });
    return data;
  }

  async setCustomFieldValue(cardId, customFieldId, value) {
    const { data } = await this.client.put(`/cards/${cardId}/customField/${customFieldId}/item`, {
      value: { text: value }
    });
    return data;
  }

  async getCustomFields() {
    const { data } = await this.client.get(`/boards/${this.boardId}/customFields`);
    return data;
  }

  async createChecklist(cardId, name, items = []) {
    const { data: checklist } = await this.client.post(`/checklists`, null, { params: { idCard: cardId, name } });
    for (const item of items) {
      await this.client.post(`/checklists/${checklist.id}/checkItems`, null, { params: { name: item } });
    }
    return checklist;
  }

  async getBoardLists() {
    const now = Date.now();
    if (this.cache.lists.data && now - this.cache.lists.at < 60_000) return this.cache.lists.data;
    const { data } = await this.client.get(`/boards/${this.boardId}/lists`);
    this.cache.lists = { at: now, data };
    return data;
  }

  async getBoardLabels() {
    const now = Date.now();
    if (this.cache.labels.data && now - this.cache.labels.at < 60_000) return this.cache.labels.data;
    const { data } = await this.client.get(`/boards/${this.boardId}/labels`);
    this.cache.labels = { at: now, data };
    return data;
  }

  async createWebhook(callbackUrl) {
    const { data } = await this.client.post(`/webhooks`, null, {
      params: { description: 'Art Proof Webhook', callbackURL: callbackUrl, idModel: this.boardId }
    });
    return data;
  }

  async processProofReady(cardId, proofLink = null) {
    const lists = await this.getBoardLists();
    const listName = process.env.TRELLO_LIST_ART_APPROVAL || 'Art Approval';
    const proofSentList = lists.find(list => list.name === listName);
    if (!proofSentList) throw new Error(`${listName} list not found`);

    await this.moveCardToList(cardId, proofSentList.id);
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + 48);
    await this.setCardDueDate(cardId, dueDate.toISOString());
    
    // Auto-apply PROOF SENT label
    await this.updateProofStatusLabels(cardId, 'proof_sent');
    
    // Add proof link to description and custom field if provided
    if (proofLink) {
      await this.addProofLinkToCard(cardId, proofLink);
    }
    
    await this.addCommentToCard(cardId, 'Proof generated and sent to customer for approval.');
    return true;
  }

  async addProofLinkToCard(cardId, proofLink) {
    try {
      // Get current card to read existing description
      const card = await this.getCard(cardId);
      const currentDescription = card.desc || '';
      
      // Add proof link section to description
      const proofSection = `\n\n---\n**🎯 PROOF REVIEW LINK**\n${proofLink}\n---`;
      const newDescription = currentDescription + proofSection;
      
      // Update card description
      await this.updateCardDescription(cardId, newDescription);
      
      // Try to find and update "Art Approval" custom field
      try {
        const customFields = await this.getCustomFields();
        const artApprovalField = customFields.find(field => 
          field.name === 'Art Approval' || field.name === 'Art Proof Link'
        );
        
        if (artApprovalField) {
          await this.setCustomFieldValue(cardId, artApprovalField.id, proofLink);
          console.log(`Updated Art Approval custom field with proof link`);
        } else {
          console.warn('Art Approval custom field not found - please create it manually');
        }
      } catch (customFieldError) {
        console.warn('Could not update custom field:', customFieldError.message);
      }
      
    } catch (error) {
      console.error('Error adding proof link to card:', error.message);
      // Don't throw - this shouldn't stop the proof process
    }
  }

  async processCustomerApproval(cardId, approved, feedback = '') {
    const lists = await this.getBoardLists();

    if (approved) {
      // Move to approved list
      const approvedListName = process.env.TRELLO_LIST_APPROVED || 'Approved';
      const approvedList = lists.find(list => list.name === approvedListName);
      if (approvedList) await this.moveCardToList(cardId, approvedList.id);

      // Update labels using new system
      await this.updateProofStatusLabels(cardId, 'approved');

      await this.addCommentToCard(cardId, '✅ **CUSTOMER APPROVED PROOF** - Ready for production!');
    } else {
      // Move to revision list
      const revisionListName = process.env.TRELLO_LIST_REVISION || 'Revision Needed';
      const revisionList = lists.find(list => list.name === revisionListName);
      if (revisionList) await this.moveCardToList(cardId, revisionList.id);

      // Update labels using new system
      await this.updateProofStatusLabels(cardId, 'revision_needed');

      const comment = `❌ **REVISION REQUESTED** - Customer feedback:\n\n${feedback || 'No specific feedback provided'}`;
      await this.addCommentToCard(cardId, comment);

      // Create revision checklist
      const revisionTasks = [
        'Review customer feedback',
        'Make requested changes',
        'Generate new proof',
        'Send updated proof to customer'
      ];
      await this.createChecklist(cardId, '🔄 Revision Tasks', revisionTasks);
    }
    return true;
  }

  async createCard(listId, cardData) {
    try {
      const { data } = await this.client.post('/cards', null, {
        params: {
          idList: listId,
          name: cardData.name,
          desc: cardData.description || '',
          due: cardData.dueDate || null,
          pos: cardData.position || 'bottom'
        }
      });
      return data;
    } catch (error) {
      console.error('Error creating Trello card:', error);
      throw error;
    }
  }

  async attachFileToCard(cardId, fileData) {
    try {
      // fileData should contain either url or file buffer
      if (fileData.url) {
        // Attach file from URL
        const { data } = await this.client.post(`/cards/${cardId}/attachments`, null, {
          params: {
            url: fileData.url,
            name: fileData.name || 'attachment'
          }
        });
        return data;
      } else if (fileData.file) {
        // Save PDF temporarily and upload via file path
        const fs = require('fs').promises;
        const path = require('path');
        const os = require('os');
        
        // Create temp file path
        const tempDir = os.tmpdir();
        const tempFileName = `quote_${Date.now()}_${Math.random().toString(36).substring(2)}.pdf`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        try {
          // Write buffer to temp file
          await fs.writeFile(tempFilePath, fileData.file);
          
          // Create form data with file stream
          const FormData = require('form-data');
          const form = new FormData();
          const fileStream = require('fs').createReadStream(tempFilePath);
          
          form.append('file', fileStream, {
            filename: fileData.name || 'quote.pdf',
            contentType: 'application/pdf'
          });
          
          // Upload to Trello
          const { data } = await this.client.post(`/cards/${cardId}/attachments`, form, {
            headers: {
              ...form.getHeaders()
            },
            params: {
              key: this.apiKey,
              token: this.token,
              name: fileData.name || 'attachment'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          });
          
          // Clean up temp file
          await fs.unlink(tempFilePath).catch(() => {});
          
          return data;
        } catch (uploadError) {
          // Clean up temp file on error
          await fs.unlink(tempFilePath).catch(() => {});
          throw uploadError;
        }
      } else {
        throw new Error('File data must contain either url or file buffer');
      }
    } catch (error) {
      console.error('Error attaching file to card:', error.message);
      throw error;
    }
  }

  async createQuoteCard(quoteData, pdfBuffer = null) {
    try {
      // Get the appropriate list for new quotes
      const lists = await this.getBoardLists();
      const quotingListName = process.env.TRELLO_LIST_QUOTING || 'Quoting';
      const quotingList = lists.find(list => 
        list.name.toLowerCase().includes('quoting') || 
        list.name.toLowerCase().includes('quote')
      );
      
      if (!quotingList) {
        throw new Error('Quoting list not found on Trello board');
      }

      // Create the card
      const cardData = {
        name: `${quoteData.projectName} - ${quoteData.clientCompany}`,
        description: this.formatQuoteDescription(quoteData),
        dueDate: quoteData.validUntil || null
      };

      const card = await this.createCard(quotingList.id, cardData);

      // Add quote label if available
      try {
        const labels = await this.getBoardLabels();
        const quoteLabel = labels.find(l => 
          l.name.toLowerCase().includes('quote') || 
          l.name.toLowerCase().includes('pending')
        );
        if (quoteLabel) {
          await this.addLabelToCard(card.id, quoteLabel.id);
        }
      } catch (labelError) {
        console.warn('Could not add quote label:', labelError.message);
      }

      // Attach PDF if provided
      if (pdfBuffer) {
        try {
          await this.attachFileToCard(card.id, {
            file: pdfBuffer,
            name: `Quote_${quoteData.quoteNumber}_${quoteData.projectName.replace(/\s+/g, '_')}.pdf`
          });
          await this.addCommentToCard(card.id, '📄 Quote PDF attached');
        } catch (attachError) {
          console.error('Error attaching PDF to card:', attachError);
          await this.addCommentToCard(card.id, '⚠️ Could not attach quote PDF - please add manually');
        }
      }

      // Add initial comment
      await this.addCommentToCard(card.id, 
        `💼 **New Quote Created**\n` +
        `Quote #: ${quoteData.quoteNumber}\n` +
        `Customer: ${quoteData.customerEmail}\n` +
        `Total: $${quoteData.totalAmount || 'TBD'}\n` +
        `Sales Rep: ${quoteData.salesRepFirst} ${quoteData.salesRepLast}`
      );

      return card;
    } catch (error) {
      console.error('Error creating quote card:', error);
      throw error;
    }
  }

  formatQuoteDescription(quoteData) {
    return `
**Quote Details**
================
Quote Number: ${quoteData.quoteNumber}
Date Sent: ${quoteData.dateSent}
Valid Until: ${quoteData.validUntil}

**Client Information**
Company: ${quoteData.clientCompany}
Contact: ${quoteData.customerName || 'TBD'}
Email: ${quoteData.customerEmail}
Phone: ${quoteData.customerPhone || 'N/A'}

**Project Details**
Project Name: ${quoteData.projectName}
Description: ${quoteData.projectDescription || 'See quote for details'}

**Quote Items**
${quoteData.quoteItems ? quoteData.quoteItems.map(item => 
  `• ${item.name}: $${item.price}`
).join('\n') : 'See attached quote PDF for itemized list'}

**Total Amount**: $${quoteData.totalAmount || 'TBD'}

**Sales Representative**
${quoteData.salesRepFirst} ${quoteData.salesRepLast}
${quoteData.salesRepEmail || ''}
    `.trim();
  }
}

module.exports = new TrelloService();