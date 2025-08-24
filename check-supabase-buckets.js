const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkBuckets() {
  console.log('Checking Supabase storage buckets...\n');
  
  // Try to list buckets
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  
  if (bucketsError) {
    console.log('Error listing buckets:', bucketsError);
  } else {
    console.log('Available buckets:', buckets);
  }
  
  // Try to access project-images bucket
  console.log('\nTrying to access project-images bucket:');
  const { data: files, error: filesError } = await supabase.storage
    .from('project-images')
    .list('', { limit: 5 });
  
  if (filesError) {
    console.log('Error:', filesError);
  } else {
    console.log('Success! Found', files.length, 'files');
    if (files.length > 0) {
      console.log('Sample files:', files.map(f => f.name).join(', '));
    }
  }
  
  // Try to get a public URL for a test file
  console.log('\nGenerating public URL for test:');
  const { data: { publicUrl } } = supabase.storage
    .from('project-images')
    .getPublicUrl('test-image.jpg');
  
  console.log('Public URL format:', publicUrl);
}

checkBuckets().catch(console.error);