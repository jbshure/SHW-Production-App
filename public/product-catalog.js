// product-catalog.js (defensive + debug)
console.log("📁 product-catalog.js is executing");

// ===== Supabase Init =====
let supabase = null;
let initialized = false;

// Log immediately when script loads
console.log("Initial check - window.supabase:", typeof window.supabase);
console.log("Initial check - window.SUPABASE_CONFIG:", window.SUPABASE_CONFIG);

function initializeSupabase() {
  try {
    // Check if the Supabase library is loaded
    if (typeof window.supabase === "undefined") {
      console.error("Supabase library not loaded. Make sure @supabase/supabase-js is included.");
      return false;
    }
    
    // Check for configuration
    if (!window.SUPABASE_CONFIG) {
      console.error("window.SUPABASE_CONFIG not found. Make sure supabase-config.js is loaded.");
      return false;
    }
    
    const { url, anonKey } = window.SUPABASE_CONFIG;
    
    if (!url || !anonKey || url === "YOUR_SUPABASE_PROJECT_URL") {
      console.error("Invalid Supabase configuration:", { url, anonKey: anonKey ? "***" : "missing" });
      return false;
    }
    
    // Create the Supabase client
    const { createClient } = window.supabase;
    supabase = createClient(url, anonKey);
    console.log("✅ Supabase initialized successfully with URL:", url);
    return true;
  } catch (e) {
    console.error("Supabase init error:", e);
  }
  console.log("Supabase not configured - running in demo mode");
  return false;
}

// ===== State =====
let products = [];
let categories = [];
let suppliers = [];
let currentView = "grid";
let filters = {
  search: "",
  categories: [],
  suppliers: [],
  status: [] // IMPORTANT: empty by default
};
let editingProduct = null;
let competitorScraper = null;
let priceComparisonChart = null;

// ===== Lifecycle =====
async function initializeCatalog() {
  if (initialized) {
    console.log("Already initialized");
    return;
  }
  
  console.log("🚀 Initializing Product Catalog");
  console.log("window.supabase:", typeof window.supabase);
  console.log("window.SUPABASE_CONFIG:", window.SUPABASE_CONFIG);
  
  const isConfigured = initializeSupabase();
  console.log("Supabase configured:", isConfigured);

  // sanity check for required DOM
  ["products-container","category-filters","supplier-filters"].forEach(id=>{
    if (!document.getElementById(id)) {
      console.warn(`[UI] Missing element with id="${id}". Rendering may look empty.`);
    }
  });

  if (!isConfigured || !supabase) {
    console.error("❌ Supabase not configured, showing fallback");
    showNoSupabaseConfig();
    return;
  }

  console.log("📊 Loading products directly...");
  await loadProducts();
  setupEventListeners();
  initialized = true;
}

// Auto-initialize when everything is ready
if (document.readyState === 'loading') {
  document.addEventListener("DOMContentLoaded", async () => {
    console.log("DOM Ready - waiting for dependencies...");
    // Wait for Supabase to be available
    let attempts = 0;
    while ((!window.supabase || !window.SUPABASE_CONFIG) && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (window.supabase && window.SUPABASE_CONFIG) {
      await initializeCatalog();
    } else {
      console.error("Failed to load dependencies after 5 seconds");
    }
  });
} else {
  // DOM already loaded, check if we can initialize
  console.log("DOM already loaded - checking dependencies...");
  if (window.supabase && window.SUPABASE_CONFIG) {
    initializeCatalog();
  } else {
    // Wait a bit for dependencies
    setTimeout(() => {
      if (window.supabase && window.SUPABASE_CONFIG) {
        initializeCatalog();
      }
    }, 500);
  }
}

// Manual initialization function for debugging
window.manualInit = async function() {
  console.log("Manual initialization triggered");
  await initializeCatalog();
};

// Hard refresh function - clears all cached data and reloads
window.hardRefresh = async function() {
  console.log("🔃 Hard refresh initiated - clearing all cached data");
  
  // Clear all global variables
  products = [];
  categories = [];
  suppliers = [];
  window.products = [];
  window.fullProducts = [];
  window.debugProducts = [];
  window.categories = [];
  window.suppliers = [];
  
  // Clear any localStorage cache if exists
  try {
    localStorage.removeItem('products_cache');
    localStorage.removeItem('categories_cache');
    localStorage.removeItem('suppliers_cache');
  } catch (e) {}
  
  // Force reload from Supabase
  console.log("Reloading all data from Supabase...");
  await loadProducts();
  
  console.log("✅ Hard refresh complete");
  
  // Show success message
  const container = document.getElementById("products-container");
  if (container) {
    const msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:10px 20px;border-radius:4px;z-index:9999';
    msg.textContent = '✅ Data refreshed successfully!';
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }
};

// ===== Fallback message & demo data =====
function showNoSupabaseConfig() {
  const el = document.getElementById("products-container");
  if (el) {
    el.innerHTML = `
      <div class="empty-state">
        <h3>Supabase Configuration Required</h3>
        <p>Please configure your Supabase credentials in product-catalog.js (or inject via window.SUPABASE_CONFIG).</p>
        <ol style="text-align: left; max-width: 500px; margin: 20px auto;">
          <li>Include supabase-js v2 on the page</li>
          <li>Set window.SUPABASE_CONFIG = { url, anonKey }</li>
          <li>Reload the page</li>
        </ol>
      </div>
    `;
  }
  loadDemoData();
}

// ===== Data Loading =====
async function loadInitialData() {
  try {
    console.log("Loading data from Supabase...");
    // Load products (which will also load categories and suppliers)
    await loadProducts();
  } catch (error) {
    console.error("Error loading initial data:", error);
    showError(readableError(error));
    loadDemoData();
  }
}

async function loadProducts() {
  try {
    console.log("=== LOADING PRODUCTS ===");
    
    // Use the new robust loader if available
    if (window.loadProductsWithFullRelationships) {
      console.log("Using robust product loader...");
      const loadedProducts = await window.loadProductsWithFullRelationships();
      
      // The loader already sets window.products, window.debugProducts, etc.
      products = loadedProducts;
      
      // Also ensure categories and suppliers are in scope
      if (window.categories) {
        categories = window.categories;
        console.log("Loaded", categories.length, "categories from loader");
      }
      if (window.suppliers) {
        suppliers = window.suppliers;
        console.log("Loaded", suppliers.length, "suppliers from loader");
      }
      
      // Populate filters and render
      populateFilters();
      renderProducts();
      updateStats();
      
      return;
    }
    
    // Fallback to old loading method
    console.log("Fallback: Loading products with old method...");

    // Simple query without joins to ensure we get ALL data
    const { data: simpleData, error: simpleError } = await supabase
      .from("products")
      .select("*");
    
    if (simpleError) {
      console.error("Error loading products:", simpleError);
      throw simpleError;
    }
    
    console.log(`✅ Loaded ${simpleData?.length || 0} products from Supabase (no limit)`);
    
    // Load all related tables in parallel for better performance
    // Wrap in try-catch to handle tables that might not exist or have permission issues
    let categoriesResult = { data: null, error: null };
    let suppliersResult = { data: null, error: null };
    let optionTypesResult = { data: null, error: null };
    let optionValuesResult = { data: null, error: null };
    let currentVariantsResult = { data: null, error: null };
    let volumePricesResult = { data: null, error: null };
    
    // Also load the link tables to connect relationships
    let productOptionTypesLink = { data: null, error: null };
    let optionTypesValuesLink = { data: null, error: null };
    let variantValuesLink = { data: null, error: null };
    let variantPricesLink = { data: null, error: null };
    
    try {
      [categoriesResult, suppliersResult, optionTypesResult, optionValuesResult, currentVariantsResult, volumePricesResult,
       productOptionTypesLink, optionTypesValuesLink, variantValuesLink, variantPricesLink] = await Promise.all([
        supabase.from("categories").select("*").then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("supplier").select("*").then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("option_types").select("*").then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("option_values").select("*").then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("current_variant").select("*").limit(20000).then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("volume_prices").select("*").limit(20000).then(r => r).catch(e => ({ data: null, error: e })),
        // Link tables
        supabase.from("products_option_types_link").select("*").then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("option_types_option_values_link").select("*").limit(1000).then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("option_values_current_variant_link").select("*").limit(20000).then(r => r).catch(e => ({ data: null, error: e })),
        supabase.from("current_variant_volume_prices_link").select("*").limit(20000).then(r => r).catch(e => ({ data: null, error: e }))
      ]);
    } catch (err) {
      console.warn("Error loading related tables:", err);
    }
    
    // Log any permission errors
    if (categoriesResult.error) console.warn("Categories table error:", categoriesResult.error.message);
    if (suppliersResult.error) console.warn("Supplier table error:", suppliersResult.error.message);
    if (optionTypesResult.error) console.warn("Option types table error:", optionTypesResult.error.message);
    if (optionValuesResult.error) console.warn("Option values table error:", optionValuesResult.error.message);
    if (currentVariantsResult.error) console.warn("Current variants table error:", currentVariantsResult.error.message);
    if (volumePricesResult.error) console.warn("Volume prices table error:", volumePricesResult.error.message);
    
    // Store categories and suppliers globally
    if (categoriesResult.data) categories = categoriesResult.data;
    if (suppliersResult.data) suppliers = suppliersResult.data;
    
    // Create lookups for all relationships
    const optionTypesByProduct = {};
    const optionValuesByType = {};
    const variantsByValue = {};
    const pricesByVariant = {};
    
    // Map option types to products using the link table
    if (productOptionTypesLink.data && optionTypesResult.data) {
      console.log(`Loaded ${optionTypesResult.data.length} option types`);
      console.log(`Loaded ${productOptionTypesLink.data.length} product-option type links`);
      
      productOptionTypesLink.data.forEach(link => {
        const optionType = optionTypesResult.data.find(ot => ot.id === link.option_types_id);
        if (optionType) {
          if (!optionTypesByProduct[link.products_id]) {
            optionTypesByProduct[link.products_id] = [];
          }
          optionTypesByProduct[link.products_id].push(optionType);
        }
      });
    }
    
    // Map option values to option types using the link table
    if (optionTypesValuesLink.data && optionValuesResult.data) {
      console.log(`Loaded ${optionValuesResult.data.length} option values`);
      console.log(`Loaded ${optionTypesValuesLink.data.length} option type-value links`);
      
      optionTypesValuesLink.data.forEach(link => {
        const optionValue = optionValuesResult.data.find(ov => ov.id === link.option_values_id);
        if (optionValue) {
          if (!optionValuesByType[link.option_types_id]) {
            optionValuesByType[link.option_types_id] = [];
          }
          optionValuesByType[link.option_types_id].push(optionValue);
        }
      });
    }
    
    // Map current variants to option values using the link table
    if (variantValuesLink.data && currentVariantsResult.data) {
      console.log(`Loaded ${currentVariantsResult.data.length} current variants (total in DB: 1951)`);
      console.log(`Loaded ${variantValuesLink.data.length} variant-value links (total in DB: 7864)`);
      
      // Debug: Check a sample link to see the structure
      if (variantValuesLink.data.length > 0) {
        console.log("Sample variant-value link:", variantValuesLink.data[0]);
      }
      
      let variantMappingSuccess = 0;
      let variantMappingFailed = 0;
      
      variantValuesLink.data.forEach(link => {
        const variant = currentVariantsResult.data.find(v => v.id === link.current_variant_id);
        if (variant) {
          if (!variantsByValue[link.option_values_id]) {
            variantsByValue[link.option_values_id] = [];
          }
          variantsByValue[link.option_values_id].push(variant);
          variantMappingSuccess++;
        } else {
          variantMappingFailed++;
        }
      });
      
      console.log(`Variant mapping: ${variantMappingSuccess} successful, ${variantMappingFailed} failed`);
      console.log(`Total unique option values with variants: ${Object.keys(variantsByValue).length}`);
    }
    
    // Map volume prices to variants using the link table
    if (variantPricesLink.data && volumePricesResult.data) {
      console.log(`Loaded ${volumePricesResult.data.length} volume prices`);
      console.log(`Loaded ${variantPricesLink.data.length} variant-price links`);
      
      variantPricesLink.data.forEach(link => {
        const price = volumePricesResult.data.find(p => p.id === link.volume_prices_id);
        if (price) {
          if (!pricesByVariant[link.current_variant_id]) {
            pricesByVariant[link.current_variant_id] = [];
          }
          pricesByVariant[link.current_variant_id].push(price);
        }
      });
    }
    
    // Map the relationships manually with enhanced image handling
    products = (simpleData || []).map(product => {
      const category = categories?.find(c => c.id === product.category_id);
      const supplier = suppliers?.find(s => s.id === product.supplier_id);
      
      // Build the complete nested structure for option types
      const productOptionTypes = (optionTypesByProduct[product.id] || []).map(optionType => {
        // Get option values for this type
        const typeOptionValues = (optionValuesByType[optionType.id] || []).map(optionValue => {
          // Get variants for this option value
          const valueVariants = (variantsByValue[optionValue.id] || []).map(variant => {
            // Get volume prices for this variant
            const variantPrices = pricesByVariant[variant.id] || [];
            return {
              ...variant,
              volume_prices: variantPrices.sort((a, b) => (a.min_quantity || 0) - (b.min_quantity || 0))
            };
          });
          return {
            ...optionValue,
            current_variants: valueVariants
          };
        });
        return {
          ...optionType,
          option_values: typeOptionValues
        };
      });
      
      // Enhanced image handling - check multiple possible image fields (skip Airtable URLs)
      let imageUrl = null;
      
      // Priority 1: Base64 image data
      if (product.image_data) {
        imageUrl = product.image_data;
      }
      // Priority 2: ShurePrint artboard image (non-Airtable)
      else if (product.shureprint_artboard_image && !product.shureprint_artboard_image.includes('airtable')) {
        imageUrl = product.shureprint_artboard_image;
      }
      // Priority 3: image_url field (non-Airtable)
      else if (product.image_url && !product.image_url.includes('airtable')) {
        imageUrl = product.image_url;
      }
      // Priority 4: image field (non-Airtable)
      else if (product.image && !product.image.includes('airtable')) {
        imageUrl = product.image;
      }
      // Priority 5: First non-Airtable image from images array
      else if (product.images && Array.isArray(product.images)) {
        for (let img of product.images) {
          const url = typeof img === 'string' ? img : img?.url;
          if (url && !url.includes('airtable')) {
            imageUrl = url;
            break;
          }
        }
      }
      // Last resort: Use Airtable URL if nothing else available
      if (!imageUrl) {
        if (product.image_url) imageUrl = product.image_url;
        else if (product.image) imageUrl = product.image;
        else if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          imageUrl = typeof product.images[0] === 'string' ? product.images[0] : product.images[0]?.url;
        }
      }
      
      return {
        ...product,
        // Map product_name to name for consistent access
        name: product.product_name || product.name || 'Unnamed Product',
        category: category || null,
        supplier: supplier || null,
        option_types: productOptionTypes,
        // Normalize image fields for consistent access
        image_url: imageUrl,
        images: product.images || (imageUrl ? [imageUrl] : [])
      };
    });
    
    console.log(`✅ Products array has ${products.length} items with relationships connected`);
    window.debugProducts = products; // Store globally for debugging
    
    if (products.length > 0) {
      const firstProduct = products[0];
      console.log("First product with relationships:", firstProduct);
      console.log("Product has image?", !!firstProduct.image_url);
      console.log("Product option types:", firstProduct.option_types?.length || 0);
      
      // Log the nested structure
      if (firstProduct.option_types?.length > 0) {
        const firstType = firstProduct.option_types[0];
        console.log("First option type:", firstType.name || firstType.type_name);
        console.log("Option values count:", firstType.option_values?.length || 0);
        
        if (firstType.option_values?.length > 0) {
          const firstValue = firstType.option_values[0];
          console.log("First option value:", firstValue.name || firstValue.value_name);
          console.log("Current variants count:", firstValue.current_variants?.length || 0);
          
          if (firstValue.current_variants?.length > 0) {
            const firstVariant = firstValue.current_variants[0];
            console.log("First variant:", firstVariant);
            console.log("Volume prices count:", firstVariant.volume_prices?.length || 0);
          } else {
            console.log("No variants found for value ID:", firstValue.id);
            console.log("Checking variantsByValue lookup:", Object.keys(variantsByValue).length, "values have variants");
          }
        }
      }
    }

    // Populate filters after loading categories/suppliers
    populateFilters();
    
    // Render the products
    console.log("🎨 About to call renderProducts() with", products.length, "products");
    renderProducts();
    console.log("🎨 renderProducts() completed");
    updateStats();
  } catch (error) {
    console.error("Error loading products:", error);
    
    // Check for specific permission errors
    if (error.message && error.message.includes('permission denied')) {
      showError(`Permission Error: ${error.message}\n\nTo fix this in Supabase:\n1. Go to Authentication → Policies\n2. Enable RLS for the affected tables\n3. Create a policy allowing SELECT for anon users\n\nOr disable RLS temporarily:\nSQL Editor → Run: ALTER TABLE products DISABLE ROW LEVEL SECURITY;`);
    } else if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
      showError(`Table Error: ${error.message}\n\nThe required tables don't exist in your Supabase database.\nPlease create the products, categories, and suppliers tables.`);
    } else {
      showError(readableError(error));
    }
    
    if (!products || products.length === 0) {
      console.log("Loading demo data as fallback...");
      loadDemoData();
    }
  }
}

