const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class ImageHostingService {
  constructor() {
    this.imgbbApiKey = process.env.IMGBB_API_KEY;
    this.imgbbBaseUrl = 'https://api.imgbb.com/1/upload';
  }

  async uploadToImageBB(imageBuffer, filename = 'artwork') {
    try {
      if (!this.imgbbApiKey || this.imgbbApiKey === 'your_imgbb_api_key_here') {
        console.log('ImageBB API key not configured, skipping upload');
        return null;
      }

      const formData = new FormData();
      formData.append('key', this.imgbbApiKey);
      formData.append('image', imageBuffer.toString('base64'));
      formData.append('name', filename);
      formData.append('expiration', 2592000); // 30 days expiration

      console.log(`Uploading ${filename} to ImageBB...`);

      const response = await axios.post(this.imgbbBaseUrl, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000,
      });

      if (response.data && response.data.success) {
        const imageUrl = response.data.data.url;
        console.log(`Successfully uploaded to ImageBB: ${imageUrl}`);
        return {
          url: imageUrl,
          thumbnailUrl: response.data.data.thumb?.url || imageUrl,
          deleteUrl: response.data.data.delete_url,
          filename: response.data.data.title,
          size: response.data.data.size
        };
      } else {
        console.error('ImageBB upload failed:', response.data);
        return null;
      }
    } catch (error) {
      console.error('Error uploading to ImageBB:', error.message);
      return null;
    }
  }

  async downloadAndUpload(sourceUrl, filename = 'artwork') {
    try {
      console.log(`Downloading image from: ${sourceUrl}`);
      
      // Download the image
      const response = await axios({
        method: 'GET',
        url: sourceUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/*,*/*;q=0.8',
        }
      });

      const buffer = Buffer.from(response.data);
      
      // Check if we got a valid image
      const isImage = this.isValidImageBuffer(buffer);
      if (!isImage) {
        console.log('Downloaded content is not a valid image');
        return null;
      }

      // Upload to ImageBB
      return await this.uploadToImageBB(buffer, filename);

    } catch (error) {
      console.error('Error in downloadAndUpload:', error.message);
      return null;
    }
  }

  isValidImageBuffer(buffer) {
    if (!buffer || buffer.length < 8) return false;
    
    const bufferHex = buffer.slice(0, 8).toString('hex').toLowerCase();
    const bufferStr = buffer.slice(0, 6).toString();
    
    return bufferHex.startsWith('ffd8ff') || // JPEG
           bufferHex.startsWith('89504e47') || // PNG
           bufferStr === 'GIF87a' || bufferStr === 'GIF89a' || // GIF
           bufferHex.startsWith('424d') || // BMP
           (bufferHex.startsWith('52494646') && buffer.slice(8, 12).toString() === 'WEBP'); // WebP
  }

  async processGoogleDriveUrl(googleDriveUrl, filename) {
    try {
      // Try different Google Drive URL formats for direct download
      let directUrls = [];
      
      if (googleDriveUrl.includes('drive.google.com')) {
        let fileId = null;
        
        // Extract file ID from various Google Drive URL formats
        if (googleDriveUrl.includes('open?id=')) {
          const match = googleDriveUrl.match(/id=([a-zA-Z0-9-_]+)/);
          fileId = match ? match[1] : null;
        } else if (googleDriveUrl.includes('/file/d/')) {
          const match = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
          fileId = match ? match[1] : null;
        }
        
        if (fileId) {
          // Try multiple direct download URL formats
          directUrls = [
            `https://drive.google.com/uc?export=download&id=${fileId}`,
            `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000-h1000`,
            `https://lh3.googleusercontent.com/d/${fileId}`,
          ];
        }
      } else {
        // For non-Google Drive URLs, try direct download
        directUrls = [googleDriveUrl];
      }

      // Try each URL until we find one that works
      for (const url of directUrls) {
        console.log(`Trying direct download URL: ${url}`);
        const result = await this.downloadAndUpload(url, filename);
        if (result) {
          return result;
        }
      }

      console.log('All direct download attempts failed');
      return null;

    } catch (error) {
      console.error('Error processing Google Drive URL:', error.message);
      return null;
    }
  }
}

module.exports = new ImageHostingService();