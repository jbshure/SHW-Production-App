// Update Database with Local Image URLs
// This script updates product records to use local image URLs instead of Airtable URLs

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Use the same Supabase instance as the product catalog
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

// Initialize client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Load the local image URLs mapping
const LOCAL_URLS_FILE = path.join(__dirname, 'local-image-urls.json');

async function updateDatabaseWithLocalUrls(dryRun = true) {
  console.log('🔄 Updating database with local image URLs...');
  console.log(`🔍 Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE UPDATE'}`);
  console.log('');
  
  try {
    // Load the local URLs mapping
    if (!fs.existsSync(LOCAL_URLS_FILE)) {
      throw new Error(`Local URLs mapping file not found: ${LOCAL_URLS_FILE}`);
    }
    
    const localUrlsMapping = JSON.parse(fs.readFileSync(LOCAL_URLS_FILE, 'utf8'));
    const productNames = Object.keys(localUrlsMapping);
    
    console.log(`📄 Loaded mapping for ${productNames.length} products`);
    
    // Get all Supabase products
    console.log('📋 Loading products from Supabase...');
    const { data: supabaseProducts, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }
    
    console.log(`✅ Found ${supabaseProducts.length} products in Supabase`);
    console.log('');
    
    const results = {
      toUpdate: 0,
      updated: 0,
      errors: [],
      previews: []
    };
    
    // Process each product in the mapping
    for (const productName of productNames) {
      const localUrls = localUrlsMapping[productName];
      
      // Find matching Supabase product
      const supabaseProduct = supabaseProducts.find(p => p.product_name === productName);
      
      if (!supabaseProduct) {
        console.log(`⚠️ Product not found in Supabase: ${productName}`);
        results.errors.push({
          product: productName,
          error: 'Product not found in Supabase'
        });
        continue;
      }
      
      results.toUpdate++;
      
      if (dryRun) {
        // Preview mode - show what would be changed
        console.log(`📦 ${productName}:`);
        console.log(`   Current images: ${supabaseProduct.images ? supabaseProduct.images.length : 0}`);
        if (supabaseProduct.images && supabaseProduct.images.length > 0) {
          console.log(`   Current URLs (first 2):`);
          supabaseProduct.images.slice(0, 2).forEach((url, i) => {
            const urlStr = typeof url === 'string' ? url : String(url);
            const isAirtable = urlStr.includes('airtable');
            console.log(`     ${i + 1}. ${urlStr.substring(0, 80)}${urlStr.length > 80 ? '...' : ''} ${isAirtable ? '(Airtable)' : '(Other)'}`);
          });
        }
        console.log(`   New local images: ${localUrls.length}`);
        console.log(`   New URLs:`);
        localUrls.forEach((url, i) => {
          console.log(`     ${i + 1}. ${url}`);
        });
        
        results.previews.push({
          product: productName,
          currentCount: supabaseProduct.images ? supabaseProduct.images.length : 0,
          newCount: localUrls.length,
          newUrls: localUrls
        });
        
        console.log('');
        
      } else {
        // Live update mode
        console.log(`🔄 Updating ${productName}...`);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({
            images: localUrls
          })
          .eq('id', supabaseProduct.id);
        
        if (updateError) {
          console.log(`   ❌ Update failed: ${updateError.message}`);
          results.errors.push({
            product: productName,
            error: updateError.message
          });
        } else {
          results.updated++;
          console.log(`   ✅ Updated with ${localUrls.length} local URLs`);
        }
      }
    }
    
    // Final results
    console.log('\n🎉 Database update process completed!');
    console.log(`📊 RESULTS:`);
    console.log(`📦 Products to update: ${results.toUpdate}`);
    
    if (dryRun) {
      console.log(`👁️ Previewed: ${results.previews.length}`);
      console.log(`⚠️ Errors: ${results.errors.length}`);
      
      if (results.toUpdate > 0) {
        console.log('\n💡 SUMMARY OF CHANGES:');
        let totalCurrentImages = 0;
        let totalNewImages = 0;
        
        results.previews.forEach(p => {
          totalCurrentImages += p.currentCount;
          totalNewImages += p.newCount;
        });
        
        console.log(`📊 Current images in database: ${totalCurrentImages}`);
        console.log(`📊 New local images ready: ${totalNewImages}`);
        console.log(`🔄 Net change: ${totalNewImages - totalCurrentImages > 0 ? '+' : ''}${totalNewImages - totalCurrentImages} images`);
        
        console.log('\n🚀 To apply these changes, run:');
        console.log('   node update-database-with-local-urls.js --live');
      }
      
    } else {
      console.log(`✅ Successfully updated: ${results.updated}`);
      console.log(`❌ Errors: ${results.errors.length}`);
      
      if (results.updated > 0) {
        console.log('\n✅ SUCCESS: Database updated with local image URLs!');
        console.log('💡 Next steps:');
        console.log('1. Test the product catalog to verify images load correctly');
        console.log('2. Monitor for any broken image links');
        console.log('3. Consider removing the Airtable dependency once confirmed working');
      }
    }
    
    if (results.errors.length > 0) {
      console.log('\n❌ Error details:');
      results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.product}: ${error.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Database update failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Database Update with Local Image URLs');
  console.log(`🗄️ Supabase URL: ${SUPABASE_URL}`);
  console.log('');
  
  // Check for --live flag
  const isLiveMode = process.argv.includes('--live');
  
  updateDatabaseWithLocalUrls(!isLiveMode).then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { updateDatabaseWithLocalUrls };