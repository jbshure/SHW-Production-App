"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendQuoteEmail = exports.generatePDF = exports.sosWebhookReceiver = exports.syncPurchaseOrdersFromSOS = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const nodemailer = __importStar(require("nodemailer"));
// Export the new sync functions
var syncPurchaseOrders_1 = require("./syncPurchaseOrders");
Object.defineProperty(exports, "syncPurchaseOrdersFromSOS", { enumerable: true, get: function () { return syncPurchaseOrders_1.syncPurchaseOrdersFromSOS; } });
Object.defineProperty(exports, "sosWebhookReceiver", { enumerable: true, get: function () { return syncPurchaseOrders_1.sosWebhookReceiver; } });
// Export PDF generation function
var pdfGenerator_1 = require("./pdfGenerator");
Object.defineProperty(exports, "generatePDF", { enumerable: true, get: function () { return pdfGenerator_1.generatePDF; } });
// Email sending function with SHUREPRINT template
exports.sendQuoteEmail = (0, https_1.onRequest)({
    region: "us-central1",
    timeoutSeconds: 30,
    cors: ["https://shureprint-quote-builder.web.app", "http://localhost:3000", "http://127.0.0.1:3000"],
}, async (req, res) => {
    try {
        if (req.method !== "POST") {
            res.status(405).send("Use POST");
            return;
        }
        const { to, customerName, projectName, quoteNumber, totalAmount, portalUrl, deliveryTime, salesRep, salesEmail } = req.body || {};
        if (!to || !customerName || !projectName || !quoteNumber) {
            res.status(400).json({ error: "Missing required fields: to, customerName, projectName, quoteNumber" });
            return;
        }
        // Use Gmail credentials from environment or fallback to hardcoded
        const user = process.env.GMAIL_USER || "quotes@shureprint.com";
        const pass = process.env.GMAIL_PASS || "ymec qovn yndt fbhp";
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: { user, pass },
        });
        // Create SHUREPRINT email template
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
        const info = await transporter.sendMail({
            from: `SHUREPRINT <${user}>`,
            to,
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
        logger.info("Quote email sent", { messageId: info.messageId, to, quoteNumber });
        res.status(200).json({
            success: true,
            messageId: info.messageId,
            message: `Quote email sent successfully to ${to}`
        });
    }
    catch (err) {
        logger.error("sendQuoteEmail failed", { err: err === null || err === void 0 ? void 0 : err.message });
        res.status(500).json({
            error: "Email send failed",
            detail: err === null || err === void 0 ? void 0 : err.message,
            success: false
        });
    }
});
//# sourceMappingURL=index.js.map