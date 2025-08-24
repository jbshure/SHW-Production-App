// Refresh Airtable Images Script
// This connects directly to Airtable API to get fresh attachment URLs

const Airtable = require('airtable');
const { createClient } = require('@supabase/supabase-js');

// Configuration from .env file
require('dotenv').config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.BASE_ID;
const POSSIBLE_TABLE_NAMES = ['Products', 'Product', 'products', 'Items', 'Catalog']; // Will try these names

// Use the same Supabase instance as the product catalog
const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

// Initialize clients
const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY });
const base = airtable.base(AIRTABLE_BASE_ID);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function refreshAirtableImages() {
  console.log('🔄 Refreshing Airtable images...');
  
  try {
    // Get all records from Airtable - try different table names
    console.log('📋 Fetching records from Airtable...');
    const airtableRecords = [];
    let foundTable = null;
    
    for (const tableName of POSSIBLE_TABLE_NAMES) {
      try {
        console.log(`🔍 Trying table name: "${tableName}"`);
        await base(tableName).select({
          maxRecords: 1 // Just test if table exists
        }).firstPage();
        
        // If we get here, table exists - fetch all records
        console.log(`✅ Found table: "${tableName}"`);
        foundTable = tableName;
        break;
      } catch (error) {
        console.log(`❌ Table "${tableName}" not found`);
      }
    }
    
    if (!foundTable) {
      throw new Error('No valid table found. Available tables might have different names.');
    }
    
    console.log(`📋 Fetching all records from "${foundTable}"...`);
    await base(foundTable).select({
      // Add any filtering if needed
    }).eachPage((records, fetchNextPage) => {
      airtableRecords.push(...records);
      fetchNextPage();
    });
    
    console.log(`✅ Found ${airtableRecords.length} records in Airtable`);
    
    // Get all products from Supabase
    console.log('📋 Loading products from Supabase...');
    const { data: supabaseProducts, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }
    
    console.log(`✅ Found ${supabaseProducts.length} products in Supabase`);
    
    // Match records and update images
    const results = { updated: 0, notFound: 0, errors: [] };
    
    for (const supabaseProduct of supabaseProducts) {
      try {
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
          console.log(`⚠️ No matching Airtable record found for: ${supabaseProduct.product_name}`);
          results.notFound++;
          continue;
        }
        
        // Extract image URLs from Airtable record
        const freshImages = [];
        
        // Check common image field names
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
          console.log(`📷 No images found in Airtable for: ${supabaseProduct.product_name}`);
          continue;
        }
        
        console.log(`🔄 Updating ${supabaseProduct.product_name} with ${freshImages.length} fresh images...`);
        
        // Update Supabase record (just update the images field)
        const { error: updateError } = await supabase
          .from('products')
          .update({
            images: freshImages
          })
          .eq('id', supabaseProduct.id);
        
        if (updateError) {
          throw new Error(`Update error: ${updateError.message}`);
        }
        
        results.updated++;
        console.log(`✅ Updated ${supabaseProduct.product_name}`);
        
      } catch (error) {
        console.log(`❌ Error updating ${supabaseProduct.product_name}: ${error.message}`);
        results.errors.push({
          productName: supabaseProduct.product_name,
          error: error.message
        });
      }
    }
    
    // Final results
    console.log('\n🎉 Refresh completed!');
    console.log(`✅ Updated: ${results.updated} products`);
    console.log(`⚠️ Not found: ${results.notFound} products`);
    console.log(`❌ Errors: ${results.errors.length} products`);
    
    if (results.errors.length > 0) {
      console.log('\n❌ Error details:');
      results.errors.forEach(error => {
        console.log(`- ${error.productName}: ${error.error}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Refresh failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  console.log('📋 Using Airtable credentials from .env file');
  console.log(`🔑 API Key: ${AIRTABLE_API_KEY ? 'Found' : 'Missing'}`);
  console.log(`📦 Base ID: ${AIRTABLE_BASE_ID || 'Missing'}`);
  console.log(`🗂️ Will try table names: ${POSSIBLE_TABLE_NAMES.join(', ')}`);
  console.log('');
  
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
    console.error('❌ Missing Airtable credentials in .env file!');
    console.error('Make sure AIRTABLE_TOKEN and BASE_ID are set.');
    process.exit(1);
  }
  
  refreshAirtableImages().then(() => {
    console.log('\n🏁 Script finished');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { refreshAirtableImages };