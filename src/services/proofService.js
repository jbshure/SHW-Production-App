const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

class ProofService {
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

  // Generate proof document based on Trello card data
  async generateProof(trelloCard) {
    try {
      const proofId = this.generateProofId();
      const proofData = await this.extractProofData(trelloCard);
      
      // Generate PDF
      const pdfPath = await this.createProofPDF(proofData, proofId);
      
      // Generate secure access link
      const accessToken = this.generateSecureToken();
      const proofLink = `${this.baseUrl}/proof/${proofId}?token=${accessToken}`;
      
      return {
        proofId,
        pdfPath,
        proofLink,
        accessToken,
        proofData,
        trelloCardId: trelloCard.id
      };
    } catch (error) {
      console.error('Error generating proof:', error);
      throw error;
    }
  }

  // Extract relevant data from Trello card
  async extractProofData(trelloCard) {
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
      artProofNumber: trelloCard.idShort || trelloCard.id.substring(0, 8),
      proofVersion: this.calculateProofVersion(trelloCard),
      dateSent: new Date().toLocaleDateString(),
      salesRepFirst: accountManager.split(' ')[0] || 'Sales',
      salesRepLast: accountManager.split(' ')[1] || 'Rep',
      clientCompany: customerCompany,
      customerEmail: customerEmail,
      artworkAttachments: trelloCard.attachments || [],
      cardDescription: trelloCard.desc || '',
      dueDate: trelloCard.due ? new Date(trelloCard.due) : null
    };
  }

  calculateProofVersion(trelloCard) {
    const comments = Array.isArray(trelloCard.actions)
      ? trelloCard.actions.filter(a => a.type === 'commentCard')
      : [];
    const proofComments = comments.filter(c => {
      const t = (c.data?.text || '').toLowerCase();
      return t.includes('proof') || t.includes('revision');
    });
    return `v${proofComments.length + 1}`;
  }

  async createProofPDF(proofData, proofId) {
    return new Promise((resolve, reject) => {
      try {
        const pdfPath = path.join(this.uploadDir, `proof-${proofId}.pdf`);
        const out = fs.createWriteStream(pdfPath);
        out.on('finish', () => resolve(pdfPath));
        out.on('error', reject);

        const doc = new PDFDocument({ size: 'A4', margin: 36 });
        doc.pipe(out);

        // ── BRAND COLORS (put your exact hex codes here) ────────────
        const brand = {
          cream: '#FFF9F0',     // header background
          gold:  '#D4AF37',     // accents, button color
          pink:  '#F7D8EA',     // footer strip
          text:  '#111111',     // primary text
          muted: '#666666',     // secondary text
          stroke:'#E2DFDA'      // neutral borders (replaces lavender)
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
        const checkbox = (x, y, label) => {
          doc.save()
            .lineWidth(1.5).strokeColor(brand.stroke)
            .roundedRect(x, y, 14, 14, 3).stroke()
            .font(REG).fillColor(brand.text).fontSize(10).text(label, x + 20, y - 1)
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
            doc.font(BLD).fontSize(18).fillColor(brand.text).text('ARTPROOF', 36, 24);
          }
        } else {
          doc.font(BLD).fontSize(18).fillColor(brand.text).text('ARTPROOF', 36, 24);
        }

        // Title with project tag
        doc.font(BLD).fontSize(20).fillColor(brand.text).text('ART APPROVAL FORM – ', 36, 90, { continued: true });
        const titleY = 90, titleX = 36 + doc.widthOfString('ART APPROVAL FORM – ');
        const project = proofData.projectName || 'Project';
        const tagW = doc.widthOfString(project, { font: BLD, size: 20 }) + 14;
        doc.save()
          .roundedRect(titleX - 4, titleY - 2, tagW, 26, 6).fill(brand.cream).stroke(brand.stroke)
          .fillColor(brand.text).font(BLD).fontSize(20).text(project, titleX, titleY)
          .restore();

        // Meta rows
        const metaY = 130;
        doc.font(REG).fontSize(10).fillColor('#333');
        doc.text('Art Proof #:', 36, metaY);          token(String(proofData.artProofNumber || ''), 100, metaY);
        doc.text('Proof Version:', 190, metaY);       token(String(proofData.proofVersion || ''), 270, metaY);
        doc.text('Date Sent:', 360, metaY);           token(String(proofData.dateSent || ''), 420, metaY);

        const metaY2 = metaY + 22;
        doc.text('Sales Rep:', 36, metaY2);
        token(`${proofData.salesRepFirst || ''}`, 96, metaY2);
        token(`${proofData.salesRepLast || ''}`, 160, metaY2);
        doc.text('Client Company:', 250, metaY2);
        token(String(proofData.clientCompany || ''), 345, metaY2);

        // Artwork preview frame
        const artY = metaY2 + 36;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('ARTWORK PREVIEW', 36, artY);
        const artBoxY = artY + 16;
        doc.save()
          .lineWidth(2).strokeColor(brand.stroke)
          .roundedRect(36, artBoxY, doc.page.width - 72, 170, 10).stroke()
          .font(REG).fontSize(10).fillColor('#777')
          .text('Artwork preview will render here', 36, artBoxY + 70, { align: 'center', width: doc.page.width - 72 })
          .restore();

        // Approval + Comments
        const secY = artBoxY + 190;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Proof Approved', 36, secY);
        checkbox(36, secY + 16, 'Yes');
        checkbox(100, secY + 16, 'No');

        doc.font(REG).fontSize(10).fillColor('#666')
          .text('I acknowledge this artwork is correct and approved for production. I understand colors may vary slightly based on materials, and shureprint is not responsible for errors after approval.',
            36, secY + 48, { width: 220 });

        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Comments:', 300, secY);
        doc.save()
          .lineWidth(1.5).strokeColor(brand.stroke)
          .roundedRect(300, secY + 16, doc.page.width - 336, 120, 8).stroke()
          .font(REG).fontSize(10).fillColor('#888')
          .text('Enter value', 310, secY + 24)
          .restore();

        // Signature / Date / Name
        const sigY = secY + 150;
        doc.font(BLD).fontSize(12).fillColor(brand.text).text('Signature', 36, sigY - 18);
        doc.lineWidth(1.8).strokeColor(brand.stroke).roundedRect(36, sigY, 300, 50, 8).stroke();
        field('Date', 356, sigY, 120, 34);
        field('Name', 36, sigY + 74, 240, 34);

        // Footer bar
        doc.save().rect(0, doc.page.height - 40, doc.page.width, 40).fill(brand.pink).restore();

        // Metadata
        doc.info = {
          Title: `Art Proof - ${proofData.projectName}`,
          Author: 'ARTPROOF',
          Subject: 'Art Proof for Customer Approval',
          CreationDate: new Date()
        };

        doc.end();
      } catch (e) { reject(e); }
    });
  }

  async sendProofToCustomer(proofBundle, trelloCard) {
    try {
      const { proofLink, proofData: data } = proofBundle;

      const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const customerEmail = (data.customerEmail || '').trim();
      if (!customerEmail) throw new Error('Customer email not found in Trello card');

      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.log(`Email disabled. Would send to: ${customerEmail}`);
        console.log(`Proof link: ${proofLink}`);
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

      const emailSubject = `Art Proof Ready for Approval - ${data.projectName}`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #FFF9F0;">
          <div style="background-color: #FFF9F0; padding: 20px; text-align: center; border-bottom: 2px solid #E2DFDA;">
            <h1 style="color: #111111; margin: 0; font-weight: 800; letter-spacing: 0.08em;">ARTPROOF</h1>
          </div>
          <div style="padding: 30px 20px; background-color: #FFF9F0;">
            <h2 style="color: #111111; margin-top: 0;">Your Art Proof is Ready for Review</h2>
            <p style="color: #333333;">Hello,</p>
            <p style="color: #333333;">Your art proof for <strong style="color: #111111;">${esc(data.projectName)}</strong> is ready for your review and approval.</p>
            <div style="background-color: #FAF9F7; border: 1px solid #E2DFDA; padding: 15px; margin: 20px 0; border-radius: 8px;">
              <strong style="color: #111111;">Project Details:</strong><br>
              <span style="color: #333333;">Art Proof #: </span><strong style="color: #111111;">${esc(data.artProofNumber)}</strong><br>
              <span style="color: #333333;">Proof Version: </span><strong style="color: #111111;">${esc(data.proofVersion)}</strong><br>
              <span style="color: #333333;">Sales Rep: </span><strong style="color: #111111;">${esc(data.salesRepFirst)} ${esc(data.salesRepLast)}</strong>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${proofLink}"
                 style="background-color: #E3FF33; color: #111111; padding: 15px 30px; border: 2px solid #111111;
                        text-decoration: none; border-radius: 8px; font-weight: 800; display: inline-block; 
                        font-size: 14px; letter-spacing: 0.5px;">
                REVIEW & APPROVE PROOF
              </a>
            </div>
            <p style="color: #333333;"><strong style="color: #111111;">Important:</strong> Please review your proof carefully and respond within 48 hours.
               If you approve the proof, we'll proceed with production. If changes are needed,
               please provide detailed feedback.</p>
            <p style="color: #333333;">If you have any questions, please contact your sales representative
               <strong style="color: #111111;">${esc(data.salesRepFirst)} ${esc(data.salesRepLast)}</strong>.</p>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #E2DFDA;">
            <p style="font-size: 12px; color: #666666;">
              This link will expire in 7 days. Please save a copy of your approved proof for your records.
            </p>
          </div>
        </div>
      `;

      const emailText =
        `Your art proof for ${data.projectName}\n` +
        `Art Proof #${data.artProofNumber} (${data.proofVersion})\n` +
        `Sales Rep: ${data.salesRepFirst} ${data.salesRepLast}\n\n` +
        `Review & Approve: ${proofLink}\n\n` +
        `This link expires in 7 days.`;

      const emailConfig = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: customerEmail,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        attachments: [{ filename: `proof-${data.artProofNumber}.pdf`, path: proofBundle.pdfPath }]
      };

      // Add CC and Reply-To for sales rep
      if (ccAddr) {
        emailConfig.cc = ccAddr;
        emailConfig.replyTo = ccAddr; // Customer replies go only to sales rep
      }

      await this.emailTransporter.sendMail(emailConfig);

      console.log(`Proof email sent to ${customerEmail}`);
      return true;
    } catch (error) {
      console.error('Error sending proof email:', { message: error.message });
      throw error;
    }
  }

  // Generate unique proof ID
  generateProofId() {
    return `proof_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  generateSecureToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  // Notify production team of approval
  async notifyProductionTeam(trelloCard) {
    try {
      const subject = `Production Ready: ${trelloCard.name}`;
      const message = `
        <h3>Art Proof Approved - Ready for Production</h3>
        <p><strong>Project:</strong> ${trelloCard.name}</p>
        <p><strong>Card ID:</strong> ${trelloCard.id}</p>
        <p><strong>Approved:</strong> ${new Date().toLocaleString()}</p>
        <p>Please proceed with production for this project.</p>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: 'production@shureprint.com',
        subject,
        html: message
      });

      console.log('Production team notified');
    } catch (error) {
      console.error('Error notifying production team:', error);
    }
  }

  // Notify design team of revision request
  async notifyDesignTeam(trelloCard) {
    try {
      const subject = `Revision Needed: ${trelloCard.name}`;
      const message = `
        <h3>Customer Requested Revisions</h3>
        <p><strong>Project:</strong> ${trelloCard.name}</p>
        <p><strong>Card ID:</strong> ${trelloCard.id}</p>
        <p><strong>Requested:</strong> ${new Date().toLocaleString()}</p>
        <p>Please check the Trello card for customer feedback and make the necessary revisions.</p>
      `;

      await this.emailTransporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: 'design@shureprint.com',
        subject,
        html: message
      });

      console.log('Design team notified');
    } catch (error) {
      console.error('Error notifying design team:', error);
    }
  }
}

module.exports = new ProofService();