const express = require('express');
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdf = require('pdf-poppler');
const imageHostingService = require('../services/imageHostingService');

const router = express.Router();

// Cache directory for processed artwork
const artworkCacheDir = path.join(process.cwd(), 'uploads/artwork-cache');
if (!fs.existsSync(artworkCacheDir)) {
  fs.mkdirSync(artworkCacheDir, { recursive: true });
}

// Serve a sample artwork for testing
router.get('/sample/:name', (req, res) => {
  const { name } = req.params;
  const { width = 400, height = 300 } = req.query;
  
  // Create a sample artwork SVG
  const sampleSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Background -->
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#e3f2fd;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#bbdefb;stop-opacity:1" />
        </linearGradient>
        <pattern id="dots" patternUnits="userSpaceOnUse" width="20" height="20">
          <circle cx="10" cy="10" r="2" fill="#64b5f6" opacity="0.3"/>
        </pattern>
      </defs>
      
      <!-- Background -->
      <rect width="100%" height="100%" fill="url(#bgGrad)" stroke="#2196f3" stroke-width="2"/>
      <rect width="100%" height="100%" fill="url(#dots)"/>
      
      <!-- Sample Logo/Brand -->
      <circle cx="${width/2}" cy="${height/3}" r="50" fill="#2196f3" opacity="0.8"/>
      <text x="${width/2}" y="${height/3 + 5}" text-anchor="middle" font-family="Arial, sans-serif" 
            font-size="16" font-weight="bold" fill="white">LOGO</text>
      
      <!-- Sample Text -->
      <text x="${width/2}" y="${height/2 + 20}" text-anchor="middle" font-family="Arial, sans-serif" 
            font-size="18" font-weight="bold" fill="#1976d2">${name || 'Sample Artwork'}</text>
      <text x="${width/2}" y="${height/2 + 45}" text-anchor="middle" font-family="Arial, sans-serif" 
            font-size="12" fill="#1976d2">Custom Printed Product</text>
      
      <!-- Decorative elements -->
      <rect x="20" y="20" width="${width-40}" height="${height-40}" fill="none" 
            stroke="#2196f3" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
      
      <!-- Bottom text -->
      <text x="${width/2}" y="${height - 30}" text-anchor="middle" font-family="Arial, sans-serif" 
            font-size="10" fill="#666">www.shureprint.com</text>
    </svg>
  `;
  
  res.set({
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(sampleSvg);
});

// Rehost artwork via ImageBB for reliable access
router.get('/rehost/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const { url, name } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    console.log(`Rehosting artwork: ${name || 'Unknown'} from ${url}`);

    // Try to rehost via ImageBB
    const hostedResult = await imageHostingService.processGoogleDriveUrl(url, name || 'artwork');
    
    if (hostedResult && hostedResult.url) {
      console.log(`Successfully rehosted to: ${hostedResult.url}`);
      // Redirect to the ImageBB hosted image
      return res.redirect(hostedResult.url);
    } else {
      console.log('ImageBB rehosting failed, falling back to sample artwork');
      // Generate and serve sample artwork directly instead of redirecting
      const sampleName = name || 'artwork';
      const width = 800;
      const height = 400;
      
      const sampleSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <!-- Background -->
          <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#e3f2fd;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#bbdefb;stop-opacity:1" />
            </linearGradient>
            <pattern id="dots" patternUnits="userSpaceOnUse" width="20" height="20">
              <circle cx="10" cy="10" r="2" fill="#64b5f6" opacity="0.3"/>
            </pattern>
          </defs>
          
          <!-- Background -->
          <rect width="100%" height="100%" fill="url(#bgGrad)" stroke="#2196f3" stroke-width="2"/>
          <rect width="100%" height="100%" fill="url(#dots)"/>
          
          <!-- Sample Logo/Brand -->
          <circle cx="${width/2}" cy="${height/3}" r="50" fill="#2196f3" opacity="0.8"/>
          <text x="${width/2}" y="${height/3 + 5}" text-anchor="middle" font-family="Arial, sans-serif" 
                font-size="16" font-weight="bold" fill="white">LOGO</text>
          
          <!-- Sample Text -->
          <text x="${width/2}" y="${height/2 + 20}" text-anchor="middle" font-family="Arial, sans-serif" 
                font-size="18" font-weight="bold" fill="#1976d2">${sampleName}</text>
          <text x="${width/2}" y="${height/2 + 45}" text-anchor="middle" font-family="Arial, sans-serif" 
                font-size="12" fill="#1976d2">Custom Printed Product</text>
          
          <!-- Decorative elements -->
          <rect x="20" y="20" width="${width-40}" height="${height-40}" fill="none" 
                stroke="#2196f3" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
          
          <!-- Bottom text -->
          <text x="${width/2}" y="${height - 30}" text-anchor="middle" font-family="Arial, sans-serif" 
                font-size="10" fill="#666">www.shureprint.com</text>
        </svg>
      `;
      
      res.set({
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      });
      return res.send(sampleSvg);
    }

  } catch (error) {
    console.error('Error rehosting artwork:', error.message);
    // Fallback to sample artwork on error
    const sampleName = req.query.name || 'artwork';
    const width = 800;
    const height = 400;
    
    const sampleSvg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#e3f2fd;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#bbdefb;stop-opacity:1" />
          </linearGradient>
          <pattern id="dots" patternUnits="userSpaceOnUse" width="20" height="20">
            <circle cx="10" cy="10" r="2" fill="#64b5f6" opacity="0.3"/>
          </pattern>
        </defs>
        
        <!-- Background -->
        <rect width="100%" height="100%" fill="url(#bgGrad)" stroke="#2196f3" stroke-width="2"/>
        <rect width="100%" height="100%" fill="url(#dots)"/>
        
        <!-- Sample Logo/Brand -->
        <circle cx="${width/2}" cy="${height/3}" r="50" fill="#2196f3" opacity="0.8"/>
        <text x="${width/2}" y="${height/3 + 5}" text-anchor="middle" font-family="Arial, sans-serif" 
              font-size="16" font-weight="bold" fill="white">LOGO</text>
        
        <!-- Sample Text -->
        <text x="${width/2}" y="${height/2 + 20}" text-anchor="middle" font-family="Arial, sans-serif" 
              font-size="18" font-weight="bold" fill="#1976d2">${sampleName}</text>
        <text x="${width/2}" y="${height/2 + 45}" text-anchor="middle" font-family="Arial, sans-serif" 
              font-size="12" fill="#1976d2">Custom Printed Product</text>
        
        <!-- Decorative elements -->
        <rect x="20" y="20" width="${width-40}" height="${height-40}" fill="none" 
              stroke="#2196f3" stroke-width="1" stroke-dasharray="5,5" opacity="0.5"/>
        
        <!-- Bottom text -->
        <text x="${width/2}" y="${height - 30}" text-anchor="middle" font-family="Arial, sans-serif" 
              font-size="10" fill="#666">www.shureprint.com</text>
      </svg>
    `;
    
    res.set({
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    });
    return res.send(sampleSvg);
  }
});

// Process and serve artwork from Google Drive or other sources
router.get('/process/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const { url, name } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Generate cache key
    const cacheKey = crypto.createHash('md5').update(url).digest('hex');
    const cacheFilePath = path.join(artworkCacheDir, `${cacheKey}.png`);

    // Check if already cached
    if (fs.existsSync(cacheFilePath)) {
      return res.sendFile(cacheFilePath);
    }

    // Convert Google Drive sharing URL to direct download URL
    let downloadUrl = url;
    if (url.includes('drive.google.com')) {
      let fileId = null;
      
      // Handle different Google Drive URL formats
      if (url.includes('open?id=')) {
        const match = url.match(/id=([a-zA-Z0-9-_]+)/);
        fileId = match ? match[1] : null;
      } else if (url.includes('/file/d/')) {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
        fileId = match ? match[1] : null;
      } else if (url.includes('drive.google.com/uc?id=')) {
        const match = url.match(/id=([a-zA-Z0-9-_]+)/);
        fileId = match ? match[1] : null;
      }
      
      if (fileId) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }

    console.log(`Processing artwork: ${name || 'Unknown'}`);
    console.log(`Download URL: ${downloadUrl}`);

    // Download the file
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log(`Download completed. Status: ${response.status}, Content-Type: ${response.headers['content-type']}, Size: ${response.data.byteLength} bytes`);

    const buffer = Buffer.from(response.data);
    
    // Check if we got HTML instead of the actual file (common with Google Drive)
    const isHTML = buffer.slice(0, 15).toString().toLowerCase().includes('<!doctype') || 
                   buffer.slice(0, 6).toString().toLowerCase().includes('<html');
    
    if (isHTML) {
      console.log('Received HTML instead of file - likely a sharing page');
      const htmlPlaceholderSvg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#fff3cd" stroke="#856404" stroke-width="2"/>
          <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#856404">⚠️</text>
          <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#856404">File Access Issue</text>
          <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="11" fill="#856404">${name || 'Unknown file'}</text>
          <text x="200" y="190" text-anchor="middle" font-family="Arial" font-size="10" fill="#856404">Google Drive file may be private</text>
          <text x="200" y="210" text-anchor="middle" font-family="Arial" font-size="9" fill="#856404">Please share publicly or upload directly</text>
        </svg>
      `;
      
      res.set('Content-Type', 'image/svg+xml');
      return res.send(htmlPlaceholderSvg);
    }
    
    // Determine file type from buffer
    const isPDF = buffer.slice(0, 4).toString() === '%PDF';
    
    // More robust image detection
    const bufferHex = buffer.slice(0, 8).toString('hex').toLowerCase();
    const bufferStr = buffer.slice(0, 6).toString();
    
    const isImage = bufferHex.startsWith('ffd8ff') || // JPEG
                   bufferHex.startsWith('89504e47') || // PNG
                   bufferStr === 'GIF87a' || bufferStr === 'GIF89a' || // GIF
                   bufferHex.startsWith('424d') || // BMP
                   bufferHex.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP'; // WebP

    let processedBuffer;

    if (isPDF) {
      // Convert PDF to image using pdf-poppler
      console.log('Converting PDF to image...');
      
      // Save PDF temporarily
      const tempPdfPath = path.join(artworkCacheDir, `temp_${cacheKey}.pdf`);
      fs.writeFileSync(tempPdfPath, buffer);
      
      try {
        // Convert first page of PDF to image
        const options = {
          format: 'png',
          out_dir: artworkCacheDir,
          out_prefix: `pdf_${cacheKey}`,
          page: 1, // Only convert first page
          single_file: true
        };
        
        const results = await pdf.convert(tempPdfPath, options);
        
        // Read the converted image
        const convertedImagePath = path.join(artworkCacheDir, `pdf_${cacheKey}-1.png`);
        
        if (fs.existsSync(convertedImagePath)) {
          const pdfImageBuffer = fs.readFileSync(convertedImagePath);
          
          // Process with Sharp to resize if needed
          processedBuffer = await sharp(pdfImageBuffer)
            .resize(800, 600, { 
              fit: 'inside', 
              withoutEnlargement: true 
            })
            .png()
            .toBuffer();
          
          // Clean up temporary files
          fs.unlinkSync(tempPdfPath);
          fs.unlinkSync(convertedImagePath);
        } else {
          throw new Error('PDF conversion failed - no output file generated');
        }
      } catch (pdfError) {
        console.error('PDF conversion error:', pdfError.message);
        
        // Clean up temp file
        if (fs.existsSync(tempPdfPath)) {
          fs.unlinkSync(tempPdfPath);
        }
        
        // Return a PDF-specific placeholder
        const pdfPlaceholderSvg = `
          <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="400" height="300" fill="#f8f8f8" stroke="#ddd" stroke-width="2"/>
            <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">📄</text>
            <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">PDF Document</text>
            <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Preview Unavailable</text>
            <text x="200" y="200" text-anchor="middle" font-family="Arial" font-size="10" fill="#999">Unable to convert PDF to image</text>
          </svg>
        `;
        
        res.set('Content-Type', 'image/svg+xml');
        return res.send(pdfPlaceholderSvg);
      }
    } else if (isImage) {
      // Process image with Sharp - resize if too large, convert to PNG
      processedBuffer = await sharp(buffer)
        .resize(800, 600, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .png()
        .toBuffer();
    } else {
      console.log(`Unsupported file type detected. Buffer hex: ${bufferHex}, Buffer string: ${bufferStr}`);
      
      // Instead of returning error, provide a placeholder with file info
      const placeholderSvg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f0f0f0" stroke="#ddd" stroke-width="2"/>
          <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">📄</text>
          <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Unsupported File Type</text>
          <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="11" fill="#666">${name || 'Unknown file'}</text>
          <text x="200" y="190" text-anchor="middle" font-family="Arial" font-size="10" fill="#999">Size: ${Math.round(buffer.length / 1024)}KB</text>
          <text x="200" y="210" text-anchor="middle" font-family="Arial" font-size="9" fill="#999">Please use JPG, PNG, GIF, or PDF</text>
        </svg>
      `;
      
      res.set('Content-Type', 'image/svg+xml');
      return res.send(placeholderSvg);
    }

    // Save to cache
    fs.writeFileSync(cacheFilePath, processedBuffer);

    // Send the processed image
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    });
    res.send(processedBuffer);

  } catch (error) {
    console.error('Artwork processing error:', error.message);
    
    // Return appropriate placeholder based on expected file type
    const fileName = (req.query.name || '').toLowerCase();
    const isProbablyPDF = fileName.includes('.pdf');
    
    let placeholderSvg;
    if (isProbablyPDF) {
      placeholderSvg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f8f8f8" stroke="#ddd" stroke-width="2"/>
          <text x="200" y="120" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">📄</text>
          <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">PDF Document</text>
          <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Preview Unavailable</text>
          <text x="200" y="200" text-anchor="middle" font-family="Arial" font-size="10" fill="#999">Unable to download or convert file</text>
        </svg>
      `;
    } else {
      placeholderSvg = `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="300" fill="#f0f0f0" stroke="#ddd" stroke-width="2"/>
          <text x="200" y="140" text-anchor="middle" font-family="Arial" font-size="16" fill="#666">🎨</text>
          <text x="200" y="170" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Artwork Preview</text>
          <text x="200" y="190" text-anchor="middle" font-family="Arial" font-size="12" fill="#666">Unavailable</text>
        </svg>
      `;
    }
    
    res.set('Content-Type', 'image/svg+xml');
    res.send(placeholderSvg);
  }
});

// Clean up old cache files (run periodically)
const cleanupCache = () => {
  try {
    const files = fs.readdirSync(artworkCacheDir);
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
      const filePath = path.join(artworkCacheDir, file);
      const stats = fs.statSync(filePath);
      if (stats.mtime.getTime() < oneWeekAgo) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up old artwork cache: ${file}`);
      }
    });
  } catch (error) {
    console.error('Cache cleanup error:', error.message);
  }
};

// Run cleanup every hour
setInterval(cleanupCache, 60 * 60 * 1000);

module.exports = router;