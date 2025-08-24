const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkFiles() {
  console.log('🔍 Checking for uploaded files in project-images bucket...\n');
  
  // Check root level
  console.log('Checking root level:');
  const { data: rootFiles, error: rootError } = await supabase.storage
    .from('project-images')
    .list('', { limit: 10 });
  
  if (rootError) {
    console.log('❌ Error:', rootError);
  } else {
    console.log(`Found ${rootFiles ? rootFiles.length : 0} items at root`);
    if (rootFiles && rootFiles.length > 0) {
      rootFiles.forEach(f => {
        console.log(`  - ${f.name} (${f.metadata ? 'folder' : 'file'})`);
      });
    }
  }
  
  // Check products folder
  console.log('\nChecking products/ folder:');
  const { data: productFiles, error: productError } = await supabase.storage
    .from('project-images')
    .list('products', { limit: 10 });
  
  if (productError) {
    console.log('❌ Error:', productError);
  } else {
    console.log(`Found ${productFiles ? productFiles.length : 0} items in products/`);
    if (productFiles && productFiles.length > 0) {
      productFiles.forEach(f => {
        console.log(`  - ${f.name}`);
      });
    }
  }
  
  // Try to access a specific file we uploaded
  console.log('\nTesting specific file URL:');
  const testFile = '2_ply_coined_edge_1_1755997624980.jpg';
  
  // Try different paths
  const paths = [
    testFile,
    `products/${testFile}`,
    `product-images/${testFile}`,
    `public/products/${testFile}`
  ];
  
  for (const path of paths) {
    const { data: { publicUrl } } = supabase.storage
      .from('project-images')
      .getPublicUrl(path);
    
    console.log(`\nPath: ${path}`);
    console.log(`URL: ${publicUrl}`);
    
    // Test if URL works
    try {
      const response = await fetch(publicUrl, { method: 'HEAD' });
      if (response.ok) {
        console.log(`✅ URL works! Status: ${response.status}`);
      } else {
        console.log(`❌ URL fails. Status: ${response.status}`);
      }
    } catch (err) {
      console.log(`❌ Fetch error: ${err.message}`);
    }
  }
}

checkFiles().catch(console.error);