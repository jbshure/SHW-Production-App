import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as htmlPdf from "html-pdf-node";

export const generatePDF = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
    cors: ["https://shureprint-quote-builder.web.app", "http://localhost:3000", "http://127.0.0.1:3000"],
  },
  async (req, res) => {
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
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await htmlPdf.generatePdf(file, options) as any;
      } catch (error) {
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
      
    } catch (err: any) {
      logger.error("PDF generation failed", { error: err?.message });
      res.status(500).json({ 
        error: "Failed to generate PDF", 
        details: err?.message 
      });
    }
  }
);