// ===== Demo Data (when no Supabase) =====
function loadDemoData() {
  categories = [
    { id: "1", name: "Business Cards" },
    { id: "2", name: "Flyers" },
    { id: "3", name: "Banners" },
    { id: "4", name: "Labels" },
    { id: "5", name: "Packaging" }
  ];

  suppliers = [
    { id: "1", name: "Print Partner Inc" },
    { id: "2", name: "Quality Prints Co" },
    { id: "3", name: "Express Printing" }
  ];

  products = [
    {
      id: "1",
      name: "Premium Business Cards",
      product_name: "Premium Business Cards",
      cp_sku: "BC-001",
      description: "High-quality business cards with multiple finish options",
      category: { name: "Business Cards" },
      supplier: { name: "Print Partner Inc" },
      status: "Active",
      images: [{ url: "https://via.placeholder.com/300x200/E3FF33/000?text=Business+Cards" }],
      variants: [
        { id: "1", min_order_qty: 100, volume_prices: [
          { starting_qty: 100, unit_price: 0.25 },
          { starting_qty: 500, unit_price: 0.2 },
          { starting_qty: 1000, unit_price: 0.15 }
        ] }
      ]
    }
  ];

  populateFilters();
  renderProducts();
  updateStats();
  console.log("Demo data loaded with product_name field");
}

// ===== Filters UI =====
function populateFilters() {
  const categoryFilters = document.getElementById("category-filters");
  if (categoryFilters) {
    categoryFilters.innerHTML = (categories || [])
      .map((cat) => `
        <div class="filter-checkbox">
          <input type="checkbox" id="cat-${cat.id}" value="${cat.id}" onchange="updateCategoryFilter('${cat.id}')">
          <label for="cat-${cat.id}">${safeText(cat.name)}</label>
          <span class="filter-count">${countProductsByCategory(cat.name)}</span>
        </div>
      `).join("");
  }

  const supplierFilters = document.getElementById("supplier-filters");
  if (supplierFilters) {
    supplierFilters.innerHTML = (suppliers || [])
      .map((sup) => `
        <div class="filter-checkbox">
          <input type="checkbox" id="sup-${sup.id}" value="${sup.id}" onchange="updateSupplierFilter('${sup.id}')">
          <label for="sup-${sup.id}">${safeText(sup.name)}</label>
          <span class="filter-count">${countProductsBySupplier(sup.name)}</span>
        </div>
      `).join("");
  }

  const categorySelect = document.getElementById("productCategory");
  if (categorySelect) {
    categorySelect.innerHTML =
      '<option value="">Select Category</option>' +
      (categories || [])
        .map((cat) => `<option value="${cat.id}">${safeText(cat.name)}</option>`)
        .join("");
  }

  const supplierSelect = document.getElementById("productSupplier");
  if (supplierSelect) {
    supplierSelect.innerHTML =
      '<option value="">Select Supplier</option>' +
      (suppliers || [])
        .map((sup) => `<option value="${sup.id}">${safeText(sup.name)}</option>`)
        .join("");
  }
}

function countProductsByCategory(categoryName) {
  return (products || []).filter((p) => {
    try {
      if (p.category && p.category.name === categoryName) return true;
      if (p.categories && p.categories.name === categoryName) return true;
      const category = (categories || []).find((c) => c.name === categoryName);
      if (category && p.category_id === category.id) return true;
    } catch {}
    return false;
  }).length;
}

function countProductsBySupplier(supplierName) {
  return (products || []).filter((p) => {
    try {
      if (p.supplier && p.supplier.name === supplierName) return true;
      if (p.suppliers && p.suppliers.name === supplierName) return true;
      const supplier = (suppliers || []).find((s) => s.name === supplierName);
      if (supplier && p.supplier_id === supplier.id) return true;
    } catch {}
    return false;
  }).length;
}

function updateStats() {
  setText("total-products", (products || []).length);
  setText("active-products", (products || []).filter((p) => p.status === "Active").length);
  setText("total-categories", (categories || []).length);
  setText("total-suppliers", (suppliers || []).length);
}

