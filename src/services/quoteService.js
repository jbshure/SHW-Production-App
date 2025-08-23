const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

class QuoteService {
  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';

    const rawBase = process.env.BASE_URL || 'http://localhost:3000';
    this.baseUrl = rawBase.replace(/\/+$/, '');

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    const port = Number(process.env.SMTP_PORT || 587);
    this.emailTransporter = nodemailer.createTransport({
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

  // Generate quote document based on Trello card data
  async generateQuote(trelloCard) {
    try {
      const quoteId = this.generateQuoteId();
      const quoteData = await this.extractQuoteData(trelloCard);
      
      // Generate PDF
      const pdfPath = await this.createQuotePDF(quoteData, quoteId);
      
      // Generate secure access link
      const accessToken = this.generateSecureToken();
      const quoteLink = `${this.baseUrl}/quote/${quoteId}?token=${accessToken}`;
      
      return {
        quoteId,
        pdfPath,
        quoteLink,
        accessToken,
        quoteData,
        trelloCardId: trelloCard.id
      };
    } catch (error) {
      console.error('Error generating quote:', error);
      throw error;
    }
  }

  // Extract relevant data from Trello card
  async extractQuoteData(trelloCard) {
    // Get custom field values
    const customFields = trelloCard.customFieldItems || [];
    const getCustomField = (name) => {
      const field = customFields.find(cf => cf.customField?.name === name);
      return field?.value?.text || field?.value || '';
    };

    // Extract data from card description using regex patterns
    const description = trelloCard.desc || '';
    const extractFromDesc = (pattern) => {
      const match = description.match(pattern);
      return match ? match[1].trim() : '';
    };

    // Extract customer info from description
    const customerName = extractFromDesc(/- Name: (.+)/i) || 'Customer';
    const customerEmail = extractFromDesc(/- Email: (.+)/i) || getCustomField('Customer Email') || '';
    const customerCompany = extractFromDesc(/- Company: (.+)/i) || getCustomField('Customer Company') || 'Client Company';
    const accountManager = extractFromDesc(/- Account Manager: (.+)/i) || trelloCard.members?.[0]?.fullName || 'Account Manager';
    
    return {
      projectName: trelloCard.name,
      quoteNumber: trelloCard.idShort || trelloCard.id.substring(0, 8),
      quoteVersion: this.calculateQuoteVersion(trelloCard),
      dateSent: new Date().toLocaleDateString(),
      salesRepFirst: accountManager.split(' ')[0] || 'Sales',
      salesRepLast: accountManager.split(' ')[1] || 'Rep',
      clientCompany: customerCompany,
      customerEmail: customerEmail,
      quoteAttachments: trelloCard.attachments || [],
      cardDescription: trelloCard.desc || '',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString() // 30 days from now
    };
  }

  calculateQuoteVersion(trelloCard) {
    const comments = Array.isArray(trelloCard.actions)
      ? trelloCard.actions.filter(a => a.type === 'commentCard')
      : [];
    const quoteComments = comments.filter(c => {
      const t = (c.data?.text || '').toLowerCase();
      return t.includes('quote') || t.includes('revision');
    });
    return `v${quoteComments.length + 1}`;
  }

  async createQuotePDF(quoteData, quoteId) {
    return new Promise((resolve, reject) => {
      try {
        const pdfPath = path.join(this.uploadDir, `quote-${quoteId}.pdf`);
        const out = fs.createWriteStream(pdfPath);
        out.on('finish', () => resolve(pdfPath));
        out.on('error', reject);

        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        doc.pipe(out);

        // ── BRAND COLORS (ShurePrint brand colors) ────────────
        const brand = {
          cream: '#FFF9F0',     // header background
          gold:  '#D4AF37',     // accents, button color
          pink:  '#F7D8EA',     // footer strip
          text:  '#111111',     // primary text
          muted: '#666666',     // secondary text
          stroke:'#E2DFDA'      // neutral borders
        };

        // Optional brand fonts (falls back to Helvetica if absent)
        const regPath = path.join(process.cwd(), 'assets/fonts/Brand-Regular.ttf');
        const boldPath = path.join(process.cwd(), 'assets/fonts/Brand-Bold.ttf');
        const hasReg = fs.existsSync(regPath);
        const hasBold = fs.existsSync(boldPath);
        if (hasReg)  doc.registerFont('Brand', regPath);
        if (hasBold) doc.registerFont('Brand-Bold', boldPath);
        const REG = hasReg ? 'Brand' : 'Helvetica';
        const BLD = hasBold ? 'Brand-Bold' : 'Helvetica-Bold';

        // helpers
        const token = (text, x, y, padX=6, padY=2) => {
          const w = doc.widthOfString(text, { font: BLD, size: 10 }) + padX*2;
          const h = doc.currentLineHeight() + padY*2 - 2;
          doc.save()
            .roundedRect(x, y - padY, w, h, 4).fill(brand.cream).stroke(brand.stroke)
            .fillColor(brand.text).font(BLD).fontSize(10).text(text, x + padX, y - 1)
            .restore();
        };
        const field = (label, x, y, w, h=34) => {
          doc.save()
            .font(REG).fillColor(brand.text).fontSize(11).text(label, x, y - 18)
            .lineWidth(1.5).strokeColor(brand.stroke)
            .roundedRect(x, y, w, h, 6).stroke()
            .restore();
        };

        // Header strip
        doc.save().rect(0, 0, doc.page.width, 70).fill(brand.cream).restore();
        
        // Try to load and use logo, fallback to text
        const logoPath = path.join(process.cwd(), 'public/assets/logo.png');
        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 36, 20, { height: 30 });
          } catch (e) {
            console.warn('Could not load logo, using text fallback');
            doc.font(BLD).fontSize(18).fillColor(brand.text).text('SHUREPRINT', 36, 24);
          }
        } else {
          doc.font(BLD).fontSize(18).fillColor(brand.text).text('SHUREPRINT', 36, 24);
        }

        // Title with project tag
        doc.font(BLD).fontSize(20).fillColor(brand.text).text('QUOTE – ', 36, 90, { continued: true });
        const titleY = 90, titleX = 36 + doc.widthOfString('QUOTE – ');
        const project = quoteData.projectName || 'Project';
        const tagW = doc.widthOfString(project, { font: BLD, size: 20 }) + 14;
        doc.save()
          .roundedRect(titleX - 4, titleY - 2, tagW, 26, 6).fill(brand.cream).stroke(brand.stroke)
          .fillColor(brand.text).font(BLD).fontSize(20).text(project, titleX, titleY)
          .restore();

        // Meta rows
        const metaY = 130;
        doc.font(REG).fontSize(10).fillColor('#333');
        doc.text('Quote #:', 36, metaY);          token(String(quoteData.quoteNumber || ''), 85, metaY);
        doc.text('Version:', 170, metaY);         token(String(quoteData.quoteVersion || ''), 220, metaY);
        doc.text('Date:', 300, metaY);            token(String(quoteData.dateSent || ''), 340, metaY);
        doc.text('Valid Until:', 430, metaY);     token(String(quoteData.validUntil || ''), 490, metaY);

        const metaY2 = metaY + 22;
        doc.text('Sales Rep:', 36, metaY2);
        token(`${quoteData.salesRepFirst || ''}`, 96, metaY2);
        token(`${quoteData.salesRepLast || ''}`, 160, metaY2);
        doc.text('Client Company:', 250, metaY2);
        token(String(quoteData.clientCompany || ''), 345, metaY2);

        // Quote details section
        const quoteY = metaY2 + 50;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('QUOTE DETAILS', 36, quoteY);
        const detailsBoxY = quoteY + 16;
        doc.save()
          .lineWidth(2).strokeColor(brand.stroke)
          .roundedRect(36, detailsBoxY, doc.page.width - 72, 200, 10).stroke()
          .font(REG).fontSize(10).fillColor('#777')
          .text('Quote details and pricing will be displayed here', 36, detailsBoxY + 90, { align: 'center', width: doc.page.width - 72 })
          .restore();

        // Acceptance section
        const acceptY = detailsBoxY + 220;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Quote Acceptance', 36, acceptY);
        
        doc.font(REG).fontSize(10).fillColor('#666')
          .text('By accepting this quote, I agree to the terms and conditions outlined above and authorize ShurePrint to proceed with the described work.',
            36, acceptY + 20, { width: 300 });

        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Next Steps:', 350, acceptY);
        doc.save()
          .lineWidth(1.5).strokeColor(brand.stroke)
          .roundedRect(350, acceptY + 16, doc.page.width - 386, 80, 8).stroke()
          .font(REG).fontSize(10).fillColor('#888')
          .text('Instructions for next steps will appear here', 360, acceptY + 24)
          .restore();

        // Signature / Date / Name
        const sigY = acceptY + 110;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Client Signature', 36, sigY - 18);
        doc.lineWidth(1.8).strokeColor(brand.stroke).roundedRect(36, sigY, 300, 50, 8).stroke();
        field('Date', 356, sigY, 120, 34);
        field('Name & Title', 36, sigY + 74, 240, 34);
        field('Company', 296, sigY + 74, 180, 34);

        // Footer bar
        doc.save().rect(0, doc.page.height - 40, doc.page.width, 40).fill(brand.pink).restore();

        // Metadata
        doc.info = {
          Title: `Quote - ${quoteData.projectName}`,
          Author: 'ShurePrint',
          Subject: 'Quote for Customer Review',
          CreationDate: new Date()
        };

        doc.end();
      } catch (e) { reject(e); }
    });
  }

  async sendQuoteToCustomer(quoteBundle, trelloCard) {
    try {
      const { quoteLink, quoteData: data } = quoteBundle;

      const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const customerEmail = (data.customerEmail || '').trim();
      if (!customerEmail) throw new Error('Customer email not found in Trello card');

      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`Email disabled. Would send to: ${customerEmail}`);
        console.log(`Quote link: ${quoteLink}`);
        return true;
      }

      // Convert logo to base64 for email embedding
      let logoDataUrl = '';
      try {
        const logoPath = path.join(process.cwd(), 'public/assets/logo.png');
        if (fs.existsSync(logoPath)) {
          const logoBuffer = fs.readFileSync(logoPath);
          logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }
      } catch (logoError) {
        console.warn('Could not embed logo:', logoError.message);
      }

      const first = (data.salesRepFirst || '').trim();
      const last  = (data.salesRepLast  || '').trim();
      const ccAddr = (first && last) ? `${first}.${last}`.toLowerCase().replace(/\s+/g, '') + '@shureprint.com' : null;

      const emailSubject = `Your Quote is Ready - ${data.projectName}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
          <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
            <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">SHUREPRINT</h1>
          </div>
          <div style="padding: 30px 20px; background-color: #FFF9F0;">
            <h2 style="color: #111111; margin-top: 0;">Your Quote is Ready for Review</h2>
            <p style="color: #333333;">Hello,</p>
            <p style="color: #333333;">Thank you for your interest in our services. Your quote for <strong style="color: #111111;">${esc(data.projectName)}</strong> is now ready for your review.</p>
            <div style="background-color: #FAF9F7; border: 1px solid #E2DFDA; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <strong style="color: #111111;">Quote Details:</strong><br>
              <span style="color: #333333;">Quote #: </span><strong style="color: #111111;">${esc(data.quoteNumber)}</strong><br>
              <span style="color: #333333;">Version: </span><strong style="color: #111111;">${esc(data.quoteVersion)}</strong><br>
              <span style="color: #333333;">Valid Until: </span><strong style="color: #111111;">${esc(data.validUntil)}</strong><br>
              <span style="color: #333333;">Sales Rep: </span><strong style="color: #111111;">${esc(data.salesRepFirst)} ${esc(data.salesRepLast)}</strong>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${quoteLink}"
                 style="background-color: #E3FF33; color: #111111; padding: 15px 30px; border: 2px solid #111111;
                        text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; 
                        font-size: 14px; letter-spacing: 0.5px;">
                REVIEW QUOTE
              </a>
            </div>
            <p style="color: #333333;"><strong style="color: #111111;">Important:</strong> This quote is valid until ${esc(data.validUntil)}. 
               Please review and let us know if you'd like to proceed or if you have any questions.</p>
            <p style="color: #333333;">If you have any questions about this quote, please contact your sales representative
               <strong style="color: #111111;">${esc(data.salesRepFirst)} ${esc(data.salesRepLast)}</strong>.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E2DFDA;">
            <p style="font-size: 12px; color: #666666;">
              This quote link will remain active until the expiration date. Please save a copy for your records.
            </p>
          </div>
        </div>
      `;

      const emailText =
        `Your quote for ${data.projectName}\n` +
        `Quote #${data.quoteNumber} (${data.quoteVersion})\n` +
        `Valid Until: ${data.validUntil}\n` +
        `Sales Rep: ${data.salesRepFirst} ${data.salesRepLast}\n\n` +
        `Review Quote: ${quoteLink}\n\n` +
        `This quote expires on ${data.validUntil}.`;

      const emailConfig = {
        from: process.env.SMTP_FROM || 'quotes@shureprint.com',
        to: customerEmail,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        attachments: [{ filename: `quote-${data.quoteNumber}.pdf`, path: quoteBundle.pdfPath }]
      };

      // Add CC and Reply-To for sales rep
      if (ccAddr) {
        emailConfig.cc = ccAddr;
        emailConfig.replyTo = ccAddr; // Customer replies go only to sales rep
      }

      await this.emailTransporter.sendMail(emailConfig);

      console.log(`Quote email sent to ${customerEmail}`);
      return true;
    } catch (error) {
      console.error('Error sending quote email:', { message: error.message });
      throw error;
    }
  }

  // Generate unique quote ID
  generateQuoteId() {
    return `quote_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateSecureToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  // Notify sales team of quote acceptance
  async notifySalesTeam(trelloCard) {
    try {
      const subject = `Quote Accepted: ${trelloCard.name}`;
      const message = `
        <h3>Quote Accepted - Ready to Begin</h3>
        <p><strong>Project:</strong> ${trelloCard.name}</p>
        <p><strong>Card ID:</strong> ${trelloCard.id}</p>
        <p><strong>Accepted:</strong> ${new Date().toLocaleString()}</p>
        <p>Please initiate project setup and scheduling.</p>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'quotes@shureprint.com',
        to: 'sales@shureprint.com',
        subject,
        html: message
      });

      console.log('Sales team notified of quote acceptance');
    } catch (error) {
      console.error('Error notifying sales team:', error);
    }
  }

  // Notify sales team of quote revision request
  async notifySalesTeamRevision(trelloCard) {
    try {
      const subject = `Quote Revision Requested: ${trelloCard.name}`;
      const message = `
        <h3>Customer Requested Quote Revision</h3>
        <p><strong>Project:</strong> ${trelloCard.name}</p>
        <p><strong>Card ID:</strong> ${trelloCard.id}</p>
        <p><strong>Requested:</strong> ${new Date().toLocaleString()}</p>
        <p>Please check the Trello card for customer feedback and prepare a revised quote.</p>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || 'quotes@shureprint.com',
        to: 'sales@shureprint.com',
        subject,
        html: message
      });

      console.log('Sales team notified of quote revision request');
    } catch (error) {
      console.error('Error notifying sales team:', error);
    }
  }
}

module.exports = new QuoteService();