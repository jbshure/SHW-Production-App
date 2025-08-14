// Vercel serverless function for sending emails
const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, customerName, projectName, quoteNumber, totalAmount, portalUrl, deliveryTime, salesRep, salesEmail } = req.body;
    
    if (!to || !customerName || !projectName || !quoteNumber) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Gmail SMTP configuration with your working credentials
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'quotes@shureprint.com',
        pass: 'ymec qovn yndt fbhp' // Your working Gmail App Password
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
      from: 'quotes@shureprint.com',
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
    
    res.json({ 
      success: true, 
      message: `Quote email sent successfully to ${to}`,
      messageId: info.messageId
    });
    
  } catch (error) {
    res.status(500).json({ 
      error: 'Email error: ' + error.message,
      success: false
    });
  }
}