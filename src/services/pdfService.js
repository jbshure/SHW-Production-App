const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class PDFService {
  constructor() {
    this.browser = null;
  }

  async getBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async generateQuotePDF(quoteData) {
    let page;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // Read logo file and convert to base64
      const logoPath = path.join(__dirname, '../../public/assets/logo.png');
      const logoBuffer = await fs.readFile(logoPath);
      const logoBase64 = logoBuffer.toString('base64');

      // Generate HTML content for the quote with logo
      const htmlContent = this.generateQuoteHTML(quoteData, logoBase64);

      // Set content and wait for any resources
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        }
      });

      return pdfBuffer;
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  generateQuoteHTML(quoteData, logoBase64) {
    const itemsHTML = quoteData.quoteItems ? quoteData.quoteItems.map((item, index) => `
      <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#faf8f5'};">
        <td style="padding: 10px 8px; border: none; font-size: 12px; color: #333;">${item.code || '-'}</td>
        <td style="padding: 10px 8px; border: none; font-size: 12px; color: #333;">${item.name}</td>
        <td style="padding: 10px 8px; border: none; font-size: 12px; color: #666;">${item.note || '-'}</td>
        <td style="padding: 10px 8px; border: none; text-align: center; font-size: 12px; color: #333;">
          <div>${item.quantity || 1}</div>
          <div style="font-size: 10px; color: #888; margin-top: 2px;">${item.caseQty ? `(${item.caseQty}/cs)` : ''}</div>
        </td>
        <td style="padding: 10px 8px; border: none; text-align: right; font-size: 12px; color: #333;">$${(item.shwPrice || 0).toFixed(2)}</td>
        <td style="padding: 10px 8px; border: none; text-align: right; font-size: 12px; color: #333;">$${item.price.toFixed(2)}</td>
        <td style="padding: 10px 8px; border: none; text-align: center; font-size: 12px; color: #333;">${item.leadTime || '-'}</td>
        <td style="padding: 10px 8px; border: none; text-align: center; font-size: 12px; color: #333;">${item.setUps || '-'}</td>
        <td style="padding: 10px 8px; border: none; text-align: right; font-size: 12px; color: #333; font-weight: 500;">$${(item.price * (item.quantity || 1)).toFixed(2)}</td>
      </tr>
    `).join('') : '';

    const totalQuantity = quoteData.quoteItems ? 
      quoteData.quoteItems.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
    const subtotal = quoteData.quoteItems ? 
      quoteData.quoteItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0) : 0;
    const tax = subtotal * 0.0875; // 8.75% tax
    const total = quoteData.totalAmount || (subtotal + tax);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1a1a1a;
      line-height: 1.5;
      background: white;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 40px 20px;
    }
    
    /* Header with logo and company info */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 50px;
      padding-bottom: 30px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .logo-section {
      flex: 1;
    }
    
    .logo {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .logo-img {
      height: 40px;
      width: auto;
      margin-right: 15px;
    }
    
    
    .company-info {
      margin-top: 15px;
    }
    
    .company-info p {
      color: #6b7280;
      font-size: 13px;
      margin: 3px 0;
    }
    
    .quote-header {
      text-align: right;
    }
    
    .quote-badge {
      display: inline-block;
      background: #8B7355;
      color: #fff;
      padding: 8px 20px;
      border-radius: 25px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    
    .quote-number {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 8px;
    }
    
    .quote-date {
      color: #6b7280;
      font-size: 13px;
      margin: 2px 0;
    }
    
    /* Client and Project Info Section */
    .info-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 40px;
    }
    
    .info-card {
      background: #faf8f5;
      border-radius: 12px;
      padding: 24px;
      border: 1px solid #e5d4c1;
    }
    
    .info-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 16px;
    }
    
    .info-content {
      color: #1a1a1a;
    }
    
    .info-line {
      margin-bottom: 8px;
      font-size: 14px;
    }
    
    .info-line strong {
      display: inline-block;
      width: 80px;
      color: #6b7280;
      font-weight: 500;
    }
    
    /* Quote Items Table */
    .items-section {
      margin-bottom: 40px;
    }
    
    .items-title {
      font-size: 18px;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 0 0 1px #e5e7eb;
    }
    
    th {
      background: #3a3a3a;
      color: #fff;
      padding: 16px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    th:last-child {
      text-align: right;
    }
    
    /* Totals Section */
    .totals-container {
      display: flex;
      justify-content: flex-end;
      margin-top: 30px;
    }
    
    .totals {
      width: 350px;
      background: #faf8f5;
      border-radius: 12px;
      padding: 24px;
      border: 1px solid #e5d4c1;
    }
    
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 14px;
      color: #6b7280;
    }
    
    .total-row.subtotal {
      border-bottom: 1px solid #e5e7eb;
    }
    
    .total-row.grand-total {
      margin-top: 10px;
      padding-top: 15px;
      border-top: 2px solid #8B7355;
      font-size: 20px;
      font-weight: 700;
      color: #1a1a1a;
    }
    
    .total-row.grand-total .amount {
      color: #fff;
      background: #8B7355;
      padding: 4px 12px;
      border-radius: 6px;
    }
    
    /* Terms Section */
    .terms {
      margin-top: 40px;
      padding: 24px;
      background: linear-gradient(135deg, #faf8f5 0%, #f5f1eb 100%);
      border-radius: 12px;
      border-left: 4px solid #8B7355;
    }
    
    .terms h3 {
      color: #1a1a1a;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .terms ul {
      list-style: none;
      padding: 0;
    }
    
    .terms li {
      color: #4b5563;
      font-size: 13px;
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }
    
    .terms li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #fff;
      background: #8B7355;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
    }
    
    /* Footer */
    .footer {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
    }
    
    .footer-message {
      font-size: 16px;
      color: #1a1a1a;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .footer-info {
      color: #6b7280;
      font-size: 13px;
      margin: 5px 0;
    }
    
    .footer-links {
      margin-top: 15px;
    }
    
    .footer-links a {
      color: #8B7355;
      text-decoration: none;
      margin: 0 15px;
      font-size: 13px;
      font-weight: 500;
      border-bottom: 1px solid #8B7355;
      padding-bottom: 2px;
    }
    
    /* Signature Line */
    .signature-section {
      margin-top: 40px;
      padding: 30px;
      border: 2px dashed #e5e7eb;
      border-radius: 12px;
      text-align: center;
    }
    
    .signature-text {
      color: #6b7280;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 30px;
    }
    
    .signature-line {
      border-bottom: 2px solid #e5e7eb;
      width: 300px;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <div class="logo">
          <img src="data:image/png;base64,${logoBase64}" alt="ShurePrint" class="logo-img" style="height: 30px; width: auto;" />
        </div>
        <div class="company-info">
          <p>1972 E 20th St.</p>
          <p>Los Angeles, CA 90058</p>
          <p>Phone: (310) 555-7464</p>
          <p>Email: quotes@shureprint.com</p>
        </div>
      </div>
      <div class="quote-header">
        <div class="quote-badge">Quote</div>
        <div class="quote-number">#${quoteData.quoteNumber}</div>
        <div class="quote-date">Date: ${quoteData.dateSent}</div>
        <div class="quote-date">Valid Until: ${quoteData.validUntil}</div>
      </div>
    </div>

    <!-- Client and Project Info -->
    <div class="info-section">
      <div class="info-card">
        <div class="info-title">Bill To</div>
        <div class="info-content">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 10px;">${quoteData.clientCompany}</div>
          <div class="info-line">${quoteData.customerName || 'Attn: Accounts Payable'}</div>
          <div class="info-line">${quoteData.customerEmail}</div>
          ${quoteData.customerPhone ? `<div class="info-line">${quoteData.customerPhone}</div>` : ''}
        </div>
      </div>
      <div class="info-card">
        <div class="info-title">Project Information</div>
        <div class="info-content">
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 10px;">${quoteData.projectName}</div>
          <div class="info-line"><strong>Sales Rep:</strong> ${quoteData.salesRepFirst} ${quoteData.salesRepLast}</div>
          <div class="info-line"><strong>Email:</strong> ${quoteData.salesRepEmail || `${quoteData.salesRepFirst.toLowerCase()}@shureprint.com`}</div>
          <div class="info-line"><strong>Direct:</strong> (310) 555-0${Math.floor(Math.random() * 900) + 100}</div>
        </div>
      </div>
    </div>

    <!-- Quote Items -->
    <div class="items-section">
      <div class="items-title">Quote Details</div>
      <table>
        <thead>
          <tr>
            <th style="width: 8%; font-size: 11px;">Code</th>
            <th style="width: 18%; font-size: 11px;">Item</th>
            <th style="width: 15%; font-size: 11px;">Description</th>
            <th style="text-align: center; width: 10%; font-size: 11px;">Qty</th>
            <th style="text-align: right; width: 11%; font-size: 11px;">SHW Price</th>
            <th style="text-align: right; width: 11%; font-size: 11px;">Unit Price</th>
            <th style="text-align: center; width: 10%; font-size: 11px;">Lead Time</th>
            <th style="text-align: center; width: 8%; font-size: 11px;">Set Ups</th>
            <th style="text-align: right; width: 11%; font-size: 11px;">Sub Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-container">
      <div class="totals">
        <div class="total-row">
          <span>Total Quantity</span>
          <span>${totalQuantity}</span>
        </div>
        <div class="total-row subtotal">
          <span>Subtotal</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Tax (8.75%)</span>
          <span>$${tax.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Shipping</span>
          <span>Included</span>
        </div>
        <div class="total-row grand-total">
          <span>Total Due</span>
          <span class="amount">$${total.toFixed(2)}</span>
        </div>
      </div>
    </div>

    <!-- Terms & Conditions -->
    <div class="terms">
      <h3>Terms & Conditions</h3>
      <ul>
        <li>This quote is valid for 30 days from the date issued</li>
        <li>50% deposit required to begin production</li>
        <li>Production time: 5-7 business days after proof approval</li>
        <li>Rush service available for an additional fee</li>
        <li>Prices subject to change based on final specifications</li>
        <li>Free shipping on orders over $500</li>
      </ul>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-text">Authorized Signature</div>
      <div class="signature-line"></div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-links">
        <a href="https://www.shureprint.com">www.shureprint.com</a>
        <a href="mailto:info@shureprint.com">info@shureprint.com</a>
        <a href="tel:3105557464">(310) 555-7464</a>
      </div>
      <div class="footer-info" style="margin-top: 20px; font-size: 11px; color: #9ca3af;">
        © 2024 ShurePrint. All rights reserved. | Licensed & Insured
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  async saveQuotePDF(quoteData, outputPath) {
    try {
      const pdfBuffer = await this.generateQuotePDF(quoteData);
      await fs.writeFile(outputPath, pdfBuffer);
      return outputPath;
    } catch (error) {
      console.error('Error saving PDF:', error);
      throw error;
    }
  }
}

module.exports = new PDFService();