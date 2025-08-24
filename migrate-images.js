// Image Migration Script - Download Airtable images and upload to Supabase
// Run with: node migrate-images.js

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIyNDk0OSwiZXhwIjoyMDcwODAwOTQ5fQ.C2W-I7UrGIYf3T0Yva3HbDe-DU-o4y7vqJvAoXMnpbQ'; // Service role key needed for storage

// Initialize Supabase with service role key (needed for storage operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Storage bucket name
const BUCKET_NAME = 'product-images';

// Helper function to download image from URL
async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const request = client.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(filename);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filename);
        });
        file.on('error', (err) => {
          fs.unlink(filename, () => {}); // Delete the file async
          reject(err);
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirects
        downloadImage(response.headers.location, filename).then(resolve).catch(reject);
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    });
    
    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Helper function to get file extension from URL or content type
function getFileExtension(url, contentType = '') {
  // Try URL first
  const urlPath = new URL(url).pathname;
  const urlExt = path.extname(urlPath).toLowerCase();
  if (urlExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(urlExt)) {
    return urlExt;
  }
  
  // Fallback to content type
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('webp')) return '.webp';
  
  return '.jpg'; // Default fallback
}

// Main migration function
async function migrateImages() {
  console.log('🚀 Starting image migration from Airtable to Supabase...');
  
  try {
    // 1. Create storage bucket if it doesn't exist
    console.log('📦 Setting up storage bucket...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return;
    }
    
    const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`Creating bucket: ${BUCKET_NAME}`);
      const { error: createBucketError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024, // 10MB limit
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      });
      
      if (createBucketError) {
        console.error('Error creating bucket:', createBucketError);
        return;
      }
    }
    
    // 2. Get all products with image URLs
    console.log('📋 Loading products from database...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, image_url, image, images')
      .not('image_url', 'is', null);
    
    if (productsError) {
      console.error('Error loading products:', productsError);
      return;
    }
    
    console.log(`Found ${products.length} products with image URLs`);
    
    // 3. Process each product
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };
    
    // Create temp directory
    const tempDir = path.join(__dirname, 'temp-images');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const progress = `[${i + 1}/${products.length}]`;
      
      console.log(`${progress} Processing: ${product.name || product.id}`);
      
      try {
        // Get the image URL (try different fields)
        let imageUrl = product.image_url || product.image;
        
        // Handle images array
        if (!imageUrl && product.images && Array.isArray(product.images)) {
          const firstImage = product.images[0];
          imageUrl = typeof firstImage === 'string' ? firstImage : firstImage?.url;
        }
        
        if (!imageUrl) {
          console.log(`${progress} No image URL found, skipping`);
          results.skipped++;
          continue;
        }
        
        // Skip non-Airtable URLs (already migrated or external)
        if (!imageUrl.includes('airtable')) {
          console.log(`${progress} Non-Airtable URL, skipping: ${imageUrl.substring(0, 50)}...`);
          results.skipped++;
          continue;
        }
        
        console.log(`${progress} Downloading from Airtable...`);
        
        // Generate filename
        const fileExt = getFileExtension(imageUrl);
        const filename = `${product.id}${fileExt}`;
        const tempPath = path.join(tempDir, filename);
        
        // Download the image
        try {
          await downloadImage(imageUrl, tempPath);
          console.log(`${progress} Downloaded successfully`);
        } catch (downloadError) {
          console.log(`${progress} Download failed: ${downloadError.message}`);
          results.failed++;
          results.details.push({
            productId: product.id,
            name: product.name,
            error: downloadError.message,
            originalUrl: imageUrl
          });
          continue;
        }
        
        // Upload to Supabase storage
        console.log(`${progress} Uploading to Supabase storage...`);
        const fileBuffer = fs.readFileSync(tempPath);
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filename, fileBuffer, {
            contentType: `image/${fileExt.substring(1)}`,
            upsert: true
          });
        
        if (uploadError) {
          console.log(`${progress} Upload failed: ${uploadError.message}`);
          results.failed++;
          results.details.push({
            productId: product.id,
            name: product.name,
            error: uploadError.message,
            originalUrl: imageUrl
          });
          continue;
        }
        
        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filename);
        
        const newImageUrl = publicUrlData.publicUrl;
        
        // Update product record
        console.log(`${progress} Updating product record...`);
        const { error: updateError } = await supabase
          .from('products')
          .update({ 
            image_url: newImageUrl,
            // Keep track of migration
            original_airtable_url: imageUrl,
            migrated_at: new Date().toISOString()
          })
          .eq('id', product.id);
        
        if (updateError) {
          console.log(`${progress} Database update failed: ${updateError.message}`);
          results.failed++;
          results.details.push({
            productId: product.id,
            name: product.name,
            error: updateError.message,
            originalUrl: imageUrl,
            newUrl: newImageUrl
          });
        } else {
          console.log(`${progress} ✅ Migration complete: ${newImageUrl}`);
          results.success++;
        }
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`${progress} Unexpected error: ${error.message}`);
        results.failed++;
        results.details.push({
          productId: product.id,
          name: product.name,
          error: error.message
        });
      }
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    
    // Print results
    console.log('\n🎉 Migration completed!');
    console.log(`✅ Success: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏭️ Skipped: ${results.skipped}`);
    
    if (results.failed > 0) {
      console.log('\n❌ Failed migrations:');
      results.details.forEach(detail => {
        console.log(`- ${detail.name || detail.productId}: ${detail.error}`);
      });
    }
    
    // Save detailed results
    const reportPath = path.join(__dirname, 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📊 Detailed report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run the migration
if (require.main === module) {
  migrateImages().then(() => {
    console.log('Migration script finished');
    process.exit(0);
  }).catch(error => {
    console.error('Migration script error:', error);
    process.exit(1);
  });
}

module.exports = { migrateImages };