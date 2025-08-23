const nodemailer = require('nodemailer');
const trelloService = require('./trelloService');

class ReminderService {
  constructor() {
    this.reminderSchedule = {
      firstReminder: 2 * 24 * 60 * 60 * 1000,  // 2 days
      secondReminder: 4 * 24 * 60 * 60 * 1000, // 4 days  
      finalReminder: 6 * 24 * 60 * 60 * 1000,  // 6 days
      expiration: 7 * 24 * 60 * 60 * 1000      // 7 days
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

  // Check all active proofs and send appropriate reminders
  async processReminders(proofSessions) {
    const now = Date.now();
    
    for (const [proofId, proofData] of proofSessions.entries()) {
      if (proofData.status === 'approved' || proofData.status === 'revision_needed') {
        continue; // Skip completed proofs
      }

      const timeElapsed = now - proofData.createdAt;
      const remindersSent = proofData.remindersSent || [];

      try {
        // Check for expiration
        if (timeElapsed >= this.reminderSchedule.expiration) {
          await this.handleExpiredProof(proofId, proofData);
          continue;
        }

        // Check for important reminder (Day 6)
        if (timeElapsed >= this.reminderSchedule.finalReminder && !remindersSent.includes('important')) {
          await this.sendImportantReminder(proofData);
          remindersSent.push('important');
          proofData.remindersSent = remindersSent;
          continue;
        }

        // Check for second reminder (Day 4)  
        if (timeElapsed >= this.reminderSchedule.secondReminder && !remindersSent.includes('second')) {
          await this.sendSecondReminder(proofData);
          remindersSent.push('second');
          proofData.remindersSent = remindersSent;
          continue;
        }

        // Check for first reminder (Day 2)
        if (timeElapsed >= this.reminderSchedule.firstReminder && !remindersSent.includes('first')) {
          await this.sendFirstReminder(proofData);
          remindersSent.push('first');
          proofData.remindersSent = remindersSent;
        }

      } catch (error) {
        console.error(`Error processing reminders for proof ${proofId}:`, error);
      }
    }
  }

  // Day 2: Reminder
  async sendFirstReminder(proofData) {
    const data = proofData.proofData;
    const customerEmail = data.customerEmail;

    const subject = `Reminder: Art Proof Approval - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, proofData.proofLink, {
      type: 'first',
      title: 'Reminder: Your Art Proof Awaits Review',
      message: 'We wanted to follow up on the art proof we sent you 2 days ago.',
      urgency: 'Please review when you have a chance. We appreciate your prompt attention.',
      timeLeft: '5 days remaining',
      color: '#4CAF50' // Green - calm
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(proofData.trelloCardId, '📧 Reminder sent to customer (Day 2)');
    
    console.log(`First reminder sent for proof ${proofData.proofId}`);
  }

  // Day 4: Reminder
  async sendSecondReminder(proofData) {
    const data = proofData.proofData;
    const customerEmail = data.customerEmail;

    const subject = `Reminder: Art Proof Approval Needed - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, proofData.proofLink, {
      type: 'second',
      title: 'Reminder: Your Art Proof Needs Attention',
      message: 'We sent your art proof 4 days ago and haven\'t heard back yet.',
      urgency: 'To keep your project on schedule, we need your approval or feedback soon.',
      timeLeft: '3 days remaining',
      color: '#FF9800' // Orange - moderate urgency
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(proofData.trelloCardId, '📧 Reminder sent to customer (Day 4)');
    
    console.log(`Second reminder sent for proof ${proofData.proofId}`);
  }

  // Day 6: Important Reminder
  async sendImportantReminder(proofData) {
    const data = proofData.proofData;
    const customerEmail = data.customerEmail;

    const subject = `IMPORTANT: Art Proof Expires Tomorrow - ${data.projectName}`;
    const htmlContent = this.createReminderEmail(data, proofData.proofLink, {
      type: 'important',
      title: 'IMPORTANT: Your Art Proof Expires Tomorrow',
      message: 'This is an important reminder - your art proof will expire in 24 hours.',
      urgency: 'Please review and respond immediately to avoid project delays. After expiration, we\'ll need to restart the approval process.',
      timeLeft: '1 day remaining',
      color: '#F44336' // Red - high urgency
    });

    await this.sendReminderEmail(customerEmail, subject, htmlContent, data);
    await this.addTrelloComment(proofData.trelloCardId, '🚨 IMPORTANT reminder sent to customer (Day 6) - Expires tomorrow!');
    
    console.log(`Important reminder sent for proof ${proofData.proofId}`);
  }

  // Day 7: Proof expired
  async handleExpiredProof(proofId, proofData) {
    const data = proofData.proofData;
    
    // Move Trello card to "Revision Needed" or "Expired Proofs" list
    try {
      const lists = await trelloService.getBoardLists();
      const expiredList = lists.find(list => list.name === 'Expired Proofs') || 
                         lists.find(list => list.name === 'Revision Needed');
      
      if (expiredList) {
        await trelloService.moveCardToList(proofData.trelloCardId, expiredList.id);
      }

      // Auto-apply EXPIRED label
      await trelloService.updateProofStatusLabels(proofData.trelloCardId, 'expired');

      await this.addTrelloComment(proofData.trelloCardId, 
        '⏰ PROOF EXPIRED - No customer response after 7 days. Proof link disabled. Contact customer to restart approval process.');

    } catch (error) {
      console.error('Error handling expired proof in Trello:', error);
    }

    // Send expiration notice to sales rep
    try {
      const salesRepEmail = `${data.salesRepFirst}.${data.salesRepLast}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com';
      
      const subject = `Proof Expired: No Response from Customer - ${data.projectName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #FFF9F0; padding: 20px; border-left: 4px solid #F44336;">
            <h2 style="color: #F44336; margin-top: 0;">⏰ Art Proof Expired</h2>
            <p><strong>Project:</strong> ${data.projectName}</p>
            <p><strong>Customer:</strong> ${data.customerEmail}</p>
            <p><strong>Proof #:</strong> ${data.artProofNumber}</p>
            <p><strong>Sent:</strong> ${data.dateSent}</p>
            <hr>
            <p>The customer did not respond to the art proof within 7 days. The proof link has been disabled.</p>
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Contact the customer directly</li>
              <li>Generate a new proof if needed</li>
              <li>Restart the approval process</li>
            </ul>
          </div>
        </div>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: salesRepEmail,
        subject,
        html: htmlContent
      });

    } catch (error) {
      console.error('Error sending expiration notice to sales rep:', error);
    }

    console.log(`Proof ${proofId} expired and processed`);
  }

  // Create reminder email template
  createReminderEmail(data, proofLink, reminder) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
        <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
          <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">ARTPROOF</h1>
        </div>
        <div style="padding: 30px 20px; background-color: #FFF9F0;">
          <div style="border-left: 4px solid ${reminder.color}; padding-left: 20px; margin-bottom: 20px;">
            <h2 style="color: ${reminder.color}; margin-top: 0;">${reminder.title}</h2>
          </div>
          
          <p style="color: #333333;">Hello,</p>
          <p style="color: #333333;">${reminder.message}</p>
          
          <div style="background-color: #FAF9F7; border: 1px solid #E2DFDA; padding: 15px; margin: 20px 0; border-radius: 8px;">
            <strong style="color: #111111;">Project Details:</strong><br>
            <span style="color: #333333;">Project: </span><strong style="color: #111111;">${data.projectName}</strong><br>
            <span style="color: #333333;">Art Proof #: </span><strong style="color: #111111;">${data.artProofNumber}</strong><br>
            <span style="color: #333333;">Time Remaining: </span><strong style="color: ${reminder.color};">${reminder.timeLeft}</strong>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${proofLink}"
               style="background-color: #E3FF33; color: #111111; padding: 15px 30px; border: 2px solid #111111;
                      text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; 
                      font-size: 14px; letter-spacing: 0.5px;">
              REVIEW & APPROVE PROOF NOW
            </a>
          </div>
          
          <p style="color: #333333;"><strong style="color: #111111;">Important:</strong> ${reminder.urgency}</p>
          
          <p style="color: #333333;">If you have any questions, please contact your sales representative 
             <strong style="color: #111111;">${data.salesRepFirst} ${data.salesRepLast}</strong>.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #E2DFDA;">
          <p style="font-size: 12px; color: #666666;">
            This proof link will expire automatically. Please respond promptly to avoid project delays.
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
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
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

module.exports = new ReminderService();