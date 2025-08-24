// Server-side Image Migration Script
// This bypasses CORS restrictions that prevent browser-based downloads

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';
const BUCKET_NAME = 'product-images';

// Initialize Supabase with anon key (should work for uploads due to RLS policies)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to download image from URL
async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    console.log(`    Downloading: ${url}`);
    
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };
    
    const request = client.get(url, options, (response) => {
      if (response.statusCode === 200) {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(filename, buffer);
          resolve(filename);
        });
        response.on('error', reject);
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        const redirectUrl = response.headers.location;
        console.log(`    Redirecting to: ${redirectUrl}`);
        downloadImage(redirectUrl, filename).then(resolve).catch(reject);
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    });
    
    request.on('error', reject);
    request.setTimeout(15000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Helper function to get file extension
function getFileExtension(url, buffer) {
  // Check magic bytes for file type
  if (buffer) {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return '.jpg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return '.png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return '.gif';
    if (buffer.toString('ascii', 0, 4) === 'RIFF') return '.webp';
  }
  
  // Fallback to URL
  try {
    const urlPath = new URL(url).pathname;
    const ext = path.extname(urlPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return ext;
    }
  } catch (e) {}
  
  return '.jpg'; // Default fallback
}

// Helper function to extract first Airtable image URL from product
function extractAirtableImageUrl(product) {
  const possibleImageFields = ['images', 'images_from_supplier'];
  
  for (const field of possibleImageFields) {
    const value = product[field];
    
    // Handle string values
    if (typeof value === 'string' && value.includes('airtable')) {
      return value;
    }
    
    // Handle array values
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.includes('airtable')) {
          return item;
        }
        if (item && typeof item === 'object' && item.url && item.url.includes('airtable')) {
          return item.url;
        }
      }
    }
    
    // Handle JSON string arrays (common in Airtable exports)
    if (typeof value === 'string' && value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.includes('airtable')) {
              return item;
            }
            if (item && typeof item === 'object' && item.url && item.url.includes('airtable')) {
              return item.url;
            }
          }
        }
      } catch (e) {
        // Not valid JSON, continue
      }
    }
  }
  
  return null;
}

// Main migration function
async function migrateImages() {
  console.log('🚀 Starting server-side image migration...');
  
  try {
    // Create temp directory
    const tempDir = path.join(__dirname, 'temp-images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // Load all products
    console.log('📋 Loading products from Supabase...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');
    
    if (productsError) {
      console.error('❌ Failed to load products:', productsError.message);
      return;
    }
    
    console.log(`✅ Found ${products.length} products`);
    
    // Filter products with Airtable images
    const productsWithAirtableImages = products.filter(product => {
      return extractAirtableImageUrl(product) !== null;
    });
    
    console.log(`✅ Found ${productsWithAirtableImages.length} products with Airtable images`);
    
    if (productsWithAirtableImages.length === 0) {
      console.log('ℹ️ No products with Airtable images found. Migration complete.');
      return;
    }
    
    // Process each product
    const results = { success: 0, failed: 0, skipped: 0, errors: [] };
    
    for (let i = 0; i < productsWithAirtableImages.length; i++) {
      const product = productsWithAirtableImages[i];
      const progress = i + 1;
      const total = productsWithAirtableImages.length;
      
      console.log(`\n[${progress}/${total}] Processing: ${product.product_name || product.id}`);
      
      try {
        // Extract image URL
        const imageUrl = extractAirtableImageUrl(product);
        
        if (!imageUrl) {
          console.log('  ⏭️ No Airtable image found, skipping');
          results.skipped++;
          continue;
        }
        
        console.log(`  🔗 Found image: ${imageUrl.substring(0, 50)}...`);
        
        // Generate temp filename
        const tempFilename = `temp_${product.id}_${Date.now()}`;
        const tempPath = path.join(tempDir, tempFilename);
        
        // Download the image
        try {
          await downloadImage(imageUrl, tempPath);
          console.log('  ✅ Downloaded successfully');
        } catch (downloadError) {
          console.log(`  ❌ Download failed: ${downloadError.message}`);
          results.failed++;
          results.errors.push({
            productId: product.id,
            productName: product.product_name,
            error: downloadError.message,
            imageUrl: imageUrl
          });
          continue;
        }
        
        // Read file and determine extension
        const fileBuffer = fs.readFileSync(tempPath);
        const fileExt = getFileExtension(imageUrl, fileBuffer);
        const finalFilename = `${product.id}${fileExt}`;
        
        console.log(`  📤 Uploading to Supabase storage as: ${finalFilename}`);
        
        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(finalFilename, fileBuffer, {
            contentType: `image/${fileExt.substring(1)}`,
            upsert: true
          });
        
        if (uploadError) {
          console.log(`  ❌ Upload failed: ${uploadError.message}`);
          results.failed++;
          results.errors.push({
            productId: product.id,
            productName: product.product_name,
            error: uploadError.message,
            step: 'upload'
          });
          fs.unlinkSync(tempPath);
          continue;
        }
        
        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(finalFilename);
        
        const newImageUrl = publicUrlData.publicUrl;
        console.log(`  🌐 New URL: ${newImageUrl}`);
        
        // Update product record
        console.log('  💾 Updating product record...');
        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            image_url: newImageUrl,
            original_airtable_url: imageUrl,
            migrated_at: new Date().toISOString()
          })
          .eq('id', product.id);
        
        if (updateError) {
          console.log(`  ❌ Database update failed: ${updateError.message}`);
          results.failed++;
          results.errors.push({
            productId: product.id,
            productName: product.product_name,
            error: updateError.message,
            step: 'database_update',
            newImageUrl: newImageUrl
          });
        } else {
          console.log('  ✅ Migration completed successfully!');
          results.success++;
        }
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        // Small delay to avoid overwhelming servers
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`  ❌ Unexpected error: ${error.message}`);
        results.failed++;
        results.errors.push({
          productId: product.id,
          productName: product.product_name,
          error: error.message,
          step: 'unexpected'
        });
      }
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    
    // Final results
    console.log('\n🎉 Migration completed!');
    console.log(`✅ Successfully migrated: ${results.success} products`);
    console.log(`❌ Failed: ${results.failed} products`);
    console.log(`⏭️ Skipped: ${results.skipped} products`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Detailed error report:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.productName || error.productId}:`);
        console.log(`   Error: ${error.error}`);
        if (error.step) console.log(`   Step: ${error.step}`);
        if (error.imageUrl) console.log(`   URL: ${error.imageUrl.substring(0, 80)}...`);
      });
      
      // Save error report
      const reportPath = path.join(__dirname, 'migration-error-report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        summary: results,
        errors: results.errors
      }, null, 2));
      console.log(`\n📊 Detailed error report saved to: ${reportPath}`);
    }
    
  } catch (error) {
    console.error('💥 Migration failed with critical error:', error.message);
  }
}

// Run the migration
if (require.main === module) {
  migrateImages().then(() => {
    console.log('\n🏁 Migration script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Migration script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { migrateImages };