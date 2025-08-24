// Download Images Locally and Update Database
// Downloads fresh Airtable images to local public/images directory
// Updates product records with local URLs that work with existing web server

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

// Local storage settings
const LOCAL_IMAGES_DIR = path.join(__dirname, 'public', 'images', 'products');
const MAX_DIMENSION = 1200; // Reasonable size for web display
const JPEG_QUALITY = 85;

// Ensure images directory exists
if (!fs.existsSync(LOCAL_IMAGES_DIR)) {
  fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
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

// Helper function to optimize image for web
async function optimizeImage(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    let pipeline = image;
    
    // Resize if too large (keep aspect ratio)
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Convert to JPEG and optimize
    pipeline = pipeline.jpeg({ 
      quality: JPEG_QUALITY, 
      progressive: true,
      mozjpeg: true // Use mozjpeg encoder for better compression
    });
    
    await pipeline.toFile(outputPath);
    return outputPath;
  } catch (error) {
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}

// Helper function to sanitize filename
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
}

async function downloadImagesLocally() {
  console.log('🚀 Starting local image download...');
  console.log(`📁 Local images directory: ${LOCAL_IMAGES_DIR}`);
  console.log(`📐 Max dimensions: ${MAX_DIMENSION}px`);
  console.log(`🎨 JPEG quality: ${JPEG_QUALITY}%`);
  console.log('');
  
  try {
    // Get all Airtable records with images
    console.log('📋 Fetching records from Airtable...');
    const airtableRecords = [];
    await base('Products').select({}).eachPage((records, fetchNextPage) => {
      airtableRecords.push(...records);
      fetchNextPage();
    });
    
    console.log(`✅ Found ${airtableRecords.length} records in Airtable`);
    
    // Get all Supabase products  
    console.log('📋 Loading products from Supabase...');
    const { data: supabaseProducts, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }
    
    console.log(`✅ Found ${supabaseProducts.length} products in Supabase`);
    
    const results = {
      processed: 0,
      downloaded: 0,
      optimized: 0,
      updated: 0,
      errors: [],
      localUrls: {}
    };
    
    // Process all products
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
        
        const localImageUrls = [];
        
        // Process each image
        for (let i = 0; i < freshImages.length; i++) {
          const image = freshImages[i];
          
          try {
            // Create unique filename
            const productSlug = sanitizeFilename(supabaseProduct.product_name);
            const timestamp = Date.now();
            const filename = `${productSlug}_${i + 1}_${timestamp}.jpg`;
            const tempPath = path.join(LOCAL_IMAGES_DIR, `temp_${filename}`);
            const finalPath = path.join(LOCAL_IMAGES_DIR, filename);
            
            // Download image
            console.log(`   📥 Downloading image ${i + 1}...`);
            await downloadImage(image.url, tempPath);
            results.downloaded++;
            
            // Optimize image
            console.log(`   🔧 Optimizing image...`);
            await optimizeImage(tempPath, finalPath);
            results.optimized++;
            
            // Get file size for logging
            const stats = fs.statSync(finalPath);
            console.log(`   📊 Final size: ${Math.round(stats.size / 1024)}KB`);
            
            // Clean up temp file
            fs.unlinkSync(tempPath);
            
            // Create local URL (relative to web server root)
            const localUrl = `/images/products/${filename}`;
            localImageUrls.push(localUrl);
            
            console.log(`   ✅ Saved: ${filename}`);
            
          } catch (imageError) {
            console.log(`   ❌ Failed to process image ${i + 1}: ${imageError.message}`);
            results.errors.push({
              product: supabaseProduct.product_name,
              image: i + 1,
              error: imageError.message
            });
          }
        }
        
        // Store the URLs for potential database update
        if (localImageUrls.length > 0) {
          results.localUrls[supabaseProduct.product_name] = localImageUrls;
          console.log(`   📝 Ready for database update with ${localImageUrls.length} local URLs`);
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
    console.log('\n🎉 Local download completed!');
    console.log(`📊 RESULTS:`);
    console.log(`✅ Products processed: ${results.processed}`);
    console.log(`📥 Images downloaded: ${results.downloaded}`);
    console.log(`🔧 Images optimized: ${results.optimized}`);
    console.log(`📁 Images saved locally: ${results.optimized}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Error details:');
      results.errors.slice(0, 10).forEach((error, index) => {
        console.log(`${index + 1}. ${error.product}: ${error.error}`);
      });
      if (results.errors.length > 10) {
        console.log(`   ... and ${results.errors.length - 10} more errors`);
      }
    }
    
    if (results.optimized > 0) {
      console.log('\n✅ SUCCESS: Images downloaded and optimized locally!');
      console.log(`📁 Images location: ${LOCAL_IMAGES_DIR}`);
      console.log('💡 Next steps:');
      console.log('1. Test that images are accessible via your web server');
      console.log('2. Run the database update script to replace Airtable URLs');
      console.log('3. Check the product catalog to verify images load correctly');
      
      // Save the URL mapping for the database update script
      const urlMappingPath = path.join(__dirname, 'local-image-urls.json');
      fs.writeFileSync(urlMappingPath, JSON.stringify(results.localUrls, null, 2));
      console.log(`📄 URL mapping saved to: ${urlMappingPath}`);
    }
    
  } catch (error) {
    console.error('❌ Download failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Local Image Download from Airtable');
  console.log(`🔑 Airtable API Key: ${AIRTABLE_API_KEY ? 'Found' : 'Missing'}`);
  console.log(`📦 Airtable Base ID: ${AIRTABLE_BASE_ID || 'Missing'}`);
  console.log('');
  
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Missing Airtable credentials in .env file!');
    console.error('Make sure AIRTABLE_TOKEN and BASE_ID are set.');
    process.exit(1);
  }
  
  downloadImagesLocally().then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { downloadImagesLocally };