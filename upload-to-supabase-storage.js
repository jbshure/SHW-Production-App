// Upload local images to Supabase Storage
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Images directory
const IMAGES_DIR = path.join(__dirname, 'public', 'images', 'products');
const BUCKET_NAME = 'product-images'; // Correct bucket name

async function uploadImagesToSupabase() {
  console.log('🚀 Starting Supabase Storage upload...');
  console.log(`📁 Source directory: ${IMAGES_DIR}`);
  
  try {
    // Skip bucket check - use the existing bucket
    console.log(`📦 Using bucket: ${BUCKET_NAME}`);
    
    // Test bucket access by listing files
    const { data: testList, error: testError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 1 });
    
    if (testError) {
      console.error('❌ Cannot access bucket:', testError);
      console.log('\n💡 Please ensure:');
      console.log(`   1. Bucket "${BUCKET_NAME}" exists in Supabase`);
      console.log('   2. The bucket is set to PUBLIC');
      console.log('   3. RLS policies allow uploads');
      return;
    }
    
    console.log('✅ Bucket is accessible');
    
    // Get all image files
    const files = fs.readdirSync(IMAGES_DIR).filter(file => 
      file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png')
    );
    
    console.log(`📸 Found ${files.length} images to upload`);
    
    const results = {
      uploaded: [],
      failed: [],
      skipped: []
    };
    
    // Upload each image
    for (const filename of files) {
      const filePath = path.join(IMAGES_DIR, filename);
      const fileBuffer = fs.readFileSync(filePath);
      const fileSizeKB = (fileBuffer.length / 1024).toFixed(2);
      
      console.log(`\n📤 Uploading ${filename} (${fileSizeKB} KB)...`);
      
      // Check if file already exists
      const { data: existingFile } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', { search: filename });
      
      if (existingFile && existingFile.length > 0) {
        console.log(`⏭️ Skipping ${filename} - already exists`);
        results.skipped.push(filename);
        continue;
      }
      
      // Upload the file - use a path to avoid conflicts
      const storagePath = `products/${filename}`;
      // Fix MIME type: .jpg should be image/jpeg not image/jpg
      const ext = path.extname(filename).slice(1).toLowerCase();
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: mimeType,
          upsert: true,
          cacheControl: '3600'
        });
      
      if (error && error.message !== 'Bucket not found') {
        console.error(`❌ Failed to upload ${filename}:`, error.message);
        results.failed.push({ file: filename, error: error.message });
      } else {
        // Get the public URL
        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(storagePath);
        
        console.log(`✅ Uploaded: ${publicUrl}`);
        results.uploaded.push({
          filename,
          url: publicUrl
        });
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 UPLOAD SUMMARY:');
    console.log(`✅ Successfully uploaded: ${results.uploaded.length}`);
    console.log(`⏭️ Skipped (already exist): ${results.skipped.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    
    if (results.uploaded.length > 0) {
      // Create a mapping file with Supabase URLs
      const mapping = {};
      const localMapping = JSON.parse(fs.readFileSync('local-image-urls.json', 'utf8'));
      
      for (const [productName, localUrls] of Object.entries(localMapping)) {
        const supabaseUrls = [];
        for (const localUrl of localUrls) {
          const filename = path.basename(localUrl);
          const uploaded = results.uploaded.find(u => u.filename === filename);
          if (uploaded) {
            supabaseUrls.push(uploaded.url);
          }
        }
        if (supabaseUrls.length > 0) {
          mapping[productName] = supabaseUrls;
        }
      }
      
      // Save Supabase URLs mapping
      fs.writeFileSync('supabase-image-urls.json', JSON.stringify(mapping, null, 2));
      console.log('\n✅ Created supabase-image-urls.json with public URLs');
      
      // Create a JavaScript file for the frontend
      const jsContent = `// Supabase Storage Image URLs
// Auto-generated from upload-to-supabase-storage.js
window.SUPABASE_IMAGE_MAPPING = ${JSON.stringify(mapping, null, 2)};

console.log('✅ Supabase image mapping loaded with', Object.keys(window.SUPABASE_IMAGE_MAPPING).length, 'products');
`;
      
      fs.writeFileSync('public/supabase-image-override.js', jsContent);
      console.log('✅ Created public/supabase-image-override.js for frontend use');
      
      console.log('\n🎉 SUCCESS! Next steps:');
      console.log('1. Replace <script src="local-image-override.js"> with');
      console.log('   <script src="supabase-image-override.js"> in product-catalog.html');
      console.log('2. Deploy to Firebase: firebase deploy --only hosting');
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed uploads:');
      results.failed.forEach(f => {
        console.log(`  - ${f.file}: ${f.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

// Run the upload
if (require.main === module) {
  uploadImagesToSupabase().then(() => {
    console.log('\n🏁 Upload process complete');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Upload failed:', error);
    process.exit(1);
  });
}

module.exports = { uploadImagesToSupabase };