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
exports.generatePDF = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const htmlPdf = __importStar(require("html-pdf-node"));
exports.generatePDF = (0, https_1.onRequest)({
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: ["https://shureprint-quote-builder.web.app", "http://localhost:3000", "http://127.0.0.1:3000"],
}, async (req, res) => {
    try {
        // Set CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== "POST") {
            res.status(405).send("Use POST");
            return;
        }
        const { htmlContent, filename } = req.body;
        if (!htmlContent) {
            res.status(400).json({ error: "HTML content is required" });
            return;
        }
        logger.info("PDF generation requested", { filename });
        // Configure PDF generation options
        const options = {
            format: 'Letter',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            printBackground: true,
            margin: {
                top: '0.5in',
                right: '0.5in',
                bottom: '0.5in',
                left: '0.5in'
            }
        };
        // Generate PDF using html-pdf-node
        const file = { content: htmlContent };
        let pdfBuffer;
        try {
            pdfBuffer = await htmlPdf.generatePdf(file, options);
        }
        catch (error) {
            throw new Error(`PDF generation failed: ${error}`);
        }
        // Set proper headers for PDF download
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename || 'quote.pdf'}"`,
            'Content-Length': pdfBuffer.length.toString(),
            'Cache-Control': 'no-cache'
        });
        // Send the PDF buffer
        res.send(pdfBuffer);
    }
    catch (err) {
        logger.error("PDF generation failed", { error: err === null || err === void 0 ? void 0 : err.message });
        res.status(500).json({
            error: "Failed to generate PDF",
            details: err === null || err === void 0 ? void 0 : err.message
        });
    }
});
//# sourceMappingURL=pdfGenerator.js.map