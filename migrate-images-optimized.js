// Optimized Image Migration to Supabase Storage
// Downloads fresh Airtable images, compresses them, and uploads to Supabase storage
// Handles file size limits and provides better error handling

const Airtable = require('airtable');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

// Configuration from .env file
require('dotenv').config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.BASE_ID;

// Use the same Supabase instance as the product catalog
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

// Initialize clients
const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY });
const base = airtable.base(AIRTABLE_BASE_ID);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create temp directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp_images');
const BUCKET_NAME = 'product-images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
const MAX_DIMENSION = 1920; // Max width/height
const JPEG_QUALITY = 85;

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

// Helper function to optimize image
async function optimizeImage(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    let pipeline = image;
    
    // Resize if too large
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Convert to JPEG and compress
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, progressive: true });
    
    await pipeline.toFile(outputPath);
    
    // Check file size
    const stats = fs.statSync(outputPath);
    if (stats.size > MAX_FILE_SIZE) {
      // If still too large, reduce quality further
      await sharp(inputPath)
        .resize(1280, 1280, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 70, progressive: true })
        .toFile(outputPath);
    }
    
    return outputPath;
  } catch (error) {
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}

// Helper function to sanitize filename
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
}

async function migrateImagesToSupabaseOptimized() {
  console.log('🚀 Starting optimized image migration to Supabase storage...');
  console.log('💡 NOTE: Please ensure the "product-images" bucket exists in Supabase Dashboard');
  console.log('   with public access enabled before running this script.\n');
  
  try {
    // Step 1: Check if bucket exists (don't try to create)
    console.log(`📦 Checking if storage bucket "${BUCKET_NAME}" is accessible...`);
    const { data: testList, error: testError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 1 });
    
    if (testError) {
      throw new Error(`Storage bucket "${BUCKET_NAME}" not accessible. Please create it manually in Supabase Dashboard with public access. Error: ${testError.message}`);
    }
    
    console.log('✅ Storage bucket is accessible');
    
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
    
    // Step 4: Process each product with images (limit to first 5 for testing)
    console.log('\n🔧 Processing first 5 products for testing...');
    
    const results = {
      processed: 0,
      downloaded: 0,
      optimized: 0,
      uploaded: 0,
      updated: 0,
      errors: [],
      skipped: 0
    };
    
    let processedCount = 0;
    const MAX_PRODUCTS = 5; // Limit for testing
    
    for (const supabaseProduct of supabaseProducts) {
      if (processedCount >= MAX_PRODUCTS) {
        results.skipped = supabaseProducts.length - MAX_PRODUCTS;
        break;
      }
      
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
        
        processedCount++;
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
            const filename = `${productSlug}_${i + 1}_${timestamp}.jpg`; // Always use .jpg after optimization
            const originalPath = path.join(TEMP_DIR, `original_${filename}`);
            const optimizedPath = path.join(TEMP_DIR, filename);
            
            // Download image
            console.log(`   📥 Downloading image ${i + 1}...`);
            await downloadImage(image.url, originalPath);
            results.downloaded++;
            
            // Optimize image
            console.log(`   🔧 Optimizing image...`);
            await optimizeImage(originalPath, optimizedPath);
            results.optimized++;
            
            // Get file size for logging
            const stats = fs.statSync(optimizedPath);
            console.log(`   📊 Optimized size: ${Math.round(stats.size / 1024)}KB`);
            
            // Upload to Supabase storage
            console.log(`   📤 Uploading to Supabase storage...`);
            const fileBuffer = fs.readFileSync(optimizedPath);
            
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(filename, fileBuffer, {
                contentType: 'image/jpeg',
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
            
            // Clean up temp files
            fs.unlinkSync(originalPath);
            fs.unlinkSync(optimizedPath);
            
            console.log(`   ✅ Uploaded: ${filename}`);
            
          } catch (imageError) {
            console.log(`   ❌ Failed to process image ${i + 1}: ${imageError.message}`);
            results.errors.push({
              product: supabaseProduct.product_name,
              image: i + 1,
              error: imageError.message
            });
            
            // Clean up any remaining temp files
            try {
              const originalPath = path.join(TEMP_DIR, `original_${productSlug}_${i + 1}_${Date.now()}.jpg`);
              const optimizedPath = path.join(TEMP_DIR, `${productSlug}_${i + 1}_${Date.now()}.jpg`);
              if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
              if (fs.existsSync(optimizedPath)) fs.unlinkSync(optimizedPath);
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
        
        // Update product record with new image URLs if we have uploads
        if (uploadedImageUrls.length > 0) {
          console.log(`   📝 Updating product record with ${uploadedImageUrls.length} new URLs...`);
          
          // Note: This will likely fail due to permissions, but we'll try
          const { error: updateError } = await supabase
            .from('products')
            .update({
              images: uploadedImageUrls,
              images_updated_at: new Date().toISOString()
            })
            .eq('id', supabaseProduct.id);
          
          if (updateError) {
            console.log(`   ⚠️ Could not update product record: ${updateError.message}`);
            console.log(`   💡 Images uploaded successfully. URLs: ${uploadedImageUrls.join(', ')}`);
            results.errors.push({
              product: supabaseProduct.product_name,
              error: `Database update failed: ${updateError.message}`,
              urls: uploadedImageUrls
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
    console.log('\n🎉 Migration test completed!');
    console.log(`📊 RESULTS:`);
    console.log(`✅ Products processed: ${results.processed}`);
    console.log(`📥 Images downloaded: ${results.downloaded}`);
    console.log(`🔧 Images optimized: ${results.optimized}`);
    console.log(`📤 Images uploaded: ${results.uploaded}`);
    console.log(`📝 Records updated: ${results.updated}`);
    console.log(`⏭️ Products skipped (testing limit): ${results.skipped}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Error details:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.product}: ${error.error}`);
        if (error.urls) {
          console.log(`   Uploaded URLs: ${error.urls.join(', ')}`);
        }
      });
    }
    
    if (results.uploaded > 0) {
      console.log('\n✅ SUCCESS: Images were uploaded to Supabase storage!');
      console.log('💡 Next steps:');
      console.log('1. Check the uploaded images in Supabase Dashboard');
      console.log('2. If everything looks good, run with MAX_PRODUCTS = 100 to process all products');
      console.log('3. Update the product catalog to use the new Supabase storage URLs');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log('🧹 Cleaned up temp directory');
    } catch (cleanupError) {
      console.log('⚠️ Could not clean up temp directory:', cleanupError.message);
    }
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Optimized Image Migration to Supabase Storage');
  console.log(`🔑 Airtable API Key: ${AIRTABLE_API_KEY ? 'Found' : 'Missing'}`);
  console.log(`📦 Airtable Base ID: ${AIRTABLE_BASE_ID || 'Missing'}`);
  console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`);
  console.log(`📁 Storage Bucket: ${BUCKET_NAME}`);
  console.log(`📊 Max File Size: ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`);
  console.log(`📐 Max Dimensions: ${MAX_DIMENSION}px`);
  console.log(`🎨 JPEG Quality: ${JPEG_QUALITY}%`);
  console.log('');
  
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Missing Airtable credentials in .env file!');
    console.error('Make sure AIRTABLE_TOKEN and BASE_ID are set.');
    process.exit(1);
  }
  
  migrateImagesToSupabaseOptimized().then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { migrateImagesToSupabaseOptimized };