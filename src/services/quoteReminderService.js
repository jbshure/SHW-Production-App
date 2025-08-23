const nodemailer = require('nodemailer');
const trelloService = require('./trelloService');

class QuoteReminderService {
  constructor() {
    this.reminderSchedule = {
      firstReminder: 3 * 24 * 60 * 60 * 1000,   // 3 days
      secondReminder: 7 * 24 * 60 * 60 * 1000,  // 7 days  
      thirdReminder: 14 * 24 * 60 * 60 * 1000,  // 14 days
      finalReminder: 25 * 24 * 60 * 60 * 1000,  // 25 days
      expiration: 30 * 24 * 60 * 60 * 1000      // 30 days
    };

    const port = Number(process.env.SMTP_PORT || 587);
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout: 10000,
      socketTimeout: 20000,
    });
  }

  // Check all active quotes and send appropriate reminders
  async processReminders(quoteSessions) {
    const now = Date.now();
    
    for (const [quoteId, quoteData] of quoteSessions.entries()) {
      if (quoteData.status === 'accepted' || quoteData.status === 'revision_needed') {
        continue; // Skip completed quotes
      }

      const timeElapsed = now - quoteData.createdAt;
      const remindersSent = quoteData.remindersSent || [];

      try {
        // Check for expiration
        if (timeElapsed >= this.reminderSchedule.expiration) {
          await this.handleExpiredQuote(quoteId, quoteData);
          continue;
        }

        // Check for final reminder (Day 25)
        if (timeElapsed >= this.reminderSchedule.finalReminder && !remindersSent.includes('final')) {
          await this.sendFinalReminder(quoteData);
          remindersSent.push('final');
          quoteData.remindersSent = remindersSent;
          continue;
        }

        // Check for third reminder (Day 14)
        if (timeElapsed >= this.reminderSchedule.thirdReminder && !remindersSent.includes('third')) {
          await this.sendThirdReminder(quoteData);
          remindersSent.push('third');
          quoteData.remindersSent = remindersSent;
          continue;
        }

        // Check for second reminder (Day 7)  
        if (timeElapsed >= this.reminderSchedule.secondReminder && !remindersSent.includes('second')) {
          await this.sendSecondReminder(quoteData);
          remindersSent.push('second');
          quoteData.remindersSent = remindersSent;
          continue;
        }

        // Check for first reminder (Day 3)
        if (timeElapsed >= this.reminderSchedule.firstReminder && !remindersSent.includes('first')) {
          await this.sendFirstReminder(quoteData);
          remindersSent.push('first');
          quoteData.remindersSent = remindersSent;
        }

      } catch (error) {
        console.error(`Error processing reminders for quote ${quoteId}:`, error);
      }
    }
  }

  // Day 3: First Follow-up
  async sendFirstReminder(quoteData) {
    const data = quoteData.quoteData;
    const customerEmail = data.customerEmail;

    const subject = `Following up on your quote - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, quoteData.quoteLink, {
      type: 'first',
      title: 'Following Up on Your Quote',
      message: 'We wanted to follow up on the quote we sent you a few days ago.',
      urgency: 'No rush - just wanted to make sure you received it and see if you have any questions.',
      timeLeft: '27 days remaining',
      color: '#4CAF50' // Green - calm
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(quoteData.trelloCardId, '📧 Follow-up sent to customer (Day 3)');
    
    console.log(`First follow-up sent for quote ${quoteData.quoteId}`);
  }

  // Day 7: Second Follow-up
  async sendSecondReminder(quoteData) {
    const data = quoteData.quoteData;
    const customerEmail = data.customerEmail;

    const subject = `Checking in about your quote - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, quoteData.quoteLink, {
      type: 'second',
      title: 'Checking In About Your Quote',
      message: 'Just checking in to see if you\'ve had a chance to review the quote we sent last week.',
      urgency: 'We\'re here to answer any questions or discuss modifications if needed.',
      timeLeft: '23 days remaining',
      color: '#2196F3' // Blue - friendly
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(quoteData.trelloCardId, '📧 Check-in sent to customer (Day 7)');
    
    console.log(`Second follow-up sent for quote ${quoteData.quoteId}`);
  }

  // Day 14: Third Follow-up
  async sendThirdReminder(quoteData) {
    const data = quoteData.quoteData;
    const customerEmail = data.customerEmail;

    const subject = `Your quote is still available - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, quoteData.quoteLink, {
      type: 'third',
      title: 'Your Quote is Still Available',
      message: 'We wanted to let you know your quote is still available and valid.',
      urgency: 'If timing isn\'t right now, we understand. Feel free to reach out when you\'re ready to move forward.',
      timeLeft: '16 days remaining',
      color: '#FF9800' // Orange - gentle urgency
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(quoteData.trelloCardId, '📧 Availability reminder sent to customer (Day 14)');
    
    console.log(`Third follow-up sent for quote ${quoteData.quoteId}`);
  }

  // Day 25: Final Reminder
  async sendFinalReminder(quoteData) {
    const data = quoteData.quoteData;
    const customerEmail = data.customerEmail;

    const subject = `Quote expires soon - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, quoteData.quoteLink, {
      type: 'final',
      title: 'Final Reminder: Quote Expires Soon',
      message: 'This is a friendly reminder that your quote will expire in 5 days.',
      urgency: 'If you\'d like to proceed or need a quote extension, please let us know soon. We\'d love to work with you on this project.',
      timeLeft: '5 days remaining',
      color: '#F44336' // Red - urgency
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(quoteData.trelloCardId, '🚨 Final reminder sent to customer (Day 25) - Expires in 5 days!');
    
    console.log(`Final reminder sent for quote ${quoteData.quoteId}`);
  }

  // Day 30: Quote expired
  async handleExpiredQuote(quoteId, quoteData) {
    const data = quoteData.quoteData;
    
    // Move Trello card to "Expired Quotes" or "Follow Up" list
    try {
      const lists = await trelloService.getBoardLists();
      const expiredList = lists.find(list => list.name === 'Expired Quotes') || 
                         lists.find(list => list.name === 'Follow Up') ||
                         lists.find(list => list.name === 'Cold Leads');
      
      if (expiredList) {
        await trelloService.moveCardToList(quoteData.trelloCardId, expiredList.id);
      }

      // Auto-apply EXPIRED label
      await trelloService.updateQuoteStatusLabels(quoteData.trelloCardId, 'expired');

      await this.addTrelloComment(quoteData.trelloCardId, 
        '⏰ QUOTE EXPIRED - Quote validity period ended after 30 days. Quote link disabled. Contact customer for re-engagement or quote renewal.');

    } catch (error) {
      console.error('Error handling expired quote in Trello:', error);
    }

    // Send expiration notice to sales rep
    try {
      const salesRepEmail = `${data.salesRepFirst}.${data.salesRepLast}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com';
      
      const subject = `Quote Expired: ${data.projectName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #FFF9F0; padding: 20px; border-left: 4px solid #F44336;">
            <h2 style="color: #F44336; margin-top: 0;">⏰ Quote Expired</h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Customer:</strong> ${data.customerEmail}</p>
            <p><strong>Quote #:</strong> ${data.quoteNumber}</p>
            <p><strong>Sent:</strong> ${data.dateSent}</p>
            <p><strong>Valid Until:</strong> ${data.validUntil}</p>
            <hr>
            <p>The quote validity period has ended. The quote link has been disabled.</p>
            <p><strong>Options for follow-up:</strong></p>
            <ul>
              <li>Contact customer to gauge continued interest</li>
              <li>Generate updated quote with current pricing</li>
              <li>Move to nurture sequence for future opportunities</li>
            </ul>
          </div>
        </div>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'quotes@shureprint.com',
        to: salesRepEmail,
        cc: 'sales@shureprint.com',
        subject,
        html: htmlContent
      });

    } catch (error) {
      console.error('Error sending expiration notice to sales rep:', error);
    }

    console.log(`Quote ${quoteId} expired and processed`);
  }

  // Create reminder email template
  createReminderEmail(data, quoteLink, reminder) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
        <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
          <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">SHUREPRINT</h1>
        </div>
        <div style="padding: 30px 20px; background-color: #FFF9F0;">
          <div style="border-left: 4px solid ${reminder.color}; padding-left: 20px; margin-bottom: 20px;">
            <h2 style="color: ${reminder.color}; margin-top: 0;">${reminder.title}</h2>
          </div>
          
          <p style="color: #333333;">Hello,</p>
          <p style="color: #333333;">${reminder.message}</p>
          
          <div style="background-color: #FAF9F7; border: 1px solid #E2DFDA; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <strong style="color: #111111;">Quote Details:</strong><br>
            <span style="color: #333333;">Project: </span><strong style="color: #111111;">${data.projectName}</strong><br>
            <span style="color: #333333;">Quote #: </span><strong style="color: #111111;">${data.quoteNumber}</strong><br>
            <span style="color: #333333;">Valid Until: </span><strong style="color: ${reminder.color};">${data.validUntil}</strong><br>
            <span style="color: #333333;">Time Remaining: </span><strong style="color: ${reminder.color};">${reminder.timeLeft}</strong>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${quoteLink}"
               style="background-color: #E3FF33; color: #111111; padding: 15px 30px; border: 2px solid #111111;
                      text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; 
                      font-size: 14px; letter-spacing: 0.5px;">
              REVIEW QUOTE
            </a>
          </div>
          
          <p style="color: #333333;"><strong style="color: #111111;">Note:</strong> ${reminder.urgency}</p>
          
          <p style="color: #333333;">If you have any questions about this quote, please contact your sales representative 
             <strong style="color: #111111;">${data.salesRepFirst} ${data.salesRepLast}</strong>.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #E2DFDA;">
          <p style="font-size: 12px; color: #666666;">
            This quote will remain valid until ${data.validUntil}. We appreciate your consideration.
          </p>
        </div>
      </div>
    `;
  }

  // Send reminder email with proper headers
  async sendReminderEmail(customerEmail, subject, htmlContent, data) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log(`Reminder email disabled. Would send to: ${customerEmail}`);
      return;
    }

    const salesRepEmail = `${data.salesRepFirst}.${data.salesRepLast}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com';

    await this.emailTransporter.sendMail({
      from: 'quote@shureprint.com',
      to: customerEmail,
      cc: salesRepEmail,
      replyTo: salesRepEmail,
      subject,
      html: htmlContent
    });
  }

  // Add comment to Trello card
  async addTrelloComment(cardId, comment) {
    try {
      await trelloService.addCommentToCard(cardId, comment);
    } catch (error) {
      console.error('Error adding Trello comment:', error);
    }
  }
}

module.exports = new QuoteReminderService();