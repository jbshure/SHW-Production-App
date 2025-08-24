const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testBuckets() {
  console.log('🔍 Testing Supabase Storage...\n');
  
  // Try different bucket names
  const bucketNames = ['project-images', 'products', 'product-images', 'images', 'public'];
  
  for (const bucketName of bucketNames) {
    console.log(`Testing bucket: "${bucketName}"`);
    
    try {
      // Try to list files
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 2 });
      
      if (error) {
        console.log(`  ❌ Error: ${error.message}`);
      } else {
        console.log(`  ✅ Success! Found ${data ? data.length : 0} items`);
        if (data && data.length > 0) {
          console.log(`  📁 Sample items:`, data.map(d => d.name).join(', '));
        }
        
        // Test public URL
        const { data: { publicUrl } } = supabase.storage
          .from(bucketName)
          .getPublicUrl('test.jpg');
        console.log(`  🔗 Public URL format: ${publicUrl}`);
      }
    } catch (err) {
      console.log(`  ❌ Exception: ${err.message}`);
    }
    
    console.log('');
  }
  
  // Also try to list all buckets (may not work due to permissions)
  console.log('Attempting to list all buckets:');
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.log('❌ Cannot list buckets (normal if no admin access):', bucketsError.message);
  } else if (buckets && buckets.length > 0) {
    console.log('✅ Available buckets:', buckets.map(b => b.name).join(', '));
  } else {
    console.log('⚠️ No buckets returned (may be a permissions issue)');
  }
}

testBuckets().catch(console.error);