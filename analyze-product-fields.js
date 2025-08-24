const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://elvbmvbbsymrcktvfbbk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdmJtdmJic3ltcmNrdHZmYmJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMjQ5NDksImV4cCI6MjA3MDgwMDk0OX0.hl2wdP8yvrlvyahqBG9q9f-mVlk4CEg1a7jn1ve-bXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function analyzeProductFields() {
  console.log('🔍 Analyzing Product Fields in Database...\n');
  
  try {
    // Get all products with all fields
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .limit(10); // Get sample of products
    
    if (error) throw error;
    
    if (!products || products.length === 0) {
      console.log('No products found!');
      return;
    }
    
    console.log(`Found ${products.length} sample products\n`);
    
    // Collect all unique fields and analyze their usage
    const fieldAnalysis = {};
    const allFields = new Set();
    
    products.forEach(product => {
      Object.keys(product).forEach(field => {
        allFields.add(field);
        
        if (!fieldAnalysis[field]) {
          fieldAnalysis[field] = {
            hasData: 0,
            isEmpty: 0,
            sampleValues: [],
            dataType: null
          };
        }
        
        const value = product[field];
        
        if (value !== null && value !== undefined && value !== '' && 
            (typeof value !== 'object' || (Array.isArray(value) && value.length > 0) || Object.keys(value).length > 0)) {
          fieldAnalysis[field].hasData++;
          
          // Store sample values
          if (fieldAnalysis[field].sampleValues.length < 3) {
            if (typeof value === 'object') {
              fieldAnalysis[field].sampleValues.push(JSON.stringify(value).substring(0, 100));
              fieldAnalysis[field].dataType = Array.isArray(value) ? 'array' : 'object';
            } else {
              fieldAnalysis[field].sampleValues.push(String(value).substring(0, 100));
              fieldAnalysis[field].dataType = typeof value;
            }
          }
        } else {
          fieldAnalysis[field].isEmpty++;
        }
      });
    });
    
    // Fields currently displayed on cards (from code review)
    const displayedFields = [
      'name', 'product_name',
      'cp_sku', 'airtable_id',
      'price', 'base_price',
      'category', 'category_id',
      'supplier', 'supplier_id',
      'minimum_order_quantity', 'min_order_quantity',
      'stock_quantity', 'track_inventory',
      'unit_of_measure', 'status',
      'images', 'image_url',
      'total_variants', 'total_option_types', 'total_option_values'
    ];
    
    // Categorize fields
    const categories = {
      displayed: [],
      notDisplayed: [],
      alwaysEmpty: [],
      partiallyFilled: [],
      fullyFilled: []
    };
    
    // Sort fields alphabetically
    const sortedFields = Array.from(allFields).sort();
    
    console.log('=== ALL PRODUCT FIELDS ===\n');
    
    sortedFields.forEach(field => {
      const analysis = fieldAnalysis[field];
      const fillRate = (analysis.hasData / products.length * 100).toFixed(0);
      const isDisplayed = displayedFields.some(df => df.toLowerCase() === field.toLowerCase());
      
      // Categorize
      if (isDisplayed) {
        categories.displayed.push(field);
      } else {
        categories.notDisplayed.push(field);
      }
      
      if (analysis.hasData === 0) {
        categories.alwaysEmpty.push(field);
      } else if (analysis.hasData === products.length) {
        categories.fullyFilled.push(field);
      } else {
        categories.partiallyFilled.push(field);
      }
      
      // Print field info
      const status = isDisplayed ? '✅ DISPLAYED' : '❌ NOT DISPLAYED';
      const samples = analysis.sampleValues.length > 0 
        ? `\n     Sample: ${analysis.sampleValues[0]}`
        : '';
      
      console.log(`${field} (${analysis.dataType || 'unknown'})`);
      console.log(`  ${status} | ${fillRate}% filled (${analysis.hasData}/${products.length})${samples}`);
      console.log('');
    });
    
    // Summary Report
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY REPORT\n');
    
    console.log(`Total Fields: ${allFields.size}`);
    console.log(`Currently Displayed: ${categories.displayed.length}`);
    console.log(`Not Displayed: ${categories.notDisplayed.length}\n`);
    
    console.log('🔴 IMPORTANT FIELDS NOT DISPLAYED:');
    const importantNotDisplayed = categories.notDisplayed.filter(field => 
      categories.fullyFilled.includes(field) || 
      (categories.partiallyFilled.includes(field) && fieldAnalysis[field].hasData > products.length / 2)
    );
    
    if (importantNotDisplayed.length > 0) {
      importantNotDisplayed.forEach(field => {
        const analysis = fieldAnalysis[field];
        const fillRate = (analysis.hasData / products.length * 100).toFixed(0);
        console.log(`  • ${field} (${fillRate}% filled)`);
        if (analysis.sampleValues.length > 0) {
          console.log(`    Sample: ${analysis.sampleValues[0]}`);
        }
      });
    } else {
      console.log('  None - all important fields are displayed');
    }
    
    console.log('\n🟡 FIELDS WITH PARTIAL DATA NOT DISPLAYED:');
    const partialNotDisplayed = categories.notDisplayed.filter(field => 
      categories.partiallyFilled.includes(field) && 
      fieldAnalysis[field].hasData > 0 &&
      fieldAnalysis[field].hasData <= products.length / 2
    );
    
    if (partialNotDisplayed.length > 0) {
      partialNotDisplayed.forEach(field => {
        const analysis = fieldAnalysis[field];
        const fillRate = (analysis.hasData / products.length * 100).toFixed(0);
        console.log(`  • ${field} (${fillRate}% filled)`);
      });
    } else {
      console.log('  None');
    }
    
    console.log('\n⚪ EMPTY FIELDS (can be ignored):');
    if (categories.alwaysEmpty.length > 0) {
      console.log(`  ${categories.alwaysEmpty.join(', ')}`);
    } else {
      console.log('  None - all fields have some data');
    }
    
    // Recommendations
    console.log('\n' + '='.repeat(50));
    console.log('💡 RECOMMENDATIONS:\n');
    
    if (importantNotDisplayed.length > 0) {
      console.log('Consider adding these fields to product cards:');
      importantNotDisplayed.slice(0, 5).forEach(field => {
        console.log(`  • ${field}`);
      });
    }
    
    // Check for specific useful fields
    const usefulFields = [
      'lead_time', 'production_time', 'description', 'short_description',
      'notes', 'internal_notes', 'tags', 'weight', 'dimensions',
      'color', 'material', 'finish', 'is_featured', 'is_active'
    ];
    
    const foundUsefulFields = usefulFields.filter(field => 
      allFields.has(field) && fieldAnalysis[field].hasData > 0
    );
    
    if (foundUsefulFields.length > 0) {
      console.log('\nUseful fields found in your data:');
      foundUsefulFields.forEach(field => {
        const analysis = fieldAnalysis[field];
        console.log(`  • ${field}: ${analysis.sampleValues[0] || '(data exists)'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the analysis
analyzeProductFields().then(() => {
  console.log('\n✅ Analysis complete!');
  process.exit(0);
}).catch(error => {
  console.error('💥 Failed:', error);
  process.exit(1);
});