// ===== Rendering =====
function renderProducts() {
  const container = document.getElementById("products-container");
  if (!container) {
    console.warn('[UI] "products-container" not found; cannot render list.');
    return;
  }

  const filtered = filterProducts();
  console.log(`Render: products=${(products||[]).length}, filtered=${filtered.length}`);
  console.log("Current filters:", filters);
  if (filtered[0]) console.log("Render sample:", filtered[0]);

  // Debug badge
  const debugBadge = `
    <div style="font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#555; margin:8px 0;">
      Showing <b>${filtered.length}</b> of <b>${(products||[]).length}</b> products
      ${filters.search ? ` | search="${safeText(filters.search)}"` : ""}
      ${filters.status.length > 0 ? ` | status="${filters.status.join(', ')}"` : ""}
    </div>
  `;

  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      ${debugBadge}
      <div class="empty-state">
        <h3>No products found</h3>
        <p>Try adjusting your filters or search terms</p>
        <p style="color: #888; font-size: 0.9em;">Active filters: ${JSON.stringify(filters)}</p>
      </div>
    `;
    return;
  }

  if (currentView === "grid") {
    container.innerHTML = debugBadge + renderGridHTML(filtered);
  } else {
    container.innerHTML = debugBadge + renderTableHTML(filtered);
  }
}

function filterProducts() {
  const list = Array.isArray(products) ? products : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const product = list[i];
    try {
      if (filters.search) {
        const s = filters.search.toLowerCase();
        const searchName = product.name || product.product_name || '';
        const match =
          (searchName && String(searchName).toLowerCase().includes(s)) ||
          (product.cp_sku && String(product.cp_sku).toLowerCase().includes(s)) ||
          (product.description && String(product.description).toLowerCase().includes(s));
        if (!match) continue;
      }

      if (filters.categories && filters.categories.length > 0) {
        const ok = filters.categories.some((catId) => {
          const category = (categories || []).find((c) => String(c.id) === String(catId));
          if (!category) return false;
          const n = category.name;
          return (product.category && product.category.name === n) ||
                 (product.categories && product.categories.name === n) ||
                 (product.category_id && String(product.category_id) === String(category.id));
        });
        if (!ok) continue;
      }

      if (filters.suppliers && filters.suppliers.length > 0) {
        const ok = filters.suppliers.some((supId) => {
          const supplier = (suppliers || []).find((s) => String(s.id) === String(supId));
          if (!supplier) return false;
          const n = supplier.name;
          return (product.supplier && product.supplier.name === n) ||
                 (product.suppliers && product.suppliers.name === n) ||
                 (product.supplier_id && String(product.supplier_id) === String(supplier.id));
        });
        if (!ok) continue;
      }

      if (filters.status && filters.status.length > 0) {
        const st = product.status || "Active"; // Default to Active if status is null
        if (!filters.status.includes(st)) continue;
      }

      out.push(product);
    } catch (e) {
      console.warn("Filter skipped a product due to error:", e, product);
      out.push(product); // fail-open so one bad row doesn't wipe the list
    }
  }
  return out;
}

function renderGridHTML(list) {
  let html = '<div class="products-grid">';
  for (let i = 0; i < list.length; i++) {
    const product = list[i] || {};
    try {
      // Use the normalized image_url from the product loader
      const imageUrl = product.image_url || safeFirstImage(product);
      
      // Debug: Log first few products' structure
      if (i < 3) {
        console.log(`Product ${i}:`, {
          name: product.name,
          image_url: product.image_url ? 'Has image' : 'No image',
          total_variants: product.total_variants,
          total_option_types: product.total_option_types,
          total_option_values: product.total_option_values,
          option_types_length: product.option_types?.length || 0,
          category: product.category?.name || 'No category',
          supplier: product.supplier?.name || 'No supplier'
        });
      }
      
      const price = getProductPrice(product);
      const sku = product.cp_sku || product.airtable_id || "N/A";
      const categoryName = getCategoryName(product);
      const stockInfo = product.track_inventory ? 
        `<div style="font-size: 11px; color: ${product.stock_quantity > 0 ? '#28a745' : '#dc3545'};">
          Stock: ${product.stock_quantity || 0} ${product.unit_of_measure || 'EA'}
        </div>` : '';
      
      const moq = product.minimum_order_quantity || product.min_order_quantity || 1;
      const moqInfo = moq > 1 ? 
        `<div style="font-size: 11px; color: #666;">MOQ: ${moq}</div>` : '';
      
      // Create image container with fallback
      let imageElement = `
        <div class="product-image-container" style="position:relative;width:100%;height:200px;background:#f0f0f0;overflow:hidden;">
      `;
      
      if (imageUrl && imageUrl.length > 0) {
        // Try to load the image
        imageElement += `
          <img 
            src="${safeAttr(imageUrl)}" 
            alt="${safeAttr(product.name || product.product_name || 'Product')}" 
            class="product-image"
            loading="lazy"
            onerror="this.style.display='none';">
          <div class="image-placeholder" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;color:#999;z-index:-1;">
            No Image Available
          </div>
        `;
      } else {
        // No URL at all
        imageElement += `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;">
            No Image Available
          </div>
        `;
      }
      
      imageElement += `</div>`;
      
      html += `
        <div class="product-card" style="position: relative;">
          <div onclick="editProduct('${safeAttr(product.id)}')" style="cursor: pointer;">
            ${imageElement}
            <div class="product-info">
              <div class="product-name">${safeText(product.name || product.product_name || 'Unnamed Product')}</div>
            <div class="product-sku">SKU: ${safeText(sku)}</div>
            <div class="product-price">${safeText(price)}</div>
            <div class="product-category">${safeText(categoryName)}</div>
            ${getProductOptionsHTML(product)}
            ${stockInfo}
            ${moqInfo}
          </div>
          </div>
          <button onclick="openPriceComparison('${safeAttr(product.id)}')" 
                  style="position: absolute; top: 10px; right: 10px; background: var(--neon); border: none; 
                         border-radius: 20px; padding: 6px 12px; font-size: 11px; font-weight: 700; 
                         cursor: pointer; z-index: 10;" 
                  title="Compare Prices">
            📊 Compare
          </button>
        </div>
      `;
    } catch (e) {
      console.warn("Grid row render error for product index", i, e, list[i]);
    }
  }
  html += '</div>';
  return html;
}

function renderTableHTML(list) {
  let rows = "";
  for (let i = 0; i < list.length; i++) {
    const product = list[i] || {};
    try {
      const price = getProductPrice(product);
      const stockStatus = product.track_inventory ? 
        (product.stock_quantity > 0 ? 
          `<span style="color: #28a745;">${product.stock_quantity}</span>` : 
          `<span style="color: #dc3545;">0</span>`) : 
        'N/A';
      
      rows += `
        <tr>
          <td><strong>${safeText(product.name || product.product_name || 'Unnamed Product')}</strong></td>
          <td>${safeText(product.cp_sku || "N/A")}</td>
          <td>${safeText(getCategoryName(product))}</td>
          <td>${safeText((product.supplier && product.supplier.name) || "N/A")}</td>
          <td>${safeText(price)}</td>
          <td>${stockStatus}</td>
          <td>${safeText(product.minimum_order_quantity || product.min_order_quantity || 1)}</td>
          <td><span class="price-tier">${safeText(product.status || "Active")}</span></td>
          <td><button class="btn btn-secondary" onclick="editProduct('${safeAttr(product.id)}')">Edit</button></td>
        </tr>
      `;
    } catch (e) {
      console.warn("Table row render error for product index", i, e, list[i]);
    }
  }
  return `
    <table class="products-table">
      <thead>
        <tr>
          <th>Product Name</th><th>SKU</th><th>Category</th>
          <th>Supplier</th><th>Price</th><th>Stock</th><th>MOQ</th><th>Status</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function getCategoryName(product) {
  try {
    // First check if category is already populated as an object (from the loader)
    if (product.category && product.category.name) return String(product.category.name);
    if (product.categories && product.categories.name) return String(product.categories.name);
    
    // Fallback to looking up by ID
    if (product.category_id && categories && categories.length) {
      const cat = categories.find((c) => String(c.id) === String(product.category_id));
      if (cat) return String(cat.name);
    }
  } catch (e) {
    console.error('Error getting category name:', e);
  }
  return "Uncategorized";
}

function getProductPrice(product) {
  try {
    // First try the new structure with option_types -> option_values -> current_variants
    if (product.option_types && product.option_types.length > 0) {
      // Get the first variant from the first option value
      for (let optionType of product.option_types) {
        if (optionType.option_values && optionType.option_values.length > 0) {
          for (let optionValue of optionType.option_values) {
            if (optionValue.current_variants && optionValue.current_variants.length > 0) {
              const variant = optionValue.current_variants[0];
              
              // Check for volume prices
              if (variant.volume_prices && variant.volume_prices.length > 0) {
                const prices = [...variant.volume_prices].sort(
                  (a, b) => (Number(a.min_quantity || a.starting_qty) || 0) - (Number(b.min_quantity || b.starting_qty) || 0)
                );
                const p = prices[0] || {};
                const min = p.unit_price ?? p.price ?? p.final_cost ?? p.margin_50 ?? null;
                if (min != null && !isNaN(parseFloat(min))) {
                  return "From $" + parseFloat(min).toFixed(2);
                }
              }
              
              // If no volume prices, check setup cost
              if (variant.setup_cost) {
                return "Setup: $" + parseFloat(variant.setup_cost).toFixed(2);
              }
            }
          }
        }
      }
    }
    
    // Fallback to old structure
    if (product.variants && product.variants.length > 0) {
      const variant = product.variants[0];
      if (variant.volume_prices && variant.volume_prices.length > 0) {
        const prices = [...variant.volume_prices].sort(
          (a, b) => (Number(a.starting_qty) || 0) - (Number(b.starting_qty) || 0)
        );
        const p = prices[0] || {};
        const min = p.unit_price ?? p.final_cost ?? p.margin_50 ?? null;
        if (min != null && !isNaN(parseFloat(min))) {
          return "From $" + parseFloat(min).toFixed(2);
        }
      }
    }
    
    // Check base_price field
    if (product.base_price) {
      return "$" + parseFloat(product.base_price).toFixed(2);
    }
    
    if (product.attributes && product.attributes.price != null) {
      const val = parseFloat(product.attributes.price);
      if (!isNaN(val)) return "$" + val.toFixed(2);
    }
  } catch {}
  return "Contact for pricing";
}

// Get product options summary for display
function getProductOptionsHTML(product) {
  try {
    // Debug logging for first product
    if (product.name && product.name.includes('Business Card')) {
      console.log('getProductOptionsHTML for Business Card:', {
        total_variants: product.total_variants,
        total_option_types: product.total_option_types,
        total_option_values: product.total_option_values,
        option_types: product.option_types?.length || 0
      });
    }
    
    // Use pre-calculated totals from the loader if available
    if (product.total_variants !== undefined && product.total_variants !== null) {
      const optionTypes = product.total_option_types || 0;
      const optionValues = product.total_option_values || 0;
      const variants = product.total_variants || 0;
      
      // Show the info if any of these values are greater than 0
      if (variants > 0 || optionValues > 0 || optionTypes > 0) {
        // Create a simple clickable summary that expands to show variant details
        const variantDetailsId = `variants-${product.id}`;
        let detailsHTML = `
          <div style="font-size: 11px; color: #666; margin-top: 4px; border-top: 1px solid #eee; padding-top: 4px;">
            <div style="cursor: pointer; user-select: none;" onclick="toggleVariantDetails('${product.id}')">
              <strong>${optionTypes}</strong> options • <strong>${optionValues}</strong> values • <strong>${variants}</strong> variants
              <span style="float: right;">▼</span>
            </div>
            <div id="${variantDetailsId}" style="display: none; margin-top: 8px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
        `;
        
        // Show a simple summary of options and values
        if (product.option_types && product.option_types.length > 0) {
          product.option_types.forEach((type, idx) => {
            // Use presentation field for display, fallback to name
            const typeName = type.presentation || type.name || type.type_name || `Option ${idx + 1}`;
            detailsHTML += `
              <div style="margin-bottom: 8px;">
                <strong style="color: #333; font-size: 11px;">${typeName}:</strong>
                <div style="margin-left: 10px; margin-top: 4px; font-size: 10px; color: #555;">
            `;
            
            if (type.option_values && type.option_values.length > 0) {
              // Use presentation field for values display
              const values = type.option_values.map(v => v.presentation || v.name || v.value_name || 'Unnamed').join(', ');
              detailsHTML += `${values}`;
            } else {
              detailsHTML += `<span style="color: #888;">No values defined</span>`;
            }
            
            detailsHTML += `</div></div>`;
          });
        }
        
        detailsHTML += `
              <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                <button onclick="editProduct('${product.id}')" style="background: #2196F3; color: white; border: none; padding: 4px 8px; border-radius: 3px; font-size: 10px; cursor: pointer;">
                  Edit Product & Variants
                </button>
              </div>
            </div>
          </div>
        `;
        return detailsHTML;
      }
      return '';
    }
    
    // Fallback to manual calculation
    if (!product.option_types || product.option_types.length === 0) return '';
    
    let totalVariants = 0;
    let optionCount = 0;
    
    product.option_types.forEach(type => {
      if (type.option_values) {
        optionCount += type.option_values.length;
        type.option_values.forEach(value => {
          totalVariants += (value.current_variants?.length || 0);
        });
      }
    });
    
    if (optionCount === 0) return '';
    
    return `
      <div style="font-size: 11px; color: #666; margin-top: 4px;">
        ${product.option_types.length} options • ${optionCount} values • ${totalVariants} variants
      </div>
    `;
  } catch (err) {
    console.error("Error in getProductOptionsHTML:", err);
    return '';
  }
}

// Generate pricing matrix HTML for products with 2 option types
function generatePricingMatrixHTML(product) {
  if (!product.option_types || product.option_types.length !== 2) {
    return '<p style="color: #888; font-size: 11px;">Pricing matrix requires exactly 2 option types.</p>';
  }
  
  const type1 = product.option_types[0];
  const type2 = product.option_types[1];
  const values1 = type1.option_values || [];
  const values2 = type2.option_values || [];
  
  let matrixHTML = `
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr>
          <th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0; text-align: left;">
            ${safeText(type1.presentation || type1.name || type1.type_name)} / ${safeText(type2.presentation || type2.name || type2.type_name)}
          </th>
  `;
  
  // Column headers
  values2.forEach(val2 => {
    matrixHTML += `
      <th style="padding: 8px; border: 1px solid #ddd; background: #f0f0f0; text-align: center; min-width: 80px;">
        ${safeText(val2.presentation || val2.name || val2.value_name || 'Unnamed')}
      </th>
    `;
  });
  
  matrixHTML += `</tr></thead><tbody>`;
  
  // Rows
  values1.forEach(val1 => {
    matrixHTML += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; background: #f9f9f9; font-weight: bold;">
          ${safeText(val1.presentation || val1.name || val1.value_name || 'Unnamed')}
        </td>
    `;
    
    values2.forEach(val2 => {
      // Find the matching variant
      let cellContent = '';
      
      if (val1.current_variants) {
        // For simplicity, just show if variant exists
        const hasVariant = val1.current_variants.length > 0;
        if (hasVariant) {
          const variant = val1.current_variants[0];
          if (variant.volume_prices && variant.volume_prices.length > 0) {
            const price = variant.volume_prices[0];
            const unitPrice = price.unit_price || price.price || 0;
            cellContent = `
              <input type="number" value="${unitPrice}" 
                style="width: 60px; padding: 3px; border: 1px solid #ccc; border-radius: 2px; 
                       font-size: 10px; text-align: center;" 
                disabled 
                title="Price for ${val1.presentation || val1.name || val1.value_name} - ${val2.presentation || val2.name || val2.value_name}">
            `;
          } else {
            cellContent = `<span style="color: #888;">—</span>`;
          }
        } else {
          cellContent = `<span style="color: #ccc;">N/A</span>`;
        }
      } else {
        cellContent = `<span style="color: #ccc;">—</span>`;
      }
      
      matrixHTML += `
        <td style="padding: 5px; border: 1px solid #ddd; text-align: center; background: white;">
          ${cellContent}
        </td>
      `;
    });
    
    matrixHTML += `</tr>`;
  });
  
  matrixHTML += `</tbody></table>`;
  
  return matrixHTML;
}

// Toggle variant details expansion
window.toggleVariantDetails = function(productId) {
  const detailsDiv = document.getElementById(`variants-${productId}`);
  if (detailsDiv) {
    const isHidden = detailsDiv.style.display === 'none';
    detailsDiv.style.display = isHidden ? 'block' : 'none';
    
    // Update arrow indicator
    const arrow = detailsDiv.previousElementSibling.querySelector('span');
    if (arrow) {
      arrow.textContent = isHidden ? '▲' : '▼';
    }
  }
};

// Helper functions for managing option types and values
window.removeOptionType = function(typeId) {
  const element = document.getElementById(`option-group-${typeId}`);
  if (element && confirm('Are you sure you want to remove this option group?')) {
    element.remove();
  }
};

window.removeOptionValue = function(typeId, valueId) {
  const element = document.getElementById(`value-row-${typeId}-${valueId}`);
  if (element) {
    element.remove();
  }
};

window.addOptionValue = function(typeId) {
  const tbody = document.getElementById(`option-values-${typeId}`);
  if (!tbody) return;
  
  const newValueId = `new-${Date.now()}`;
  const newRow = document.createElement('tr');
  newRow.id = `value-row-${typeId}-${newValueId}`;
  newRow.innerHTML = `
    <td style="padding: 6px; border: 1px solid #dee2e6;">
      <input type="text" value="" 
        id="value-name-${typeId}-${newValueId}"
        style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px;"
        placeholder="Value name">
    </td>
    <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
      <input type="number" value="0" 
        id="value-price-${typeId}-${newValueId}"
        style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; text-align: center;"
        step="0.01" placeholder="0.00">
    </td>
    <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
      <input type="text" value="" 
        id="value-sku-${typeId}-${newValueId}"
        style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; text-align: center;"
        placeholder="-XXX">
    </td>
    <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
      <input type="radio" name="default-${typeId}">
    </td>
    <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
      <button onclick="removeOptionValue('${typeId}', '${newValueId}')" 
        style="background: transparent; border: none; color: #dc3545; cursor: pointer; font-size: 18px;">
        ×
      </button>
    </td>
  `;
  
  tbody.appendChild(newRow);
};

window.addNewOptionType = function() {
  const container = document.getElementById('productOptionsContainer');
  if (!container) return;
  
  const newTypeId = `new-type-${Date.now()}`;
  const groupDiv = document.createElement('div');
  groupDiv.id = `option-group-${newTypeId}`;
  groupDiv.style.cssText = 'border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: #fff;';
  
  groupDiv.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <input type="text" value="" 
          id="option-name-${newTypeId}"
          style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-weight: 600;"
          placeholder="Option Type Name (e.g., Size, Color)">
        <select style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px;">
          <option value="dropdown">Dropdown</option>
          <option value="buttons">Buttons</option>
          <option value="swatches">Swatches</option>
        </select>
        <label style="display: flex; align-items: center; gap: 5px;">
          <input type="checkbox" checked>
          <span style="font-size: 13px;">Required</span>
        </label>
      </div>
      <button onclick="removeOptionType('${newTypeId}')" 
        style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
        Remove Group
      </button>
    </div>
    
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f8f9fa;">
          <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 12px;">Option Value</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 120px;">Price Adjustment</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 100px;">SKU Suffix</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 80px;">Default</th>
          <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 60px;">Action</th>
        </tr>
      </thead>
      <tbody id="option-values-${newTypeId}">
      </tbody>
    </table>
    
    <button onclick="addOptionValue('${newTypeId}')" 
      style="margin-top: 10px; background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
      + Add Value
    </button>
  `;
  
  // Insert before the "Add Option Group" button
  const addButton = container.querySelector('button[onclick*="addNewOptionType"]');
  if (addButton) {
    container.insertBefore(groupDiv, addButton);
  } else {
    container.appendChild(groupDiv);
  }
};

// Removed showProductDetails - now using editProduct modal instead
// Helper function removed - now handled in editProduct

// ===== Events & Filters =====
function setupEventListeners() {
  const searchEl = document.getElementById("search-input");
  if (searchEl) {
    searchEl.addEventListener("input", (e) => {
      filters.search = e.target.value || "";
      renderProducts();
    });
  }

  const active = document.getElementById("filter-active");
  const draft = document.getElementById("filter-draft");
  const archived = document.getElementById("filter-archived");

  const updateStatusFilter = () => {
    filters.status = [];
    if (active && active.checked) filters.status.push("Active");
    if (draft && draft.checked) filters.status.push("Draft");
    if (archived && archived.checked) filters.status.push("Archived");

    if (supabase) {
      loadProducts(); // refetch from DB when status filters change
    } else {
      renderProducts();
    }
  };

  if (active) active.addEventListener("change", updateStatusFilter);
  if (draft) draft.addEventListener("change", updateStatusFilter);
  if (archived) archived.addEventListener("change", updateStatusFilter);
  
  // Setup modal close on outside click for ALL modals
  const modals = ['productModal', 'pricingMatrixModal', 'importModal', 'priceComparisonModal'];
  modals.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener('click', function(event) {
        if (event.target === modal) {
          // Close the appropriate modal
          if (modalId === 'productModal') {
            closeProductModal();
          } else if (modalId === 'pricingMatrixModal') {
            closePricingMatrix();
          } else if (modalId === 'importModal') {
            closeImportModal();
          } else if (modalId === 'priceComparisonModal') {
            closePriceComparison();
          }
        }
      });
    }
  });
  
  // Add ESC key listener to close any open modal
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      // Close any open modal
      const openModals = document.querySelectorAll('.modal.show');
      openModals.forEach(modal => {
        if (modal.id === 'productModal') {
          closeProductModal();
        } else if (modal.id === 'pricingMatrixModal') {
          closePricingMatrix();
        } else if (modal.id === 'importModal') {
          closeImportModal();
        } else if (modal.id === 'priceComparisonModal') {
          closePriceComparison();
        }
      });
    }
  });
}

window.updateCategoryFilter = function (categoryId) {
  const checkbox = document.getElementById(`cat-${categoryId}`);
  if (!checkbox) return;
  if (checkbox.checked) {
    if (!filters.categories.includes(categoryId)) filters.categories.push(categoryId);
  } else {
    filters.categories = filters.categories.filter((id) => id !== categoryId);
  }
  renderProducts();
};

window.updateSupplierFilter = function (supplierId) {
  const checkbox = document.getElementById(`sup-${supplierId}`);
  if (!checkbox) return;
  if (checkbox.checked) {
    if (!filters.suppliers.includes(supplierId)) filters.suppliers.push(supplierId);
  } else {
    filters.suppliers = filters.suppliers.filter((id) => id !== supplierId);
  }
  renderProducts();
};

window.clearFilters = function () {
  filters = { search: "", categories: [], suppliers: [], status: [] };
  const search = document.getElementById("search-input");
  if (search) search.value = "";
  document.querySelectorAll(".filter-checkbox input").forEach((cb) => (cb.checked = false));
  ["filter-active","filter-draft","filter-archived"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.checked = false;
  });
  renderProducts();
};

