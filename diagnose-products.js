// Quick diagnostic script to check product loading
// Run this in the browser console on the product catalog page

console.log('=== PRODUCT CATALOG DIAGNOSTICS ===');

// Check if supabase is initialized
console.log('1. Supabase client:', !!window.supabase);
console.log('2. SUPABASE_CONFIG:', window.SUPABASE_CONFIG);

// Check current products
console.log('3. Current products array:', products?.length || 'undefined');
console.log('4. Sample product:', products?.[0]);

// Check if robust loader is available
console.log('5. Robust loader available:', !!window.loadProductsWithFullRelationships);

// Test direct Supabase query
async function testDirectQuery() {
    if (!supabase) {
        console.log('6. Cannot test - supabase not initialized');
        return;
    }
    
    try {
        console.log('6. Testing direct product query...');
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .limit(3);
            
        if (error) {
            console.log('6. Products query error:', error);
        } else {
            console.log('6. Direct products query success:', data?.length, 'products');
            console.log('   Sample:', data?.[0]);
        }
        
        // Test suppliers table
        console.log('7. Testing suppliers table...');
        const { data: suppliersData, error: suppliersError } = await supabase
            .from('suppliers')
            .select('*')
            .limit(3);
            
        if (suppliersError) {
            console.log('7. Suppliers query error:', suppliersError);
        } else {
            console.log('7. Suppliers query success:', suppliersData?.length, 'suppliers');
        }
        
        // Test legacy supplier table
        console.log('8. Testing legacy supplier table...');
        const { data: legacySupplier, error: legacyError } = await supabase
            .from('supplier')
            .select('*')
            .limit(3);
            
        if (legacyError) {
            console.log('8. Legacy supplier query error:', legacyError);
        } else {
            console.log('8. Legacy supplier query success:', legacySupplier?.length, 'suppliers');
        }
        
    } catch (err) {
        console.log('6-8. Query test failed:', err);
    }
}

testDirectQuery();

console.log('=== END DIAGNOSTICS ===');
console.log('Copy this output and share it for debugging!');