// Migrate Images to Supabase Storage
// Downloads fresh Airtable images and uploads them to Supabase storage
// Then updates product records with new Supabase storage URLs

const Airtable = require('airtable');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration from .env file
require('dotenv').config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.BASE_ID;

// Use the same Supabase instance as the product catalog but with service key for full permissions
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

// Initialize clients
const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY });
const base = airtable.base(AIRTABLE_BASE_ID);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create temp directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp_images');
const BUCKET_NAME = 'product-images';

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Helper function to download image
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(filepath);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filepath);
        });
        file.on('error', reject);
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', reject);
  });
}

// Helper function to get file extension from URL or content type
function getFileExtension(url, contentType) {
  // Try to get from URL first
  const urlExt = path.extname(new URL(url).pathname).toLowerCase();
  if (urlExt && ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(urlExt)) {
    return urlExt;
  }
  
  // Fallback to content type
  const typeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg', 
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic'
  };
  
  return typeMap[contentType] || '.jpg';
}

// Helper function to sanitize filename
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
}

async function migrateImagesToSupabase() {
  console.log('🚀 Starting image migration to Supabase storage...');
  
  try {
    // Step 1: Check/create storage bucket
    console.log(`📦 Checking storage bucket: ${BUCKET_NAME}`);
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
    
    if (bucketListError) {
      console.log('⚠️ Could not list buckets:', bucketListError.message);
      console.log('💡 You may need to create the bucket manually in Supabase Dashboard');
    } else {
      const bucketExists = buckets.find(bucket => bucket.name === BUCKET_NAME);
      if (!bucketExists) {
        console.log(`📦 Creating bucket: ${BUCKET_NAME}`);
        const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: 52428800 // 50MB
        });
        
        if (createError) {
          console.log('⚠️ Could not create bucket:', createError.message);
          console.log('💡 Please create the bucket manually in Supabase Dashboard with public access');
        } else {
          console.log('✅ Bucket created successfully');
        }
      } else {
        console.log('✅ Bucket already exists');
      }
    }
    
    // Step 2: Get all Airtable records with images
    console.log('📋 Fetching records from Airtable...');
    const airtableRecords = [];
    await base('Products').select({}).eachPage((records, fetchNextPage) => {
      airtableRecords.push(...records);
      fetchNextPage();
    });
    
    console.log(`✅ Found ${airtableRecords.length} records in Airtable`);
    
    // Step 3: Get all Supabase products  
    console.log('📋 Loading products from Supabase...');
    const { data: supabaseProducts, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }
    
    console.log(`✅ Found ${supabaseProducts.length} products in Supabase`);
    
    // Step 4: Process each product with images
    const results = {
      processed: 0,
      downloaded: 0,
      uploaded: 0,
      updated: 0,
      errors: []
    };
    
    for (const supabaseProduct of supabaseProducts) {
      try {
        // Match with Airtable record
        let airtableRecord = null;
        
        if (supabaseProduct.airtable_record_id) {
          airtableRecord = airtableRecords.find(r => r.id === supabaseProduct.airtable_record_id);
        }
        
        if (!airtableRecord && supabaseProduct.product_name) {
          airtableRecord = airtableRecords.find(r => 
            r.fields.Name === supabaseProduct.product_name ||
            r.fields.product_name === supabaseProduct.product_name ||
            r.fields['Product Name'] === supabaseProduct.product_name
          );
        }
        
        if (!airtableRecord) {
          continue;
        }
        
        // Extract image URLs from Airtable record
        const freshImages = [];
        const imageFields = ['Images', 'images', 'Image', 'Photos', 'pictures'];
        
        for (const fieldName of imageFields) {
          const fieldValue = airtableRecord.fields[fieldName];
          if (fieldValue && Array.isArray(fieldValue)) {
            for (const attachment of fieldValue) {
              if (attachment.url) {
                freshImages.push({
                  url: attachment.url,
                  filename: attachment.filename || 'image',
                  type: attachment.type || 'image/jpeg'
                });
              }
            }
          }
        }
        
        if (freshImages.length === 0) {
          continue;
        }
        
        results.processed++;
        console.log(`\n📦 Processing: ${supabaseProduct.product_name} (${freshImages.length} images)`);
        
        const uploadedImageUrls = [];
        
        // Process each image
        for (let i = 0; i < freshImages.length; i++) {
          const image = freshImages[i];
          
          try {
            // Create unique filename
            const productSlug = sanitizeFilename(supabaseProduct.product_name);
            const timestamp = Date.now();
            const extension = getFileExtension(image.url, image.type);
            const filename = `${productSlug}_${i + 1}_${timestamp}${extension}`;
            const localPath = path.join(TEMP_DIR, filename);
            
            // Download image
            console.log(`   📥 Downloading image ${i + 1}...`);
            await downloadImage(image.url, localPath);
            results.downloaded++;
            
            // Upload to Supabase storage
            console.log(`   📤 Uploading to Supabase storage...`);
            const fileBuffer = fs.readFileSync(localPath);
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(filename, fileBuffer, {
                contentType: image.type,
                cacheControl: '3600'
              });
            
            if (uploadError) {
              throw new Error(`Upload failed: ${uploadError.message}`);
            }
            
            // Get public URL
            const { data: urlData } = supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(filename);
            
            uploadedImageUrls.push(urlData.publicUrl);
            results.uploaded++;
            
            // Clean up temp file
            fs.unlinkSync(localPath);
            
            console.log(`   ✅ Uploaded: ${filename}`);
            
          } catch (imageError) {
            console.log(`   ❌ Failed to process image ${i + 1}: ${imageError.message}`);
            results.errors.push({
              product: supabaseProduct.product_name,
              image: i + 1,
              error: imageError.message
            });
          }
        }
        
        // Update product record with new image URLs if we have uploads
        if (uploadedImageUrls.length > 0) {
          console.log(`   📝 Updating product record with ${uploadedImageUrls.length} new URLs...`);
          
          const { error: updateError } = await supabase
            .from('products')
            .update({
              images: uploadedImageUrls,
              images_updated_at: new Date().toISOString()
            })
            .eq('id', supabaseProduct.id);
          
          if (updateError) {
            console.log(`   ⚠️ Could not update product record: ${updateError.message}`);
            results.errors.push({
              product: supabaseProduct.product_name,
              error: `Update failed: ${updateError.message}`
            });
          } else {
            results.updated++;
            console.log(`   ✅ Product record updated successfully`);
          }
        }
        
      } catch (productError) {
        console.log(`❌ Error processing ${supabaseProduct.product_name}: ${productError.message}`);
        results.errors.push({
          product: supabaseProduct.product_name,
          error: productError.message
        });
      }
    }
    
    // Final results
    console.log('\n🎉 Migration completed!');
    console.log(`📊 RESULTS:`);
    console.log(`✅ Products processed: ${results.processed}`);
    console.log(`📥 Images downloaded: ${results.downloaded}`);
    console.log(`📤 Images uploaded: ${results.uploaded}`);
    console.log(`📝 Records updated: ${results.updated}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Error details:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.product}: ${error.error}`);
      });
    }
    
    console.log('\n💡 Next steps:');
    console.log('1. Test the product catalog to verify images are loading');
    console.log('2. Remove dependency on Airtable image URLs');
    console.log('3. Clean up any remaining temp files');
    
    // Clean up temp directory
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log('🧹 Cleaned up temp directory');
    } catch (cleanupError) {
      console.log('⚠️ Could not clean up temp directory:', cleanupError.message);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    // Clean up temp directory on error
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Image Migration to Supabase Storage');
  console.log(`🔑 Airtable API Key: ${AIRTABLE_API_KEY ? 'Found' : 'Missing'}`);
  console.log(`📦 Airtable Base ID: ${AIRTABLE_BASE_ID || 'Missing'}`);
  console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`);
  console.log(`📁 Storage Bucket: ${BUCKET_NAME}`);
  console.log('');
  
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Missing Airtable credentials in .env file!');
    console.error('Make sure AIRTABLE_TOKEN and BASE_ID are set.');
    process.exit(1);
  }
  
  migrateImagesToSupabase().then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { migrateImagesToSupabase };