window.refreshProducts = async function () {
  console.log("🔄 Refreshing products from Supabase...");
  
  // Show loading state
  const container = document.getElementById("products-container");
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>🔄 Refreshing products...</h3>
        <p>Pulling latest data from Supabase</p>
      </div>
    `;
  }
  
  // Clear existing data
  products = [];
  categories = [];
  suppliers = [];
  window.fullProducts = [];
  window.debugProducts = [];
  
  // Reload products from Supabase
  await loadProducts();
  
  console.log("✅ Products refreshed successfully");
  
  // Show success message briefly
  const successMsg = document.createElement("div");
  successMsg.className = "toast-notification success";
  successMsg.innerHTML = "✅ Products refreshed successfully";
  successMsg.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(successMsg);
  
  // Remove success message after 3 seconds
  setTimeout(() => {
    successMsg.remove();
  }, 3000);
};

window.setView = function (view, ev) {
  currentView = view;
  document.querySelectorAll(".view-btn").forEach((btn) => btn.classList.remove("active"));
  if (ev && ev.target && ev.target.classList) ev.target.classList.add("active");
  renderProducts();
};

// ===== Modal & Editing =====
window.openProductModal = function () {
  editingProduct = null;
  setText("modalTitle", "Add New Product");
  const form = document.getElementById("productForm");
  if (form) form.reset();
  
  // Clear features container
  const featuresContainer = document.getElementById("productFeaturesContainer");
  if (featuresContainer) featuresContainer.innerHTML = '';
  
  // Clear competitor links
  const competitorContainer = document.getElementById('competitorLinksContainer');
  if (competitorContainer) {
    competitorContainer.innerHTML = '';
    competitorLinks = [];
  }
  
  // Add one empty feature dropdown to start
  addFeatureDropdown();
  
  addClass("productModal", "show");
};

window.closeProductModal = function () {
  removeClass("productModal", "show");
  editingProduct = null;
};

// ===== Competitor Link Functions =====
let competitorLinks = [];

window.addCompetitorLink = function() {
  const container = document.getElementById('competitorLinksContainer');
  const linkId = Date.now();
  
  const linkDiv = document.createElement('div');
  linkDiv.className = 'competitor-link-item';
  linkDiv.style.cssText = 'margin-bottom: 10px; padding: 10px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;';
  linkDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: 150px 1fr auto; gap: 10px; align-items: center;">
      <select class="form-select" id="competitor-${linkId}" style="font-size: 13px;">
        <option value="">Select Competitor</option>
        <option value="vistaprint">Vistaprint</option>
        <option value="printful">Printful</option>
        <option value="gotprint">GotPrint</option>
        <option value="uprinting">UPrinting</option>
        <option value="psprint">PsPrint</option>
        <option value="custom">Custom</option>
      </select>
      <input type="url" class="form-input" id="url-${linkId}" 
             placeholder="https://competitor.com/product-page" 
             style="font-size: 13px;">
      <button type="button" onclick="removeCompetitorLink(${linkId})" 
              class="btn btn-secondary" style="padding: 6px 12px;">✕</button>
    </div>
    <div style="margin-top: 8px; display: none;" id="price-${linkId}">
      <span style="font-size: 12px; color: #666;">Last fetched price: </span>
      <span style="font-weight: 600;" id="price-value-${linkId}">--</span>
    </div>
  `;
  
  container.appendChild(linkDiv);
  competitorLinks.push({ id: linkId });
};

window.removeCompetitorLink = function(linkId) {
  const container = document.getElementById('competitorLinksContainer');
  const linkDiv = container.querySelector(`#competitor-${linkId}`).closest('.competitor-link-item');
  if (linkDiv) {
    linkDiv.remove();
    competitorLinks = competitorLinks.filter(link => link.id !== linkId);
  }
};

window.autoFetchCompetitorPrices = async function() {
  const productName = document.getElementById('productName').value;
  const productSKU = document.getElementById('productSku').value;
  
  if (!productName) {
    alert('Please enter a product name first');
    return;
  }
  
  // Show loading state
  const btn = event.target;
  const originalText = btn.innerHTML;
  btn.innerHTML = '⏳ Fetching prices...';
  btn.disabled = true;
  
  try {
    const response = await fetch('/api/competitor-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName, productSKU })
    });
    
    const data = await response.json();
    
    if (data.success && data.competitors) {
      // Clear existing links
      document.getElementById('competitorLinksContainer').innerHTML = '';
      competitorLinks = [];
      
      // Add links for found competitors
      data.competitors.forEach(comp => {
        if (!comp.error && comp.productUrl) {
          addCompetitorLink();
          const linkId = competitorLinks[competitorLinks.length - 1].id;
          
          // Set competitor and URL
          document.getElementById(`competitor-${linkId}`).value = comp.competitorId;
          document.getElementById(`url-${linkId}`).value = comp.productUrl;
          
          // Show price if found
          if (comp.price) {
            document.getElementById(`price-${linkId}`).style.display = 'block';
            document.getElementById(`price-value-${linkId}`).textContent = 
              `$${comp.price} (${(comp.confidence * 100).toFixed(0)}% match)`;
          }
        }
      });
      
      if (competitorLinks.length === 0) {
        alert('No competitor prices found. You can add links manually.');
      }
    }
  } catch (error) {
    console.error('Error fetching competitor prices:', error);
    alert('Error fetching competitor prices. Please try again.');
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};

