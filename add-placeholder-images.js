// Add Placeholder Images Script
// This adds nice placeholder images for products that don't have working images

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Placeholder image URL (you can use any public image service)
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400x300/E3FF33/000000?text=Product+Image';

async function addPlaceholderImages() {
  console.log('🖼️ Adding placeholder images...');
  
  try {
    // Get all products
    const { data: products, error } = await supabase
      .from('products')
      .select('*');
    
    if (error) throw error;
    
    console.log(`📋 Found ${products.length} products`);
    
    // Update products that have expired Airtable images
    let updated = 0;
    
    for (const product of products) {
      // Check if product has expired Airtable images
      const hasExpiredImages = (
        (product.images && JSON.stringify(product.images).includes('airtable')) ||
        (product.images_from_supplier && JSON.stringify(product.images_from_supplier).includes('airtable'))
      );
      
      if (hasExpiredImages) {
        console.log(`🔄 Adding placeholder for: ${product.product_name}`);
        
        const { error: updateError } = await supabase
          .from('products')
          .update({
            image_url: PLACEHOLDER_IMAGE,
            placeholder_added_at: new Date().toISOString()
          })
          .eq('id', product.id);
        
        if (updateError) {
          console.log(`❌ Error updating ${product.product_name}: ${updateError.message}`);
        } else {
          updated++;
        }
      }
    }
    
    console.log(`\n✅ Added placeholders to ${updated} products`);
    console.log('🎨 Your products now have nice placeholder images!');
    
  } catch (error) {
    console.error('💥 Failed to add placeholders:', error.message);
  }
}

// Run the script
addPlaceholderImages().then(() => {
  console.log('\n🏁 Placeholder script finished');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error.message);
  process.exit(1);
});