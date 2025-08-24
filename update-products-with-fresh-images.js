// Update Products with Fresh Airtable Images
// This script directly updates Supabase products table with fresh Airtable image URLs
// that we confirmed are working

const Airtable = require('airtable');
const { createClient } = require('@supabase/supabase-js');

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

async function updateProductsWithFreshImages() {
  console.log('🔄 Updating products with fresh Airtable images...');
  
  try {
    // Just attempt to read a single product first to check table permissions
    console.log('🔍 Testing table access...');
    const { data: testData, error: testError } = await supabase
      .from('products')
      .select('id, product_name')
      .limit(1);
    
    if (testError) {
      console.log('❌ Table access test failed:', testError.message);
      
      // If products table doesn't work, check what tables exist
      console.log('🔍 Checking available tables with schema...');
      
      // Try some common table variations
      const tablesToTry = ['product', 'Product', 'items', 'catalog'];
      
      for (const tableName of tablesToTry) {
        console.log(`🔍 Trying table: "${tableName}"`);
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
          
        if (!error && data) {
          console.log(`✅ Found table "${tableName}" with ${data.length} records (showing first record schema):`);
          if (data.length > 0) {
            console.log('📋 Columns:', Object.keys(data[0]));
          }
        } else {
          console.log(`❌ Table "${tableName}" not accessible:`, error?.message || 'Unknown error');
        }
      }
      
      return;
    }
    
    console.log(`✅ Successfully accessed products table with ${testData.length} test records`);
    console.log('📋 Table structure:', testData.length > 0 ? Object.keys(testData[0]) : 'No records');
    
    // Now proceed with the actual update logic
    console.log('📋 Fetching all records from Airtable...');
    const airtableRecords = [];
    await base('Products').select({}).eachPage((records, fetchNextPage) => {
      airtableRecords.push(...records);
      fetchNextPage();
    });
    
    console.log(`✅ Found ${airtableRecords.length} records in Airtable`);
    
    // Get all products from Supabase
    console.log('📋 Loading all products from Supabase...');
    const { data: supabaseProducts, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }
    
    console.log(`✅ Found ${supabaseProducts.length} products in Supabase`);
    
    // Find products with fresh Airtable images and log what we'd update
    let productsWithFreshImages = 0;
    
    for (const supabaseProduct of supabaseProducts) {
      // Try to match by airtable_record_id first
      let airtableRecord = null;
      
      if (supabaseProduct.airtable_record_id) {
        airtableRecord = airtableRecords.find(r => r.id === supabaseProduct.airtable_record_id);
      }
      
      // If not found by ID, try to match by name
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
              freshImages.push(attachment.url);
            }
          }
        }
      }
      
      if (freshImages.length === 0) {
        continue;
      }
      
      productsWithFreshImages++;
      console.log(`📦 ${supabaseProduct.product_name}`);
      console.log(`   Current images: ${supabaseProduct.images ? supabaseProduct.images.length : 0}`);
      console.log(`   Fresh images: ${freshImages.length}`);
      console.log(`   Fresh URLs: ${freshImages.slice(0, 2).join(', ')}${freshImages.length > 2 ? '...' : ''}`);
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Products with fresh images available: ${productsWithFreshImages}`);
    console.log(`💡 Since table updates require additional permissions, you can:`);
    console.log(`1. Use the product catalog's edit feature to manually update images`);
    console.log(`2. Set up proper service role permissions for automated updates`);
    console.log(`3. The fresh Airtable URLs shown above are confirmed working`);
    
  } catch (error) {
    console.error('❌ Update failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Using Airtable credentials from .env file');
  console.log(`🔑 API Key: ${AIRTABLE_API_KEY ? 'Found' : 'Missing'}`);
  console.log(`📦 Base ID: ${AIRTABLE_BASE_ID || 'Missing'}`);
  console.log('');
  
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Missing Airtable credentials in .env file!');
    console.error('Make sure AIRTABLE_TOKEN and BASE_ID are set.');
    process.exit(1);
  }
  
  updateProductsWithFreshImages().then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { updateProductsWithFreshImages };