window.editProduct = async function (productId) {
  const product = (products || []).find((p) => String(p.id) === String(productId));
  if (!product) return;
  
  console.log("Editing product:", product);
  console.log("Product category:", product.category);
  console.log("Product supplier:", product.supplier);
  console.log("Product option_types:", product.option_types);
  console.log("Categories available:", categories);
  console.log("Suppliers available:", suppliers);

  editingProduct = product;
  setText("modalTitle", "Edit Product");

  // Populate form
  setVal("productName", product.name || "");
  setVal("productSku", product.cp_sku || "");
  setVal("productDescription", product.description || "");
  setVal("productEcommerceDesc", product.ecommerce_description || "");
  setVal("productStatus", product.status || "Active");
  
  // Load image - check for base64 data first, then URL
  if (product.image_data) {
    // Product has uploaded image stored as base64
    uploadedImageData = product.image_data;
    selectImageMode('upload');
    showImagePreview(product.image_data);
    const nameDiv = document.getElementById('uploadedImageName');
    if (nameDiv) nameDiv.textContent = 'Previously uploaded image';
  } else {
    // Product has URL image
    const imageUrl = safeFirstImage(product);
    setVal("productImage", imageUrl);
    selectImageMode('url');
    if (imageUrl && !imageUrl.includes('data:image/svg')) {
      showImagePreview(imageUrl);
    }
  }
  
  // Populate features using the new dropdown system
  populateProductFeatures(product.feature_list, product.attributes);
  
  // Load base pricing
  setVal("basePrice", product.base_price || "");
  setVal("setupFee", product.setup_fee || "");
  
  // Load product specifications
  setVal("productWeight", product.weight || "");
  setVal("productDimensions", product.dimensions || "");
  setVal("productUOM", product.unit_of_measure || "EA");
  setVal("productMOQ", product.min_order_quantity || 1);
  setVal("productLeadTime", product.lead_time || "");
  
  // Load inventory & fulfillment
  setVal("stockQuantity", product.stock_quantity || 0);
  setVal("reorderPoint", product.reorder_point || 0);
  const trackInv = document.getElementById("trackInventory");
  if (trackInv) trackInv.checked = product.track_inventory || false;
  const allowBack = document.getElementById("allowBackorder");
  if (allowBack) allowBack.checked = product.allow_backorder || false;
  
  // Load tags and notes
  setVal("productTags", Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''));
  setVal("productionNotes", product.production_notes || "");
  setVal("internalNotes", product.internal_notes || "");
  
  // Load competitor links
  const competitorContainer = document.getElementById('competitorLinksContainer');
  if (competitorContainer) {
    competitorContainer.innerHTML = '';
    competitorLinks = [];
    if (product.competitor_links && Array.isArray(product.competitor_links)) {
      product.competitor_links.forEach(link => {
        addCompetitorLink();
        const linkId = competitorLinks[competitorLinks.length - 1].id;
        document.getElementById(`competitor-${linkId}`).value = link.competitor;
        document.getElementById(`url-${linkId}`).value = link.url;
      });
    }
  }
  
  // Load product options from option_types (new structure) - EDITABLE VERSION
  const optionsContainer = document.getElementById('productOptionsContainer');
  if (optionsContainer) {
    optionsContainer.innerHTML = '';
    
    if (product.option_types && Array.isArray(product.option_types) && product.option_types.length > 0) {
      // Display existing option types in EDITABLE format
      
      product.option_types.forEach((optionType, idx) => {
        const typeName = optionType.presentation || optionType.name || optionType.type_name || `Option ${idx + 1}`;
        const typeId = optionType.id || `type-${idx}`;
        
        const groupDiv = document.createElement('div');
        groupDiv.id = `option-group-${typeId}`;
        groupDiv.style.cssText = 'border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: #fff;';
        
        let groupHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="text" value="${safeAttr(typeName)}" 
                id="option-name-${typeId}"
                style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-weight: 600;"
                placeholder="Option Type Name">
              <select style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px;">
                <option value="dropdown">Dropdown</option>
                <option value="buttons">Buttons</option>
                <option value="swatches">Swatches</option>
              </select>
              <label style="display: flex; align-items: center; gap: 5px;">
                <input type="checkbox" checked>
                <span style="font-size: 13px;">Required</span>
              </label>
            </div>
            <button onclick="removeOptionType('${typeId}')" 
              style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
              Remove Group
            </button>
          </div>
          
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6; font-size: 12px;">Option Value</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 120px;">Price Adjustment</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 100px;">SKU Suffix</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 80px;">Default</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-size: 12px; width: 60px;">Action</th>
              </tr>
            </thead>
            <tbody id="option-values-${typeId}">
        `;
        
        // Add existing option values
        if (optionType.option_values && optionType.option_values.length > 0) {
          optionType.option_values.forEach((value, vIdx) => {
            const valueName = value.presentation || value.name || value.value_name || 'Unnamed';
            const valueId = value.id || `value-${vIdx}`;
            const skuSuffix = value.sku_suffix || `-${valueName.substring(0, 3).toUpperCase()}`;
            const priceAdjustment = value.price_adjustment || 0;
            
            groupHTML += `
              <tr id="value-row-${typeId}-${valueId}">
                <td style="padding: 6px; border: 1px solid #dee2e6;">
                  <input type="text" value="${safeAttr(valueName)}" 
                    id="value-name-${typeId}-${valueId}"
                    style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px;"
                    placeholder="Value name">
                </td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
                  <input type="number" value="${priceAdjustment}" 
                    id="value-price-${typeId}-${valueId}"
                    style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; text-align: center;"
                    step="0.01" placeholder="0.00">
                </td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
                  <input type="text" value="${safeAttr(skuSuffix)}" 
                    id="value-sku-${typeId}-${valueId}"
                    style="width: 100%; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; text-align: center;"
                    placeholder="-XXX">
                </td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
                  <input type="radio" name="default-${typeId}" ${vIdx === 0 ? 'checked' : ''}>
                </td>
                <td style="padding: 6px; border: 1px solid #dee2e6; text-align: center;">
                  <button onclick="removeOptionValue('${typeId}', '${valueId}')" 
                    style="background: transparent; border: none; color: #dc3545; cursor: pointer; font-size: 18px;">
                    ×
                  </button>
                </td>
              </tr>
            `;
          });
        }
        
        groupHTML += `
            </tbody>
          </table>
          
          <button onclick="addOptionValue('${typeId}')" 
            style="margin-top: 10px; background: #28a745; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
            + Add Value
          </button>
        `;
        
        groupDiv.innerHTML = groupHTML;
        optionsContainer.appendChild(groupDiv);
      });
      
      // Add button to add new option type
      const addButton = document.createElement('button');
      addButton.textContent = '+ Add Option Group';
      addButton.style.cssText = 'margin-top: 10px; background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer;';
      addButton.onclick = () => addNewOptionType();
      optionsContainer.appendChild(addButton);
      
      // Add summary
      const summary = document.createElement('p');
      summary.style.cssText = 'font-size: 11px; color: #666; margin-top: 10px;';
      summary.textContent = `Total variants: ${product.total_variants || 0}`;
      optionsContainer.appendChild(summary);
      
    } else {
      optionsContainer.innerHTML = `
        <p style="color: #888; font-size: 12px; margin-bottom: 10px;">No options configured for this product.</p>
        <button onclick="addNewOptionType()" 
          style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer;">
          + Add First Option Group
        </button>
      `;
    }
  }
  
  // Load old-style product options if they exist (backward compatibility)
  if (!product.option_types && product.product_options && Array.isArray(product.product_options)) {
    // Keep old code for backward compatibility
    product.product_options.forEach(optionGroup => {
      // Old implementation...
    });
  }
  
  // Load pricing configuration if it exists
  if (product.pricing_configuration) {
    pricingMatrixData = product.pricing_configuration;
  }

  // Category - handle both nested object and ID reference
  try {
    if (product.category && product.category.id) {
      // Category is already loaded as an object
      setVal("productCategory", product.category.id);
    } else if (product.category_id) {
      // Only have the ID reference
      setVal("productCategory", product.category_id);
    }
  } catch (e) {
    console.log("Error setting category:", e);
  }

  // Supplier - handle both nested object and ID reference
  try {
    if (product.supplier && product.supplier.id) {
      // Supplier is already loaded as an object
      setVal("productSupplier", product.supplier.id);
    } else if (product.supplier_id) {
      // Only have the ID reference
      setVal("productSupplier", product.supplier_id);
    }
  } catch (e) {
    console.log("Error setting supplier:", e);
  }

  // Volume pricing - populate pricing summary
  const pricingSummary = document.getElementById("pricingSummary");
  console.log("Pricing summary element:", pricingSummary);
  
  if (pricingSummary) {
    let pricingHTML = '';
    
    // Check if we have variants with pricing
    if (product.option_types && product.option_types.length > 0) {
      console.log("Found option_types, collecting prices...");
      let priceRanges = [];
      
      // Collect all prices from all variants
      product.option_types.forEach(type => {
        if (type.option_values) {
          type.option_values.forEach(value => {
            if (value.current_variants) {
              value.current_variants.forEach(variant => {
                if (variant.volume_prices && variant.volume_prices.length > 0) {
                  variant.volume_prices.forEach(price => {
                    const unitPrice = price.unit_price || price.price || 0;
                    if (unitPrice > 0) {
                      priceRanges.push(unitPrice);
                    }
                  });
                }
              });
            }
          });
        }
      });
      
      console.log("Collected price ranges:", priceRanges);
      
      if (priceRanges.length > 0) {
        const minPrice = Math.min(...priceRanges);
        const maxPrice = Math.max(...priceRanges);
        pricingHTML = `
          <div style="font-size: 13px; color: #333;">
            <strong>Price Range:</strong> $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)} per unit
          </div>
          <div style="font-size: 11px; color: #666; margin-top: 4px;">
            Based on ${product.total_variants || 0} variants with volume pricing
          </div>
        `;
      } else {
        console.log("No prices found in variants");
        pricingHTML = '<div style="font-size: 13px; color: #666;">No pricing configured</div>';
      }
    } else if (product.base_price) {
      pricingHTML = `
        <div style="font-size: 13px; color: #333;">
          <strong>Base Price:</strong> $${product.base_price}
        </div>
      `;
    } else {
      pricingHTML = '<div style="font-size: 13px; color: #666;">No pricing configured</div>';
    }
    
    const statusDiv = pricingSummary.querySelector('#pricingStatusText') || pricingSummary;
    if (statusDiv) {
      statusDiv.innerHTML = pricingHTML;
    }
  }
  
  // Old volume pricing table (keep for backward compatibility)
  const tbody = document.getElementById("volumePricing");
  if (tbody) {
    tbody.innerHTML = "";
    try {
      if (product.variants && product.variants[0] && product.variants[0].volume_prices) {
        product.variants[0].volume_prices.forEach((vp) => {
          addVolumeRow(vp.starting_qty, vp.unit_price || vp.final_cost, vp.setup_cost);
        });
      }
    } catch (e) { console.warn("volume_prices parse error", e); }
  }

  addClass("productModal", "show");
};

function setVal(id, val) { const el = document.getElementById(id); if (el) el.value = val == null ? "" : val; }
function getVal(id) { const el = document.getElementById(id); return el ? el.value : ""; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function addClass(id, cls) { const el = document.getElementById(id); if (el) el.classList.add(cls); }
function removeClass(id, cls) { const el = document.getElementById(id); if (el) el.classList.remove(cls); }

window.saveProduct = async function () {
  // Get features from dropdowns
  const features = getProductFeatures();
  
  // Convert features to feature_list format
  let featureList = '';
  Object.keys(features).forEach(featureName => {
    if (features[featureName].length > 0) {
      featureList += `(${featureName})\n`;
      features[featureName].forEach(value => {
        featureList += `${value}\n`;
      });
      featureList += '\n';
    }
  });
  
  // Collect product options/variants
  const productOptions = collectOptionGroups();
  
  // Get base pricing information from pricingMatrixData or defaults
  const basePrice = pricingMatrixData?.basePrice || 0;
  const setupFee = pricingMatrixData?.setupFee || 0;
  
  // Collect competitor links
  const collectedCompetitorLinks = [];
  document.querySelectorAll('.competitor-link-item').forEach(item => {
    const linkId = item.querySelector('select').id.replace('competitor-', '');
    const competitor = document.getElementById(`competitor-${linkId}`).value;
    const url = document.getElementById(`url-${linkId}`).value;
    if (competitor && url) {
      collectedCompetitorLinks.push({ competitor, url });
    }
  });
  
  const productData = {
    name: getVal("productName"),
    cp_sku: getVal("productSku"),
    description: getVal("productDescription"),
    ecommerce_description: getVal("productEcommerceDesc"),
    feature_list: featureList.trim(),
    status: getVal("productStatus"),
    category_id: getVal("productCategory") || null,
    supplier_id: getVal("productSupplier") || null,
    attributes: features, // Also save as attributes for easier access
    // Add new fields for options and pricing
    product_options: productOptions,
    base_price: basePrice,
    setup_fee: setupFee,
    pricing_configuration: pricingMatrixData,
    competitor_links: collectedCompetitorLinks, // Add competitor links
    // Product specifications
    weight: parseFloat(getVal("productWeight") || 0),
    dimensions: getVal("productDimensions"),
    unit_of_measure: getVal("productUOM") || "EA",
    min_order_quantity: parseInt(getVal("productMOQ") || 1),
    lead_time: parseInt(getVal("productLeadTime") || 0),
    // Inventory & fulfillment
    stock_quantity: parseInt(getVal("stockQuantity") || 0),
    reorder_point: parseInt(getVal("reorderPoint") || 0),
    track_inventory: document.getElementById("trackInventory")?.checked || false,
    allow_backorder: document.getElementById("allowBackorder")?.checked || false,
    // Tags and notes
    tags: getVal("productTags").split(',').map(t => t.trim()).filter(t => t),
    production_notes: getVal("productionNotes"),
    internal_notes: getVal("internalNotes")
  };

  const imageData = getProductImageData();
  if (imageData) {
    // Store as base64 if it's an uploaded image, otherwise as URL
    if (imageData.startsWith('data:')) {
      productData.image_data = imageData; // Base64 data
    } else {
      productData.images = [{ url: imageData }]; // URL
    }
  }

  try {
    if (supabase) {
      if (editingProduct && editingProduct.id) {
        const { error } = await supabase.from("products").update(productData).eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert([productData]).select();
        if (error) throw error;
        if (data && data[0] && data[0].id) {
          await saveVolumePricing(data[0].id);
        }
      }
      await loadProducts();
      closeProductModal();
      showSuccess("Product saved successfully");
    } else {
      if (editingProduct) {
        Object.assign(editingProduct, productData);
      } else {
        const newProduct = {
          ...productData,
          id: Date.now().toString(),
          category: (categories || []).find((c) => String(c.id) === String(productData.category_id)),
          supplier: (suppliers || []).find((s) => String(s.id) === String(productData.supplier_id))
        };
        products.unshift(newProduct);
      }
      renderProducts();
      updateStats();
      closeProductModal();
      showSuccess("Product saved (demo mode)");
    }
  } catch (error) {
    console.error("Error saving product:", error);
    showError(readableError(error));
  }
};

// Placeholder for saving volume pricing
async function saveVolumePricing(productId) {
  // implement if needed
}

// Volume pricing row helpers
window.addVolumeRow = function (qty = "", price = "", setup = "") {
  const tbody = document.getElementById("volumePricing");
  if (!tbody) return;
  const row = tbody.insertRow();
  row.innerHTML = `
    <td><input type="number" min="1" value="${safeAttr(qty)}" class="qty-input"></td>
    <td><input type="number" step="0.01" min="0" value="${safeAttr(price)}" placeholder="0.00" class="price-input"></td>
    <td><input type="number" step="0.01" min="0" value="${safeAttr(setup)}" placeholder="0.00" class="setup-input"></td>
    <td><button type="button" onclick="removeVolumeRow(this)" class="btn btn-secondary">Remove</button></td>
  `;
};

window.removeVolumeRow = function (button) {
  const tr = button && button.closest ? button.closest("tr") : null;
  if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
};

// Product Options Management (E-commerce style)
let optionGroupCounter = 0;

// Helper function to create option group HTML
function createOptionGroupHTML(groupId, groupName = '', groupType = 'select', isRequired = false) {
  return `
    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
      <select class="form-select option-group-name" style="flex: 1;" onchange="loadPredefinedOptions(this, '${groupId}')">
        <option value="">Select Option Type...</option>
        ${Object.keys(commonOptionGroups).map(g => 
          `<option value="${g}" ${g === groupName ? 'selected' : ''}>${g}</option>`
        ).join('')}
        <option value="custom">Custom Option</option>
      </select>
      <select class="form-select option-group-type" style="width: 120px;">
        <option value="select" ${groupType === 'select' ? 'selected' : ''}>Dropdown</option>
        <option value="radio" ${groupType === 'radio' ? 'selected' : ''}>Radio</option>
        <option value="checkbox" ${groupType === 'checkbox' ? 'selected' : ''}>Checkbox</option>
      </select>
      <label style="display: flex; align-items: center; gap: 5px;">
        <input type="checkbox" class="option-required" ${isRequired ? 'checked' : ''}>
        Required
      </label>
      <button type="button" onclick="removeOptionGroup('${groupId}')" class="btn btn-secondary">Remove Group</button>
    </div>
    <div class="option-values-container">
      <table style="width: 100%; font-size: 14px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Option Value</th>
            <th style="padding: 8px; width: 120px;">Price Adjustment</th>
            <th style="padding: 8px; width: 100px;">SKU Suffix</th>
            <th style="padding: 8px; width: 80px;">Default</th>
            <th style="padding: 8px; width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody class="option-values-list">
          <!-- Option values will be added here -->
        </tbody>
      </table>
      <button type="button" onclick="addOptionValue('${groupId}')" class="btn btn-secondary" style="margin-top: 8px; font-size: 12px;">+ Add Value</button>
    </div>
  `;
}

const commonOptionGroups = {
  'Size': {
    type: 'select',
    required: true,
    values: [
      { name: '100 ml (4 oz)', price: 0 },
      { name: '240 ml (8 oz)', price: 0.15 },
      { name: '360 ml (12 oz)', price: 0.25 },
      { name: '500 ml (16 oz)', price: 0.35 },
      { name: '650 ml (22 oz)', price: 0.45 }
    ]
  },
  'Wall Type': {
    type: 'radio',
    required: false,
    values: [
      { name: 'Single Wall', price: 0 },
      { name: 'Double Wall', price: 0.50 },
      { name: 'Triple Wall', price: 0.75 }
    ]
  },
  'Color': {
    type: 'select',
    required: false,
    values: [
      { name: '1 Color', price: 0 },
      { name: '2 Colors', price: 0.25 },
      { name: '3 Colors', price: 0.50 },
      { name: '4 Colors', price: 0.75 },
      { name: 'Full Color (CMYK)', price: 1.00 }
    ]
  },
  'Lid Type': {
    type: 'select',
    required: false,
    values: [
      { name: 'None', price: 0 },
      { name: 'Press & Close (PLA)', price: 0.15 },
      { name: 'Sip (PLA)', price: 0.20 },
      { name: 'Sip (Fiber Bagasse Pulp)', price: 0.25 },
      { name: 'Flat Lid', price: 0.10 },
      { name: 'Dome Lid', price: 0.15 }
    ]
  },
  'Lid Color': {
    type: 'select',
    required: false,
    values: [
      { name: 'N/A', price: 0 },
      { name: 'White', price: 0 },
      { name: 'Black', price: 0 },
      { name: 'Clear', price: 0 }
    ]
  },
  'Material': {
    type: 'select',
    required: false,
    values: [
      { name: 'Paper', price: 0 },
      { name: 'PLA Lined Paper', price: 0.10 },
      { name: 'PE Lined Paper', price: 0.08 },
      { name: 'Bamboo Fiber', price: 0.20 },
      { name: 'Bagasse', price: 0.15 }
    ]
  }
};

window.addProductOptionGroup = function(groupName = '', groupType = 'select', isRequired = false) {
  const container = document.getElementById('productOptionsContainer');
  if (!container) return;
  
  optionGroupCounter++;
  const groupId = `option-group-${optionGroupCounter}`;
  
  const groupDiv = document.createElement('div');
  groupDiv.id = groupId;
  groupDiv.style.cssText = 'border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; margin-bottom: 12px; background: white;';
  
  groupDiv.innerHTML = `
    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
      <select class="form-select option-group-name" style="flex: 1;" onchange="loadPredefinedOptions(this, '${groupId}')">
        <option value="">Select Option Type...</option>
        ${Object.keys(commonOptionGroups).map(g => 
          `<option value="${g}" ${g === groupName ? 'selected' : ''}>${g}</option>`
        ).join('')}
        <option value="custom">Custom Option</option>
      </select>
      <select class="form-select option-group-type" style="width: 120px;">
        <option value="select" ${groupType === 'select' ? 'selected' : ''}>Dropdown</option>
        <option value="radio" ${groupType === 'radio' ? 'selected' : ''}>Radio</option>
        <option value="checkbox" ${groupType === 'checkbox' ? 'selected' : ''}>Checkbox</option>
      </select>
      <label style="display: flex; align-items: center; gap: 5px;">
        <input type="checkbox" class="option-required" ${isRequired ? 'checked' : ''}>
        Required
      </label>
      <button type="button" onclick="removeOptionGroup('${groupId}')" class="btn btn-secondary">Remove Group</button>
    </div>
    <div class="option-values-container">
      <table style="width: 100%; font-size: 14px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Option Value</th>
            <th style="padding: 8px; width: 120px;">Price Adjustment</th>
            <th style="padding: 8px; width: 100px;">SKU Suffix</th>
            <th style="padding: 8px; width: 80px;">Default</th>
            <th style="padding: 8px; width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody class="option-values-list">
          <!-- Option values will be added here -->
        </tbody>
      </table>
      <button type="button" onclick="addOptionValue('${groupId}')" class="btn btn-secondary" style="margin-top: 8px; font-size: 12px;">+ Add Value</button>
    </div>
  `;
  
  container.appendChild(groupDiv);
  
  // If predefined group, load its values
  if (groupName && commonOptionGroups[groupName]) {
    loadPredefinedOptions(groupDiv.querySelector('.option-group-name'), groupId);
  } else {
    // Add one empty value row
    addOptionValue(groupId);
  }
};

window.loadPredefinedOptions = function(selectElement, groupId) {
  const groupName = selectElement.value;
  const groupDiv = document.getElementById(groupId);
  if (!groupDiv) return;
  
  const valuesList = groupDiv.querySelector('.option-values-list');
  if (!valuesList) return;
  
  // Clear existing values
  valuesList.innerHTML = '';
  
  if (groupName && commonOptionGroups[groupName]) {
    const group = commonOptionGroups[groupName];
    
    // Update type and required
    groupDiv.querySelector('.option-group-type').value = group.type;
    groupDiv.querySelector('.option-required').checked = group.required;
    
    // Add predefined values
    group.values.forEach((value, index) => {
      addOptionValue(groupId, value.name, value.price, '', index === 0);
    });
  } else {
    // Add one empty row for custom
    addOptionValue(groupId);
  }
};

window.addOptionValue = function(groupId, valueName = '', priceAdjustment = 0, skuSuffix = '', isDefault = false) {
  const groupDiv = document.getElementById(groupId);
  if (!groupDiv) return;
  
  const valuesList = groupDiv.querySelector('.option-values-list');
  if (!valuesList) return;
  
  const row = document.createElement('tr');
  row.innerHTML = `
    <td style="padding: 4px;">
      <input type="text" class="form-input option-value-name" style="width: 100%;" 
             placeholder="e.g., Small, Red, etc." value="${safeAttr(valueName)}">
    </td>
    <td style="padding: 4px;">
      <input type="number" class="form-input option-value-price" style="width: 100%;" 
             step="0.01" placeholder="0.00" value="${priceAdjustment}">
    </td>
    <td style="padding: 4px;">
      <input type="text" class="form-input option-value-sku" style="width: 100%;" 
             placeholder="-SM" value="${safeAttr(skuSuffix)}">
    </td>
    <td style="padding: 4px; text-align: center;">
      <input type="radio" name="default-${groupId}" class="option-value-default" ${isDefault ? 'checked' : ''}>
    </td>
    <td style="padding: 4px;">
      <button type="button" onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px;">×</button>
    </td>
  `;
  
  valuesList.appendChild(row);
};

// Helper function for loading saved option values (simplified version for edit mode)
function addOptionValueRow(groupId, valueName, priceAdjustment) {
  window.addOptionValue(groupId, valueName, priceAdjustment, '', false);
}

window.removeOptionGroup = function(groupId) {
  const groupDiv = document.getElementById(groupId);
  if (groupDiv) groupDiv.remove();
};

// Pricing Matrix Management
let pricingMatrixData = {};

window.openPricingMatrix = function() {
  const modal = document.getElementById('pricingMatrixModal');
  if (!modal) return;
  
  // Collect all option groups and their values
  const optionGroups = collectOptionGroups();
  const quantityTiers = getQuantityTiers();
  
  // Generate the pricing matrix
  generatePricingMatrix(optionGroups, quantityTiers);
  
  modal.classList.add('show');
};

window.closePricingMatrix = function() {
  const modal = document.getElementById('pricingMatrixModal');
  if (modal) modal.classList.remove('show');
};

window.collectOptionGroups = function() {
  const groups = [];
  const container = document.getElementById('productOptionsContainer');
  if (!container) return groups;
  
  container.querySelectorAll('[id^="option-group-"]').forEach(groupDiv => {
    const nameSelect = groupDiv.querySelector('.option-group-name');
    const typeSelect = groupDiv.querySelector('.option-group-type');
    const requiredCheck = groupDiv.querySelector('.option-required');
    
    if (nameSelect && nameSelect.value) {
      const values = [];
      groupDiv.querySelectorAll('.option-values-list tr').forEach(row => {
        const valueName = row.querySelector('.option-value-name');
        const valuePrice = row.querySelector('.option-value-price');
        if (valueName && valueName.value) {
          values.push({
            name: valueName.value,
            priceAdjustment: parseFloat(valuePrice?.value || 0)
          });
        }
      });
      
      if (values.length > 0) {
        groups.push({
          name: nameSelect.value,
          type: typeSelect?.value || 'select',
          required: requiredCheck?.checked || false,
          values: values
        });
      }
    }
  });
  
  return groups;
};

window.getQuantityTiers = function() {
  const minQty = document.getElementById('minQuantity')?.value || 1;
  const maxQty = document.getElementById('maxQuantity')?.value || 10000;
  
  // Create standard quantity tiers
  return [
    { min: 1, max: 99, label: '1-99' },
    { min: 100, max: 249, label: '100-249' },
    { min: 250, max: 499, label: '250-499' },
    { min: 500, max: 999, label: '500-999' },
    { min: 1000, max: 2499, label: '1000-2499' },
    { min: 2500, max: 4999, label: '2500-4999' },
    { min: 5000, max: null, label: '5000+' }
  ].filter(tier => tier.min <= maxQty);
};

window.generatePricingMatrix = function(optionGroups, quantityTiers) {
  const container = document.getElementById('pricingMatrixContainer');
  if (!container) return;
  
  if (optionGroups.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #666;">
        <h3>No Option Groups Defined</h3>
        <p>Please add option groups to the product first, then configure pricing.</p>
      </div>
    `;
    return;
  }
  
  // Generate all possible combinations
  const combinations = generateCombinations(optionGroups);
  
  // Create tabs for different pricing strategies
  let html = `
    <!-- Quantity Settings Section -->
    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <h4 style="margin: 0 0 15px 0; font-size: 14px; color: #333;">Quantity Settings</h4>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
            Min Quantity
          </label>
          <input type="number" id="minQuantity" class="form-input" value="1" min="1" placeholder="1">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
            Max Quantity
          </label>
          <input type="number" id="maxQuantity" class="form-input" value="10000" min="1" placeholder="10000">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
            Increment
          </label>
          <input type="number" id="quantityIncrement" class="form-input" value="1" min="1" placeholder="1">
        </div>
      </div>
    </div>
    
    <div style="margin-bottom: 20px;">
      <div style="display: flex; gap: 10px; margin-bottom: 15px;">
        <button class="btn btn-secondary pricing-tab active" onclick="showPricingTab('simple')">Simple Pricing</button>
        <button class="btn btn-secondary pricing-tab" onclick="showPricingTab('volume')">Volume Pricing</button>
        <button class="btn btn-secondary pricing-tab" onclick="showPricingTab('matrix')">Full Matrix</button>
      </div>
    </div>
    
    <!-- Simple Pricing Tab -->
    <div id="simplePricingTab" class="pricing-tab-content" style="display: block;">
      <p style="color: #666; margin-bottom: 15px;">Set a base price and let option price adjustments handle the variations</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div>
          <label style="font-size: 12px; font-weight: 600; color: #666;">Base Price</label>
          <input type="number" class="form-input" id="basePrice" step="0.01" placeholder="0.00">
        </div>
        <div>
          <label style="font-size: 12px; font-weight: 600; color: #666;">Setup Fee</label>
          <input type="number" class="form-input" id="setupFee" step="0.01" placeholder="0.00">
        </div>
      </div>
    </div>
    
    <!-- Volume Pricing Tab -->
    <div id="volumePricingTab" class="pricing-tab-content" style="display: none;">
      <p style="color: #666; margin-bottom: 15px;">Set different base prices for quantity tiers</p>
      <table style="width: 100%;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px;">Quantity</th>
            <th style="padding: 8px;">Base Price</th>
            <th style="padding: 8px;">Discount %</th>
            <th style="padding: 8px;">Setup Fee</th>
          </tr>
        </thead>
        <tbody>
          ${quantityTiers.map((tier, index) => `
            <tr>
              <td style="padding: 8px;">${tier.label}</td>
              <td style="padding: 8px;">
                <input type="number" class="form-input volume-price" data-tier="${index}" step="0.01" placeholder="0.00">
              </td>
              <td style="padding: 8px;">
                <input type="number" class="form-input volume-discount" data-tier="${index}" step="0.1" placeholder="0" max="100">
              </td>
              <td style="padding: 8px;">
                <input type="number" class="form-input volume-setup" data-tier="${index}" step="0.01" placeholder="0.00">
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- Full Matrix Tab -->
    <div id="matrixPricingTab" class="pricing-tab-content" style="display: none;">
      <p style="color: #666; margin-bottom: 15px;">Set specific prices for each combination and quantity tier</p>
      <div style="overflow-x: auto;">
        <table style="width: 100%; font-size: 13px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; position: sticky; left: 0; background: #f5f5f5; z-index: 10;">Options</th>
              ${quantityTiers.map(tier => `
                <th style="padding: 8px; text-align: center;">${tier.label}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${combinations.slice(0, 20).map((combo, comboIndex) => `
              <tr>
                <td style="padding: 8px; position: sticky; left: 0; background: white; border-right: 1px solid #ddd; z-index: 5;">
                  <div style="font-size: 12px;">
                    ${Object.entries(combo).map(([key, value]) => 
                      `<span style="display: inline-block; margin: 2px; padding: 2px 6px; background: #f0f0f0; border-radius: 3px;">${key}: ${value}</span>`
                    ).join('')}
                  </div>
                </td>
                ${quantityTiers.map((tier, tierIndex) => `
                  <td style="padding: 4px;">
                    <input type="number" 
                           class="form-input matrix-price" 
                           data-combo="${comboIndex}" 
                           data-tier="${tierIndex}"
                           step="0.01" 
                           placeholder="0.00"
                           style="width: 80px; font-size: 12px;">
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${combinations.length > 20 ? `
          <p style="color: #666; font-size: 12px; margin-top: 10px;">
            Showing first 20 combinations of ${combinations.length} total. 
            Consider using Simple or Volume pricing for products with many options.
          </p>
        ` : ''}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
};

window.generateCombinations = function(optionGroups) {
  if (optionGroups.length === 0) return [{}];
  
  const combinations = [];
  
  function generate(index, current) {
    if (index === optionGroups.length) {
      combinations.push({...current});
      return;
    }
    
    const group = optionGroups[index];
    for (const value of group.values) {
      current[group.name] = value.name;
      generate(index + 1, current);
    }
  }
  
  generate(0, {});
  return combinations;
};

window.showPricingTab = function(tab) {
  // Hide all tabs
  document.querySelectorAll('.pricing-tab-content').forEach(content => {
    content.style.display = 'none';
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.pricing-tab').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const tabContent = document.getElementById(`${tab}PricingTab`);
  if (tabContent) tabContent.style.display = 'block';
  
  // Add active class to clicked button
  event.target.classList.add('active');
};

window.savePricingMatrix = function() {
  // Collect pricing data based on active tab
  const activeTab = document.querySelector('.pricing-tab-content[style*="block"]');
  
  // Save quantity settings
  const minQty = document.getElementById('minQuantity')?.value || 1;
  const maxQty = document.getElementById('maxQuantity')?.value || 10000;
  const increment = document.getElementById('quantityIncrement')?.value || 1;
  
  if (activeTab) {
    if (activeTab.id === 'simplePricingTab') {
      // Save simple pricing
      const basePrice = document.getElementById('basePrice')?.value;
      const setupFee = document.getElementById('setupFee')?.value;
      
      pricingMatrixData = {
        type: 'simple',
        basePrice: parseFloat(basePrice || 0),
        setupFee: parseFloat(setupFee || 0),
        minQuantity: parseInt(minQty),
        maxQuantity: parseInt(maxQty),
        quantityIncrement: parseInt(increment)
      };
      
      // Update pricing summary
      updatePricingSummary(`Simple Pricing: $${basePrice || 0} base${setupFee > 0 ? ` + $${setupFee} setup` : ''}`);
      
    } else if (activeTab.id === 'volumePricingTab') {
      // Save volume pricing
      const volumePrices = [];
      document.querySelectorAll('.volume-price').forEach(input => {
        const tier = input.dataset.tier;
        volumePrices[tier] = {
          price: parseFloat(input.value || 0),
          discount: parseFloat(document.querySelector(`.volume-discount[data-tier="${tier}"]`)?.value || 0),
          setup: parseFloat(document.querySelector(`.volume-setup[data-tier="${tier}"]`)?.value || 0)
        };
      });
      
      pricingMatrixData = {
        type: 'volume',
        tiers: volumePrices,
        minQuantity: parseInt(minQty),
        maxQuantity: parseInt(maxQty),
        quantityIncrement: parseInt(increment)
      };
      
      // Update pricing summary
      const tierCount = volumePrices.filter(t => t && t.price > 0).length;
      updatePricingSummary(`Volume Pricing: ${tierCount} tiers configured`);
      
    } else if (activeTab.id === 'matrixPricingTab') {
      // Save full matrix
      const matrix = {};
      document.querySelectorAll('.matrix-price').forEach(input => {
        const combo = input.dataset.combo;
        const tier = input.dataset.tier;
        
        if (!matrix[combo]) matrix[combo] = {};
        matrix[combo][tier] = parseFloat(input.value || 0);
      });
      
      pricingMatrixData = {
        type: 'matrix',
        prices: matrix,
        minQuantity: parseInt(minQty),
        maxQuantity: parseInt(maxQty),
        quantityIncrement: parseInt(increment)
      };
      
      // Update pricing summary
      const comboCount = Object.keys(matrix).length;
      updatePricingSummary(`Full Matrix: ${comboCount} combinations configured`);
    }
  }
  
  console.log('Saved pricing data:', pricingMatrixData);
  closePricingMatrix();
  showSuccess('Pricing configuration saved');
};

function updatePricingSummary(text) {
  const summaryText = document.getElementById('pricingStatusText');
  if (summaryText) {
    summaryText.textContent = text;
    summaryText.style.color = '#28a745';
    summaryText.style.fontWeight = '600';
  }
}

// Quantity Settings Management
window.initializeQuantitySettings = function() {
  const container = document.getElementById('quantitySettingsContainer');
  if (!container) return;
  
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
          Min Quantity
        </label>
        <input type="number" id="minQuantity" class="form-input" value="1" min="1" placeholder="1">
      </div>
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
          Max Quantity
        </label>
        <input type="number" id="maxQuantity" class="form-input" value="10000" min="1" placeholder="10000">
      </div>
      <div>
        <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 5px;">
          Increment
        </label>
        <input type="number" id="quantityIncrement" class="form-input" value="1" min="1" placeholder="1">
      </div>
    </div>
    
    <div style="margin-top: 20px;">
      <label style="display: block; font-size: 12px; font-weight: 600; color: #666; margin-bottom: 10px;">
        Volume Pricing Tiers (Optional)
      </label>
      <table style="width: 100%; font-size: 14px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Quantity Range</th>
            <th style="padding: 8px;">Unit Price</th>
            <th style="padding: 8px;">Discount %</th>
            <th style="padding: 8px;">Setup Fee</th>
            <th style="padding: 8px; width: 60px;">Action</th>
          </tr>
        </thead>
        <tbody id="volumePricingList">
          <tr>
            <td style="padding: 4px;">
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="1" min="1" placeholder="From">
              <span style="margin: 0 5px;">-</span>
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="99" min="1" placeholder="To">
            </td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.1" placeholder="0" max="100"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><button onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px;">×</button></td>
          </tr>
          <tr>
            <td style="padding: 4px;">
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="100" min="1" placeholder="From">
              <span style="margin: 0 5px;">-</span>
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="499" min="1" placeholder="To">
            </td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.1" placeholder="5" max="100"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><button onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px;">×</button></td>
          </tr>
          <tr>
            <td style="padding: 4px;">
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="500" min="1" placeholder="From">
              <span style="margin: 0 5px;">-</span>
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="999" min="1" placeholder="To">
            </td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.1" placeholder="10" max="100"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><button onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px;">×</button></td>
          </tr>
          <tr>
            <td style="padding: 4px;">
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" value="1000" min="1" placeholder="From">
              <span style="margin: 0 5px;">+</span>
              <input type="number" class="form-input" style="width: 45%; display: inline-block;" placeholder="∞" disabled>
            </td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.1" placeholder="15" max="100"></td>
            <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
            <td style="padding: 4px;"><button onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px;">×</button></td>
          </tr>
        </tbody>
      </table>
      <button type="button" onclick="addVolumePricingTier()" class="btn btn-secondary" style="margin-top: 8px;">+ Add Pricing Tier</button>
    </div>
  `;
};

window.addVolumePricingTier = function() {
  const tbody = document.getElementById('volumePricingList');
  if (!tbody) return;
  
  const row = document.createElement('tr');
  row.innerHTML = `
    <td style="padding: 4px;">
      <input type="number" class="form-input" style="width: 45%; display: inline-block;" min="1" placeholder="From">
      <span style="margin: 0 5px;">-</span>
      <input type="number" class="form-input" style="width: 45%; display: inline-block;" min="1" placeholder="To">
    </td>
    <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
    <td style="padding: 4px;"><input type="number" class="form-input" step="0.1" placeholder="0" max="100"></td>
    <td style="padding: 4px;"><input type="number" class="form-input" step="0.01" placeholder="0.00"></td>
    <td style="padding: 4px;"><button onclick="this.closest('tr').remove()" class="btn btn-secondary" style="padding: 2px 8px;">×</button></td>
  `;
  tbody.appendChild(row);
};

// Initialize modal when opens
const originalOpenModal = window.openProductModal;
window.openProductModal = function() {
  originalOpenModal();
  
  // Clear options container - start empty for new products
  const optionsContainer = document.getElementById('productOptionsContainer');
  if (optionsContainer) optionsContainer.innerHTML = '';
  
  // Reset pricing summary
  const summaryText = document.getElementById('pricingStatusText');
  if (summaryText) {
    summaryText.textContent = 'No pricing configured';
    summaryText.style.color = '#666';
    summaryText.style.fontWeight = 'normal';
  }
  
  // Reset pricing matrix data
  pricingMatrixData = {};
  
  // Reset image state
  clearImage();
  selectImageMode('url');
  uploadedImageData = null;
  
  // Don't add any option groups by default - let user add what they need
};

// Product Features Dropdown Management (keeping for backward compatibility)
const commonFeatures = {
  'Size': [
    '7.5" x 7.5"', '9" x 9"', '9" x 12"', '12" x 12"', '12" x 14"', 
    '12" x 16"', '14" x 14"', '15" x 15"', '16" x 16"', '18" x 18"',
    '8 oz', '10 oz', '12 oz', '16 oz', '20 oz', '24 oz',
    'Small', 'Medium', 'Large', 'X-Large', 'XX-Large'
  ],
  'Color': [
    'White', 'Black', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple',
    'Natural Kraft', 'White Kraft', 'Brown Kraft', 'Custom Color', 'Pantone Match'
  ],
  'Material': [
    'Paper', 'Plastic', 'Cardboard', 'Corrugated', 'Kraft', 'Recycled',
    'Food Safe Paper', 'Greaseproof Paper', 'PLA', 'PET', 'PP', 'PS'
  ],
  'Type': [
    'Single Wall', 'Double Wall', 'Triple Wall', 'Ripple Wall',
    'Standard', 'Premium', 'Eco-Friendly', 'Biodegradable', 'Compostable'
  ],
  'Printing': [
    '1 Color', '2 Colors', '3 Colors', '4 Colors', 'Full Color (CMYK)',
    'Spot Color', 'Digital Print', 'Offset Print', 'Screen Print'
  ],
  'Finish': [
    'Matte', 'Gloss', 'Uncoated', 'UV Coating', 'Aqueous Coating',
    'Soft Touch', 'Embossed', 'Debossed', 'Foil Stamping'
  ],
  'Quantity': [
    '100', '250', '500', '1000', '2500', '5000', '10000', 'Custom Quantity'
  ],
  'Lid Type': [
    'Flat Lid', 'Dome Lid', 'Sip Lid', 'Straw Slot Lid', 'No Lid'
  ]
};

window.addFeatureDropdown = function(featureName = '', featureValue = '') {
  const container = document.getElementById('productFeaturesContainer');
  if (!container) return;
  
  const featureDiv = document.createElement('div');
  featureDiv.style.cssText = 'display: grid; grid-template-columns: 200px 1fr auto; gap: 10px; margin-bottom: 10px; align-items: center;';
  
  // Create unique IDs
  const uniqueId = Date.now() + Math.random().toString(36).substr(2, 9);
  
  featureDiv.innerHTML = `
    <select class="form-select feature-name" onchange="updateFeatureValues(this)">
      <option value="">Select Feature...</option>
      ${Object.keys(commonFeatures).map(f => 
        `<option value="${f}" ${f === featureName ? 'selected' : ''}>${f}</option>`
      ).join('')}
      <option value="custom">Custom Feature</option>
    </select>
    <div class="feature-value-container">
      ${featureName === 'custom' || !commonFeatures[featureName] ? 
        `<input type="text" class="form-input feature-value" placeholder="Enter value" value="${safeAttr(featureValue)}">` :
        `<select class="form-select feature-value">
          <option value="">Select Value...</option>
          ${commonFeatures[featureName].map(v => 
            `<option value="${v}" ${v === featureValue ? 'selected' : ''}>${v}</option>`
          ).join('')}
          <option value="custom">Custom Value</option>
        </select>`
      }
    </div>
    <button type="button" onclick="removeFeature(this)" class="btn btn-secondary">Remove</button>
  `;
  
  container.appendChild(featureDiv);
  
  // If we have a feature name, update the values dropdown
  if (featureName && featureName !== 'custom') {
    const nameSelect = featureDiv.querySelector('.feature-name');
    if (nameSelect) updateFeatureValues(nameSelect, featureValue);
  }
};

window.updateFeatureValues = function(selectElement, presetValue = '') {
  const featureDiv = selectElement.closest('div');
  const valueContainer = featureDiv.querySelector('.feature-value-container');
  const selectedFeature = selectElement.value;
  
  if (selectedFeature === 'custom' || !commonFeatures[selectedFeature]) {
    // Show text input for custom feature
    valueContainer.innerHTML = `
      <input type="text" class="form-input feature-value" placeholder="Enter value" value="${safeAttr(presetValue)}">
    `;
  } else {
    // Show dropdown with predefined values
    valueContainer.innerHTML = `
      <select class="form-select feature-value" onchange="checkCustomValue(this)">
        <option value="">Select Value...</option>
        ${commonFeatures[selectedFeature].map(v => 
          `<option value="${v}" ${v === presetValue ? 'selected' : ''}>${v}</option>`
        ).join('')}
        <option value="custom">Custom Value</option>
      </select>
    `;
  }
};

window.checkCustomValue = function(selectElement) {
  if (selectElement.value === 'custom') {
    const currentValue = selectElement.value;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input feature-value';
    input.placeholder = 'Enter custom value';
    input.value = '';
    selectElement.parentNode.replaceChild(input, selectElement);
    input.focus();
  }
};

window.removeFeature = function(button) {
  const featureDiv = button.closest('div');
  if (featureDiv) featureDiv.remove();
};

// Function to get all features from the form
window.getProductFeatures = function() {
  const features = {};
  const container = document.getElementById('productFeaturesContainer');
  if (!container) return features;
  
  const featureDivs = container.querySelectorAll('div');
  featureDivs.forEach(div => {
    const nameElement = div.querySelector('.feature-name');
    const valueElement = div.querySelector('.feature-value');
    
    if (nameElement && valueElement) {
      const name = nameElement.value;
      const value = valueElement.value;
      if (name && value) {
        if (!features[name]) {
          features[name] = [];
        }
        features[name].push(value);
      }
    }
  });
  
  return features;
};

// Function to populate features when editing
window.populateProductFeatures = function(featureList, attributes) {
  const container = document.getElementById('productFeaturesContainer');
  if (!container) return;
  
  // Clear existing features
  container.innerHTML = '';
  
  // Parse feature_list format
  if (featureList) {
    const matches = featureList.match(/\(([^)]+)\)/g);
    if (matches) {
      matches.forEach(match => {
        const featureName = match.replace(/[()]/g, '');
        const regex = new RegExp(`\\(${featureName}\\)([^(]*?)(?=\\(|$)`, 's');
        const valueMatch = featureList.match(regex);
        if (valueMatch) {
          const values = valueMatch[1].trim().split('\n').filter(v => v.trim());
          values.forEach(value => {
            addFeatureDropdown(featureName, value.trim());
          });
        }
      });
    }
  }
  
  // Add attributes as features
  if (attributes) {
    Object.keys(attributes).forEach(key => {
      if (attributes[key] && key !== 'Templates' && typeof attributes[key] === 'string') {
        addFeatureDropdown(key, attributes[key]);
      }
    });
  }
};

// ===== UX Helpers =====
function showSuccess(message) { try { alert(message); } catch {} }
function showError(message) { 
  try { 
    // Create a more detailed error modal
    const errorModal = document.createElement('div');
    errorModal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      z-index: 10001;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
    `;
    
    errorModal.innerHTML = `
      <h3 style="color: #dc3545; margin-bottom: 16px;">⚠️ Database Connection Error</h3>
      <pre style="background: #f8f9fa; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-wrap: break-word; font-size: 14px;">${safeText(message)}</pre>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 16px;
        padding: 10px 20px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      ">Close</button>
    `;
    
    document.body.appendChild(errorModal);
  } catch { 
    alert("Error: " + message); 
  } 
}
function readableError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

// ===== Safe text/attr helpers to prevent DOM breakage =====
function safeText(v){ if (v==null) return ""; return String(v); }
function safeAttr(v){ if (v==null) return ""; return String(v).replaceAll('"',"&quot;").replaceAll("<","&lt;"); }
function safeFirstImage(product) {
  try {
    // Check for uploaded base64 image data first
    if (product.image_data) {
      return product.image_data;
    }
    
    // Check for Supabase/ShurePrint artboard image
    if (product.shureprint_artboard_image && typeof product.shureprint_artboard_image === 'string' && product.shureprint_artboard_image.trim()) {
      // Skip if it's an Airtable URL
      if (!product.shureprint_artboard_image.includes('airtable')) {
        return product.shureprint_artboard_image;
      }
    }
    
    // Check for single image_url field (normalized in loadProducts)
    if (product.image_url && typeof product.image_url === 'string' && product.image_url.trim()) {
      // Skip if it's an Airtable URL
      if (!product.image_url.includes('airtable')) {
        return product.image_url;
      }
    }
    
    // Check for image field (singular)
    if (product.image && typeof product.image === 'string' && product.image.trim()) {
      // Skip if it's an Airtable URL
      if (!product.image.includes('airtable')) {
        return product.image;
      }
    }
    
    // Check if images is an array of URLs (strings) - but skip Airtable URLs
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      for (let img of product.images) {
        if (typeof img === 'string' && img.trim() && !img.includes('airtable')) {
          return img;
        }
        // If images array contains objects with url property
        if (img && img.url && !img.url.includes('airtable')) {
          return img.url;
        }
      }
    }
    
    // Check variants for images
    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
      for (let variant of product.variants) {
        if (variant.image_url && typeof variant.image_url === 'string' && variant.image_url.trim()) {
          return variant.image_url;
        }
      }
    }
    
    // Check attributes for image URLs
    if (product.attributes && product.attributes.Templates && Array.isArray(product.attributes.Templates)) {
      if (product.attributes.Templates[0] && product.attributes.Templates[0].url) {
        return product.attributes.Templates[0].url;
      }
    }
  } catch (e) {
    console.warn('Error getting image for product:', e);
  }
  // Return null if no image found
  return null;
}

// Image Upload Management
let uploadedImageData = null;
let currentImageMode = 'url';

window.selectImageMode = function(mode) {
  currentImageMode = mode;
  
  // Update button styles
  const urlBtn = document.getElementById('urlModeBtn');
  const uploadBtn = document.getElementById('uploadModeBtn');
  const urlMode = document.getElementById('imageUrlMode');
  const uploadMode = document.getElementById('imageUploadMode');
  
  if (mode === 'url') {
    urlBtn?.classList.add('btn-primary');
    urlBtn?.classList.remove('btn-secondary');
    uploadBtn?.classList.remove('btn-primary');
    uploadBtn?.classList.add('btn-secondary');
    if (urlMode) urlMode.style.display = 'block';
    if (uploadMode) uploadMode.style.display = 'none';
  } else {
    uploadBtn?.classList.add('btn-primary');
    uploadBtn?.classList.remove('btn-secondary');
    urlBtn?.classList.remove('btn-primary');
    urlBtn?.classList.add('btn-secondary');
    if (urlMode) urlMode.style.display = 'none';
    if (uploadMode) uploadMode.style.display = 'block';
  }
};

window.handleImageUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    showError('Please select a valid image file');
    return;
  }
  
  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    showError('Image file size must be less than 5MB');
    return;
  }
  
  // Show file name
  const nameDiv = document.getElementById('uploadedImageName');
  if (nameDiv) {
    nameDiv.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
  }
  
  // Read and preview the image
  const reader = new FileReader();
  reader.onload = function(e) {
    uploadedImageData = e.target.result;
    showImagePreview(uploadedImageData);
  };
  reader.readAsDataURL(file);
};

function showImagePreview(imageSrc) {
  const previewDiv = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  
  if (previewDiv && previewImg) {
    previewImg.src = imageSrc;
    previewDiv.style.display = 'block';
  }
}

window.clearImage = function() {
  // Clear uploaded image
  uploadedImageData = null;
  const fileInput = document.getElementById('productImageFile');
  if (fileInput) fileInput.value = '';
  
  // Clear URL input
  const urlInput = document.getElementById('productImage');
  if (urlInput) urlInput.value = '';
  
  // Hide preview
  const previewDiv = document.getElementById('imagePreview');
  if (previewDiv) previewDiv.style.display = 'none';
  
  // Clear file name display
  const nameDiv = document.getElementById('uploadedImageName');
  if (nameDiv) nameDiv.textContent = '';
};

window.previewUrlImage = function() {
  const urlInput = document.getElementById('productImage');
  if (!urlInput) return;
  
  const url = urlInput.value.trim();
  if (url) {
    // Validate URL format
    try {
      new URL(url);
      // Show preview for valid URL
      showImagePreview(url);
    } catch (e) {
      // Invalid URL, hide preview
      const previewDiv = document.getElementById('imagePreview');
      if (previewDiv) previewDiv.style.display = 'none';
    }
  } else {
    // Empty URL, hide preview
    const previewDiv = document.getElementById('imagePreview');
    if (previewDiv) previewDiv.style.display = 'none';
  }
};

// Modified to handle both URL and uploaded images
function getProductImageData() {
  if (currentImageMode === 'upload' && uploadedImageData) {
    return uploadedImageData;
  } else {
    return getVal("productImage");
  }
}

// Close modal on Esc
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("productModal");
    if (modal && modal.classList.contains("show")) closeProductModal();
  }
});

// Close modal on outside click
const modalEl = document.getElementById("productModal");
if (modalEl) {
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeProductModal();
  });
}

// Excel Import Management
let excelData = null;
let columnMapping = {};
let currentImportStep = 1;

window.openImportModal = function() {
  const modal = document.getElementById('importModal');
  if (modal) {
    modal.classList.add('show');
    resetImportModal();
  }
};

window.closeImportModal = function() {
  const modal = document.getElementById('importModal');
  if (modal) {
    modal.classList.remove('show');
    resetImportModal();
  }
};

function resetImportModal() {
  currentImportStep = 1;
  excelData = null;
  columnMapping = {};
  
  // Reset UI
  document.getElementById('importStep1').style.display = 'block';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importNextBtn').style.display = 'none';
  document.getElementById('importBtn').style.display = 'none';
  document.getElementById('uploadedFileName').textContent = '';
  document.getElementById('excelFile').value = '';
}

window.handleExcelUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const fileName = file.name;
  const fileExt = fileName.split('.').pop().toLowerCase();
  
  if (!['xlsx', 'xls', 'csv'].includes(fileExt)) {
    showError('Please upload a valid Excel (.xlsx, .xls) or CSV file');
    return;
  }
  
  document.getElementById('uploadedFileName').textContent = `Selected: ${fileName}`;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Get the first sheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON
      excelData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (excelData.length < 2) {
        showError('Excel file must contain headers and at least one row of data');
        return;
      }
      
      // Show next button
      document.getElementById('importNextBtn').style.display = 'inline-block';
      
    } catch (error) {
      showError('Error reading Excel file: ' + error.message);
      console.error('Excel parse error:', error);
    }
  };
  
  reader.readAsArrayBuffer(file);
};

window.importNext = function() {
  if (currentImportStep === 1 && excelData) {
    // Move to mapping step
    currentImportStep = 2;
    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importStep2').style.display = 'block';
    document.getElementById('importBackBtn').style.display = 'inline-block';
    document.getElementById('importNextBtn').style.display = 'none';
    document.getElementById('importBtn').style.display = 'inline-block';
    
    generateColumnMapping();
  }
};

window.importBack = function() {
  if (currentImportStep === 2) {
    currentImportStep = 1;
    document.getElementById('importStep1').style.display = 'block';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importBackBtn').style.display = 'none';
    document.getElementById('importNextBtn').style.display = 'inline-block';
    document.getElementById('importBtn').style.display = 'none';
  }
};

function generateColumnMapping() {
  const headers = excelData[0];
  const container = document.getElementById('columnMappingContainer');
  
  const productFields = [
    { value: 'name', label: 'Product Name *', required: true },
    { value: 'cp_sku', label: 'SKU' },
    { value: 'description', label: 'Description' },
    { value: 'category', label: 'Category' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'base_price', label: 'Base Price' },
    { value: 'setup_fee', label: 'Setup Fee' },
    { value: 'min_order_quantity', label: 'Min Order Quantity' },
    { value: 'stock_quantity', label: 'Stock Quantity' },
    { value: 'lead_time', label: 'Lead Time (days)' },
    { value: 'weight', label: 'Weight' },
    { value: 'dimensions', label: 'Dimensions' },
    { value: 'image_url', label: 'Image URL' },
    { value: 'status', label: 'Status' },
    { value: 'tags', label: 'Tags' },
    { value: 'production_notes', label: 'Production Notes' },
    { value: 'internal_notes', label: 'Internal Notes' }
  ];
  
  let html = '<table style="width: 100%;">';
  html += '<thead><tr>';
  html += '<th style="padding: 10px; text-align: left;">Excel Column</th>';
  html += '<th style="padding: 10px; text-align: left;">Maps To</th>';
  html += '<th style="padding: 10px; text-align: left;">Sample Data</th>';
  html += '</tr></thead><tbody>';
  
  headers.forEach((header, index) => {
    const sampleData = excelData[1] ? excelData[1][index] : '';
    const guessedField = guessFieldMapping(header);
    
    html += '<tr>';
    html += `<td style="padding: 8px;"><strong>${header}</strong></td>`;
    html += '<td style="padding: 8px;">';
    html += `<select class="form-select column-mapping" data-column="${index}" style="width: 200px;">`;
    html += '<option value="">-- Skip --</option>';
    
    productFields.forEach(field => {
      const selected = field.value === guessedField ? 'selected' : '';
      const required = field.required ? ' *' : '';
      html += `<option value="${field.value}" ${selected}>${field.label}${required}</option>`;
    });
    
    html += '</select></td>';
    html += `<td style="padding: 8px; color: #666; font-size: 13px;">${sampleData || 'N/A'}</td>`;
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
  
  // Update preview count
  const dataRows = excelData.length - 1;
  document.getElementById('previewCount').textContent = dataRows;
  
  // Add change listeners
  document.querySelectorAll('.column-mapping').forEach(select => {
    select.addEventListener('change', updateColumnMapping);
  });
}

function guessFieldMapping(header) {
  const headerLower = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const mappings = {
    'productname': 'name',
    'name': 'name',
    'product': 'name',
    'sku': 'cp_sku',
    'code': 'cp_sku',
    'description': 'description',
    'desc': 'description',
    'category': 'category',
    'supplier': 'supplier',
    'vendor': 'supplier',
    'price': 'base_price',
    'baseprice': 'base_price',
    'unitprice': 'base_price',
    'setupfee': 'setup_fee',
    'setup': 'setup_fee',
    'moq': 'min_order_quantity',
    'minqty': 'min_order_quantity',
    'minorderquantity': 'min_order_quantity',
    'stock': 'stock_quantity',
    'stockqty': 'stock_quantity',
    'quantity': 'stock_quantity',
    'leadtime': 'lead_time',
    'lead': 'lead_time',
    'weight': 'weight',
    'dimensions': 'dimensions',
    'size': 'dimensions',
    'image': 'image_url',
    'imageurl': 'image_url',
    'photo': 'image_url',
    'status': 'status',
    'tags': 'tags',
    'keywords': 'tags'
  };
  
  return mappings[headerLower] || null;
}

function updateColumnMapping() {
  columnMapping = {};
  document.querySelectorAll('.column-mapping').forEach(select => {
    const column = parseInt(select.dataset.column);
    const field = select.value;
    if (field) {
      columnMapping[field] = column;
    }
  });
}

window.startImport = function() {
  // Validate required fields
  updateColumnMapping();
  
  if (!columnMapping.name && columnMapping.name !== 0) {
    showError('Product Name is required. Please map a column to Product Name.');
    return;
  }
  
  // Move to import step
  currentImportStep = 3;
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'block';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importBtn').style.display = 'none';
  
  // Start import process
  importProducts();
};

async function importProducts() {
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const totalRows = excelData.length - 1;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  
  for (let i = 1; i < excelData.length; i++) {
    const row = excelData[i];
    const progress = Math.round((i / totalRows) * 100);
    
    progressBar.style.width = progress + '%';
    progressText.textContent = `Importing product ${i} of ${totalRows}...`;
    
    try {
      const productData = mapRowToProduct(row);
      
      if (supabase) {
        const { error } = await supabase.from('products').insert([productData]);
        if (error) throw error;
      } else {
        // Demo mode - just add to local array
        products.unshift({
          ...productData,
          id: Date.now().toString() + '_' + i
        });
      }
      
      successCount++;
    } catch (error) {
      errorCount++;
      errors.push(`Row ${i + 1}: ${error.message}`);
    }
  }
  
  // Show results
  document.getElementById('importProgress').style.display = 'none';
  document.getElementById('importResults').style.display = 'block';
  document.getElementById('successCount').textContent = successCount;
  document.getElementById('errorCount').textContent = errorCount;
  
  if (errors.length > 0) {
    const errorDetails = document.getElementById('errorDetails');
    errorDetails.innerHTML = '<h5>Errors:</h5>' + errors.map(e => `<div style="color: #dc3545; font-size: 13px;">• ${e}</div>`).join('');
  }
  
  // Refresh products list
  if (successCount > 0) {
    await loadProducts();
    setTimeout(() => {
      closeImportModal();
      showSuccess(`Successfully imported ${successCount} products`);
    }, 2000);
  }
}

function mapRowToProduct(row) {
  const product = {
    name: getExcelValue(row, columnMapping.name) || 'Untitled Product',
    cp_sku: getExcelValue(row, columnMapping.cp_sku) || '',
    description: getExcelValue(row, columnMapping.description) || '',
    status: getExcelValue(row, columnMapping.status) || 'Active',
    base_price: parseFloat(getExcelValue(row, columnMapping.base_price)) || 0,
    setup_fee: parseFloat(getExcelValue(row, columnMapping.setup_fee)) || 0,
    min_order_quantity: parseInt(getExcelValue(row, columnMapping.min_order_quantity)) || 1,
    stock_quantity: parseInt(getExcelValue(row, columnMapping.stock_quantity)) || 0,
    lead_time: parseInt(getExcelValue(row, columnMapping.lead_time)) || 0,
    weight: parseFloat(getExcelValue(row, columnMapping.weight)) || 0,
    dimensions: getExcelValue(row, columnMapping.dimensions) || '',
    production_notes: getExcelValue(row, columnMapping.production_notes) || '',
    internal_notes: getExcelValue(row, columnMapping.internal_notes) || ''
  };
  
  // Handle image URL
  const imageUrl = getExcelValue(row, columnMapping.image_url);
  if (imageUrl) {
    product.images = [{ url: imageUrl }];
  }
  
  // Handle tags
  const tags = getExcelValue(row, columnMapping.tags);
  if (tags) {
    product.tags = tags.split(',').map(t => t.trim()).filter(t => t);
  }
  
  // Handle category (would need to look up category ID)
  const categoryName = getExcelValue(row, columnMapping.category);
  if (categoryName && categories) {
    const category = categories.find(c => 
      c.name.toLowerCase() === categoryName.toLowerCase()
    );
    if (category) {
      product.category_id = category.id;
    }
  }
  
  // Handle supplier (would need to look up supplier ID)
  const supplierName = getExcelValue(row, columnMapping.supplier);
  if (supplierName && suppliers) {
    const supplier = suppliers.find(s => 
      s.name.toLowerCase() === supplierName.toLowerCase()
    );
    if (supplier) {
      product.supplier_id = supplier.id;
    }
  }
  
  return product;
}

function getExcelValue(row, columnIndex) {
  if (columnIndex === undefined || columnIndex === null) return null;
  return row[columnIndex] || null;
}

window.downloadTemplate = function() {
  // Create sample data
  const templateData = [
    ['Product Name', 'SKU', 'Description', 'Category', 'Base Price', 'Setup Fee', 'Min Order Quantity', 'Stock Quantity', 'Lead Time', 'Weight', 'Dimensions', 'Image URL', 'Status', 'Tags'],
    ['Sample Coffee Cup', 'CUP-001', '12oz double wall coffee cup', 'Drinkware', '2.50', '25.00', '100', '500', '7', '0.5', '3x3x4', 'https://example.com/cup.jpg', 'Active', 'eco-friendly, recyclable'],
    ['Sample T-Shirt', 'TSH-002', 'Cotton blend t-shirt', 'Apparel', '8.00', '35.00', '50', '200', '10', '0.3', '', '', 'Active', 'cotton, custom-print']
  ];
  
  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  
  // Save file
  XLSX.writeFile(wb, 'product_import_template.xlsx');
};

// ===== Competitor Price Comparison Functions =====

// Initialize competitor scraper
function initializeCompetitorScraper() {
  if (window.CompetitorScraper) {
    competitorScraper = new window.CompetitorScraper();
    console.log('✅ Competitor scraper initialized');
  } else {
    console.warn('⚠️ CompetitorScraper not loaded');
  }
}

// Open price comparison modal
window.openPriceComparison = async function(productId) {
  console.log('Opening price comparison for product:', productId);
  
  // Initialize scraper if not already done
  if (!competitorScraper) {
    initializeCompetitorScraper();
  }
  
  const product = products.find(p => p.id === productId);
  if (!product) {
    console.error('Product not found:', productId);
    return;
  }
  
  // Update modal header
  document.getElementById('comparisonProductName').textContent = product.name;
  document.getElementById('comparisonProductSKU').textContent = `SKU: ${product.sku || 'N/A'}`;
  
  // Display our price
  const ourPrice = getProductPrice(product);
  document.getElementById('ourPriceDisplay').textContent = ourPrice;
  
  // Show modal
  const modal = document.getElementById('priceComparisonModal');
  if (modal) {
    modal.style.display = 'flex'; // Ensure display is set
    modal.classList.add('show');
  }
  
  // Start loading competitor prices
  await loadCompetitorPrices(product);
};

// Load competitor prices
async function loadCompetitorPrices(product) {
  const container = document.getElementById('competitorPricesList');
  container.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Loading competitor prices...</td></tr>';
  
  try {
    // Scrape competitor prices
    const competitorPrices = await competitorScraper.scrapeCompetitorPrices(
      product.name,
      product.sku
    );
    
    // Calculate our numeric price
    const ourPriceNum = parseFloat(product.base_price) || 0;
    
    // Calculate price position
    const position = competitorScraper.calculatePricePosition(ourPriceNum, competitorPrices);
    
    // Update position display
    updatePricePosition(position);
    
    // Render competitor prices
    renderCompetitorPrices(competitorPrices, ourPriceNum);
    
    // Update price history chart
    updatePriceHistoryChart(product, competitorPrices);
    
  } catch (error) {
    console.error('Error loading competitor prices:', error);
    container.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">Error loading competitor prices</td></tr>';
  }
}

// Update price position display
function updatePricePosition(position) {
  const badge = document.getElementById('pricePositionBadge');
  const marketAvg = document.getElementById('marketAvgDisplay');
  const priceDiff = document.getElementById('priceDiffDisplay');
  const recommendation = document.getElementById('priceRecommendation');
  
  // Update badge
  badge.textContent = position.position;
  
  // Set badge color based on position
  const badgeColors = {
    'Below Market': '#28a745',
    'Above Market': '#dc3545',
    'Competitive': '#28a745',
    'Below Average': '#ffc107',
    'Above Average': '#fd7e14',
    'No Data': '#6c757d'
  };
  badge.style.background = badgeColors[position.position] || '#6c757d';
  badge.style.color = '#fff';
  
  // Update stats
  marketAvg.textContent = `$${position.avgCompetitorPrice || '0.00'}`;
  
  const diffPrefix = position.percentDiff > 0 ? '+' : '';
  priceDiff.textContent = `${diffPrefix}${position.percentDiff}%`;
  priceDiff.style.color = position.percentDiff > 10 ? '#dc3545' : 
                          position.percentDiff < -10 ? '#28a745' : '#000';
  
  // Update recommendation
  recommendation.innerHTML = `<strong>Recommendation:</strong> ${position.recommendation}`;
}

// Render competitor prices table
function renderCompetitorPrices(competitorPrices, ourPrice) {
  const container = document.getElementById('competitorPricesList');
  let html = '';
  
  competitorPrices.forEach(cp => {
    if (cp.error) {
      html += `
        <tr style="opacity: 0.6;">
          <td style="padding: 10px;">${cp.competitorName}</td>
          <td style="text-align: right; padding: 10px;">-</td>
          <td style="text-align: center; padding: 10px;">-</td>
          <td style="text-align: center; padding: 10px;">-</td>
          <td style="text-align: center; padding: 10px; color: #dc3545;">Error</td>
        </tr>
      `;
    } else {
      const diff = ((cp.price - ourPrice) / ourPrice * 100).toFixed(1);
      const diffColor = diff > 0 ? '#dc3545' : '#28a745';
      const confidence = Math.round(cp.confidence * 100);
      const confColor = confidence > 80 ? '#28a745' : confidence > 60 ? '#ffc107' : '#dc3545';
      
      html += `
        <tr>
          <td style="padding: 10px; font-weight: 600;">${cp.competitorName}</td>
          <td style="text-align: right; padding: 10px; font-weight: 700;">$${cp.price.toFixed(2)}</td>
          <td style="text-align: center; padding: 10px; color: ${diffColor}; font-weight: 600;">
            ${diff > 0 ? '+' : ''}${diff}%
          </td>
          <td style="text-align: center; padding: 10px;">
            <span style="color: ${confColor};">${confidence}%</span>
          </td>
          <td style="text-align: center; padding: 10px; font-size: 12px; color: #666;">
            ${new Date(cp.lastUpdated).toLocaleDateString()}
          </td>
        </tr>
      `;
    }
  });
  
  container.innerHTML = html || '<tr><td colspan="5" style="text-align: center; padding: 20px;">No competitor data available</td></tr>';
}

// Update price history chart
function updatePriceHistoryChart(product, competitorPrices) {
  const canvas = document.getElementById('priceHistoryChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart if it exists
  if (priceComparisonChart) {
    priceComparisonChart.destroy();
  }
  
  // Generate mock historical data for demo
  const dates = [];
  const ourPrices = [];
  const comp1Prices = [];
  const comp2Prices = [];
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    const basePrice = parseFloat(product.base_price) || 100;
    ourPrices.push(basePrice + (Math.random() - 0.5) * 5);
    comp1Prices.push(basePrice * 0.95 + (Math.random() - 0.5) * 8);
    comp2Prices.push(basePrice * 1.05 + (Math.random() - 0.5) * 6);
  }
  
  // Create chart
  priceComparisonChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Our Price',
          data: ourPrices,
          borderColor: '#E3FF33',
          backgroundColor: 'rgba(227, 255, 51, 0.1)',
          borderWidth: 3,
          tension: 0.4
        },
        {
          label: 'Competitor A',
          data: comp1Prices,
          borderColor: '#1976d2',
          backgroundColor: 'rgba(25, 118, 210, 0.1)',
          borderWidth: 2,
          tension: 0.4
        },
        {
          label: 'Competitor B',
          data: comp2Prices,
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          borderWidth: 2,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return '$' + value.toFixed(2);
            }
          }
        }
      }
    }
  });
}

// Close price comparison modal
window.closePriceComparison = function() {
  const modal = document.getElementById('priceComparisonModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none'; // Ensure display is set to none
  }
  if (priceComparisonChart) {
    priceComparisonChart.destroy();
    priceComparisonChart = null;
  }
};

// Refresh competitor prices
window.refreshCompetitorPrices = async function() {
  const productName = document.getElementById('comparisonProductName').textContent;
  const product = products.find(p => p.name === productName);
  if (product) {
    await loadCompetitorPrices(product);
  }
};

// Export price comparison report
window.exportPriceComparison = function() {
  const productName = document.getElementById('comparisonProductName').textContent;
  const productSKU = document.getElementById('comparisonProductSKU').textContent;
  
  // Collect data from the modal
  const reportData = [
    ['Price Comparison Report'],
    ['Generated:', new Date().toLocaleString()],
    [''],
    ['Product:', productName],
    [productSKU],
    [''],
    ['Price Analysis'],
    ['Our Price:', document.getElementById('ourPriceDisplay').textContent],
    ['Market Average:', document.getElementById('marketAvgDisplay').textContent],
    ['Difference:', document.getElementById('priceDiffDisplay').textContent],
    ['Position:', document.getElementById('pricePositionBadge').textContent],
    [''],
    ['Competitor Prices'],
    ['Competitor', 'Price', 'Difference', 'Confidence', 'Last Updated']
  ];
  
  // Add competitor data
  const rows = document.querySelectorAll('#competitorPricesList tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      reportData.push([
        cells[0].textContent.trim(),
        cells[1].textContent.trim(),
        cells[2].textContent.trim(),
        cells[3].textContent.trim(),
        cells[4].textContent.trim()
      ]);
    }
  });
  
  // Create Excel workbook
  const ws = XLSX.utils.aoa_to_sheet(reportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Price Comparison');
  
  // Save file
  const fileName = `price_comparison_${productName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// Update product pricing based on comparison
window.updateProductPricing = function() {
  const productName = document.getElementById('comparisonProductName').textContent;
  const product = products.find(p => p.name === productName);
  
  if (product) {
    // Open the product modal for editing
    editProduct(product.id);
    closePriceComparison();
    
    // Focus on the pricing section
    setTimeout(() => {
      const pricingSection = document.querySelector('#productModal .form-group input[type="number"]');
      if (pricingSection) {
        pricingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pricingSection.focus();
      }
    }, 300);
  }
};

// Initialize competitor scraper when catalog loads
const originalInitialize = initializeCatalog;
initializeCatalog = async function() {
  await originalInitialize();
  initializeCompetitorScraper();
};
