// Test Supabase Storage Bucket Access
// This script verifies that the storage bucket is created and accessible

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET_NAME = 'product-images';

async function testBucketAccess() {
  console.log('🔍 Testing Supabase Storage Bucket Access...');
  console.log(`📦 Bucket name: ${BUCKET_NAME}`);
  console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`);
  console.log('');
  
  try {
    // Test 1: List buckets
    console.log('1️⃣ Testing bucket list access...');
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
    
    if (bucketListError) {
      console.log('⚠️ Could not list buckets:', bucketListError.message);
      console.log('💡 This is normal - anonymous users may not have bucket list permissions');
    } else {
      console.log(`✅ Found ${buckets.length} buckets:`);
      buckets.forEach(bucket => {
        console.log(`   - ${bucket.name} (${bucket.public ? 'Public' : 'Private'})`);
      });
      
      const targetBucket = buckets.find(bucket => bucket.name === BUCKET_NAME);
      if (targetBucket) {
        console.log(`✅ Target bucket "${BUCKET_NAME}" found and is ${targetBucket.public ? 'Public' : 'Private'}`);
      } else {
        console.log(`❌ Target bucket "${BUCKET_NAME}" not found in bucket list`);
      }
    }
    
    console.log('');
    
    // Test 2: List files in bucket (this is the key test)
    console.log('2️⃣ Testing bucket file list access...');
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', { limit: 10 });
    
    if (listError) {
      console.log('❌ Cannot access bucket for file listing:', listError.message);
      
      if (listError.message.includes('not found')) {
        console.log('💡 SOLUTION: Create the bucket in Supabase Dashboard');
        console.log('   1. Go to https://supabase.com/dashboard');
        console.log('   2. Navigate to Storage section');
        console.log(`   3. Create bucket named "${BUCKET_NAME}"`);
        console.log('   4. Make sure it\'s set as PUBLIC');
      } else {
        console.log('💡 SOLUTION: Check bucket permissions in Supabase Dashboard');
      }
      
      return false;
    }
    
    console.log(`✅ Bucket access successful! Found ${files.length} files`);
    if (files.length > 0) {
      console.log('📁 Existing files:');
      files.forEach(file => {
        console.log(`   - ${file.name} (${file.metadata?.size || 'unknown'} bytes)`);
      });
    } else {
      console.log('📂 Bucket is empty (ready for uploads)');
    }
    
    console.log('');
    
    // Test 3: Test upload permissions with a small test image
    console.log('3️⃣ Testing upload permissions with test image...');
    // Create a minimal 1x1 pixel JPEG in base64
    const testImageBuffer = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/3oAUU=', 'base64');
    const testFileName = `test_${Date.now()}.jpg`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(testFileName, testImageBuffer, {
        contentType: 'image/jpeg'
      });
    
    if (uploadError) {
      console.log('❌ Upload test failed:', uploadError.message);
      
      if (uploadError.message.includes('row-level security')) {
        console.log('💡 SOLUTION: Update bucket RLS policies to allow uploads');
        console.log('   This can be done in Supabase Dashboard > Storage > Policies');
      } else if (uploadError.message.includes('size')) {
        console.log('💡 SOLUTION: File size limits - increase in bucket settings');
      }
      
      return false;
    }
    
    console.log(`✅ Upload test successful! File: ${testFileName}`);
    
    // Test 4: Test public URL access
    console.log('4️⃣ Testing public URL generation...');
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(testFileName);
    
    console.log(`✅ Public URL generated: ${urlData.publicUrl}`);
    
    // Clean up test file
    console.log('5️⃣ Cleaning up test file...');
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([testFileName]);
    
    if (deleteError) {
      console.log('⚠️ Could not delete test file:', deleteError.message);
      console.log(`💡 You may want to manually delete: ${testFileName}`);
    } else {
      console.log('✅ Test file cleaned up successfully');
    }
    
    console.log('');
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✅ The storage bucket is ready for image migration!');
    console.log('💡 You can now run: node migrate-images-optimized.js');
    
    return true;
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testBucketAccess().then(success => {
    if (success) {
      console.log('\n🏁 Test completed successfully');
      process.exit(0);
    } else {
      console.log('\n💥 Test failed - check the instructions above');
      process.exit(1);
    }
  }).catch(error => {
    console.error('💥 Test failed with error:', error.message);
    process.exit(1);
  });
}

module.exports = { testBucketAccess };