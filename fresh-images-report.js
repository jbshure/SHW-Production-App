// Fresh Images Report - Shows what images are available in Airtable
// This will output the fresh image URLs so you can see what's available

const Airtable = require('airtable');
require('dotenv').config();

const AIRTABLE_API_KEY = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.BASE_ID;
const airtable = new Airtable({ apiKey: AIRTABLE_API_KEY });
const base = airtable.base(AIRTABLE_BASE_ID);

async function generateImageReport() {
  console.log('📊 Generating Fresh Images Report...\n');
  
  try {
    // Get all records from Airtable
    const airtableRecords = [];
    await base('Products').select({}).eachPage((records, fetchNextPage) => {
      airtableRecords.push(...records);
      fetchNextPage();
    });
    
    console.log(`Found ${airtableRecords.length} products in Airtable\n`);
    
    let productsWithImages = 0;
    let totalImages = 0;
    
    for (const record of airtableRecords) {
      const name = record.fields.Name || record.fields.product_name || record.fields['Product Name'] || record.id;
      
      // Extract image URLs
      const freshImages = [];
      const imageFields = ['Images', 'images', 'Image', 'Photos', 'pictures'];
      
      for (const fieldName of imageFields) {
        const fieldValue = record.fields[fieldName];
        if (fieldValue && Array.isArray(fieldValue)) {
          for (const attachment of fieldValue) {
            if (attachment.url) {
              freshImages.push({
                url: attachment.url,
                filename: attachment.filename,
                type: attachment.type,
                size: attachment.size
              });
            }
          }
        }
      }
      
      if (freshImages.length > 0) {
        productsWithImages++;
        totalImages += freshImages.length;
        
        console.log(`\n📦 ${name}`);
        console.log(`   Images: ${freshImages.length}`);
        
        freshImages.forEach((img, index) => {
          console.log(`   ${index + 1}. ${img.filename || 'unnamed'} (${img.type || 'unknown type'})`);
          console.log(`      URL: ${img.url}`);
          console.log(`      Size: ${img.size ? Math.round(img.size / 1024) + 'KB' : 'unknown'}`);
        });
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`✅ Products with images: ${productsWithImages}`);
    console.log(`📸 Total images found: ${totalImages}`);
    console.log(`💡 These are all fresh Airtable URLs that should work!`);
    
    console.log(`\n🎯 NEXT STEPS:`);
    console.log(`1. These images are ready to download`);
    console.log(`2. Run the image migration tool with proper permissions`);
    console.log(`3. Or manually update products with these fresh URLs`);
    
  } catch (error) {
    console.error('❌ Report failed:', error.message);
  }
}

generateImageReport().then(() => {
  console.log('\n🏁 Report finished');
}).catch(error => {
  console.error('💥 Report failed:', error.message);
});