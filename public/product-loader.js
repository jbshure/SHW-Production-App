// Supabase Product Loader - product-loader.js
// Robust loader for products with full relationship mapping
// Exposes window.fullProducts and integrates with product-catalog.js

// ======= CONFIG: tweak here if your column names differ =======
const FIELDS = {
  // Product identity/display
  productName: ["product_name", "name"],
  productSKU: ["cp_sku", "sku", "product_sku"],

  // Foreign keys
  categoryId: ["category_id", "categories_id", "cat_id"],
  supplierId: ["supplier_id", "suppliers_id", "supplierId"],

  // Descriptions
  description: ["description", "long_description", "shureprint_description"],
  ecommerceDescription: ["ecommerce_description", "web_description"],

  // Specs
  weightOz: ["weight_oz", "weight"],
  dimensions: ["dimensions", "size_dimensions"],
  uom: ["unit_of_measure", "uom"],
  minOrderQty: ["minimum_order_quantity", "min_order_qty"],
  leadTimeDays: ["lead_time_days", "lead_time"],

  // Status/tags/notes
  status: ["status", "state"],
  tags: ["tags", "keywords"],
  productionNotes: ["production_notes", "prod_notes"],
  internalNotes: ["internal_notes", "notes_internal"],

  // Competitors/links
  competitorLinks: ["competitor_links", "competitors"],

  // Images (priority ordering)
  imageCandidates: [
    "image_data",
    "image",
    "shureprint_artboard_image",
    "image_url"
  ],
};

const TABLES = {
  products: "products",
  categories: "categories",
  suppliers: "suppliers",
  optionTypes: "option_types",
  optionValues: "option_values",
  currentVariants: "current_variant",
  volumePrices: "volume_prices",
  // Link tables
  productOptionTypes: "products_option_types_link",
  optionTypeValues: "option_types_option_values_link",
  variantValues: "option_values_current_variant_link",
  variantPrices: "current_variant_volume_prices_link",
};

// ======= Helpers =======
function firstExistingKey(obj, keys) {
  for (const k of keys) if (k in obj && obj[k] != null) return k;
  return null;
}

function getFirst(obj, keys, fallback = null) {
  for (const k of keys) if (obj[k] != null && obj[k] !== "") return obj[k];
  return fallback;
}

function safeArray(x) { 
  return Array.isArray(x) ? x : []; 
}

function isNonAirtableUrl(str) {
  return typeof str === "string" && str && !str.toLowerCase().includes("airtable");
}

function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String).map(s => s.trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

function pickImage(product) {
  // 1) direct fields (non-Airtable preferred)
  for (const f of FIELDS.imageCandidates) {
    const v = product[f];
    if (typeof v === "string" && isNonAirtableUrl(v)) return v;
  }
  
  // 2) images array
  const imgs = product.images;
  if (Array.isArray(imgs)) {
    for (const img of imgs) {
      const url = typeof img === "string" ? img : img?.url;
      if (isNonAirtableUrl(url)) return url;
    }
  }
  
  // 3) fallback (can be Airtable if nothing else)
  for (const f of ["image", "image_url"]) {
    if (typeof product[f] === "string" && product[f]) return product[f];
  }
  if (Array.isArray(imgs) && imgs.length) {
    const u = typeof imgs[0] === "string" ? imgs[0] : imgs[0]?.url;
    if (u) return u;
  }
  return null;
}

// ======= Main loader =======
async function loadProductsWithFullRelationships() {
  console.log("=== LOADING PRODUCTS WITH FULL RELATIONSHIPS ===");

  if (!window?.SUPABASE_CONFIG?.url || !window?.SUPABASE_CONFIG?.anonKey || !window?.supabase?.createClient) {
    console.error("Supabase not configured. Ensure SUPABASE_CONFIG and supabase library are loaded.");
    return [];
  }

  const { createClient } = window.supabase;
  const supabase = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

  try {
    console.log("Step 1: Loading all tables in parallel...");

    const [
      productsResult,
      categoriesResult,
      suppliersResult,
      optionTypesResult,
      optionValuesResult,
      currentVariantsResult,
      volumePricesResult,
      productOptionTypesLink,
      optionTypesValuesLink,
      variantValuesLink,
      variantPricesLink,
    ] = await Promise.all([
      supabase.from(TABLES.products).select("*"),
      supabase.from(TABLES.categories).select("*"),
      supabase.from(TABLES.suppliers).select("*"),
      supabase.from(TABLES.optionTypes).select("*"),
      supabase.from(TABLES.optionValues).select("*"),
      supabase.from(TABLES.currentVariants).select("*").limit(10000),
      supabase.from(TABLES.volumePrices).select("*").limit(10000),
      supabase.from(TABLES.productOptionTypes).select("*").limit(10000),
      supabase.from(TABLES.optionTypeValues).select("*").limit(10000),
      supabase.from(TABLES.variantValues).select("*").limit(10000),
      supabase.from(TABLES.variantPrices).select("*").limit(10000),
    ]);

    // Error checking
    if (productsResult.error) throw productsResult.error;
    const products = safeArray(productsResult.data);

    console.log(`✅ Loaded ${products.length} products`);
    console.log(`✅ Loaded ${(categoriesResult.data?.length)||0} categories${categoriesResult.error ? ' (error: ' + categoriesResult.error.message + ')' : ''}`);
    console.log(`✅ Loaded ${(suppliersResult.data?.length)||0} suppliers${suppliersResult.error ? ' (error: ' + suppliersResult.error.message + ')' : ''}`);
    console.log(`✅ Loaded ${(optionTypesResult.data?.length)||0} option types`);
    console.log(`✅ Loaded ${(optionValuesResult.data?.length)||0} option values`);
    console.log(`✅ Loaded ${(currentVariantsResult.data?.length)||0} variants`);
    console.log(`✅ Loaded ${(volumePricesResult.data?.length)||0} volume prices`);

    // Step 2: Build maps
    console.log("\nStep 2: Building relationship maps...");

    const categoriesById = new Map();
    for (const c of safeArray(categoriesResult.data)) categoriesById.set(c.id, c);

    const suppliersById = new Map();
    for (const s of safeArray(suppliersResult.data)) suppliersById.set(s.id, s);

    const optionTypesById = new Map();
    for (const ot of safeArray(optionTypesResult.data)) optionTypesById.set(ot.id, ot);

    const optionValuesById = new Map();
    for (const ov of safeArray(optionValuesResult.data)) optionValuesById.set(ov.id, ov);

    const variantsById = new Map();
    for (const v of safeArray(currentVariantsResult.data)) variantsById.set(v.id, v);

    const pricesById = new Map();
    for (const p of safeArray(volumePricesResult.data)) pricesById.set(p.id, p);

    // Build relationship maps using link tables
    const optionTypesByProduct = new Map();
    for (const link of safeArray(productOptionTypesLink.data)) {
      const ot = optionTypesById.get(link.option_types_id);
      if (!ot) continue;
      const arr = optionTypesByProduct.get(link.products_id) || [];
      arr.push(ot);
      optionTypesByProduct.set(link.products_id, arr);
    }

    const optionValuesByType = new Map();
    for (const link of safeArray(optionTypesValuesLink.data)) {
      const ov = optionValuesById.get(link.option_values_id);
      if (!ov) continue;
      const arr = optionValuesByType.get(link.option_types_id) || [];
      arr.push(ov);
      optionValuesByType.set(link.option_types_id, arr);
    }

    const variantsByValue = new Map();
    for (const link of safeArray(variantValuesLink.data)) {
      const v = variantsById.get(link.current_variant_id);
      if (!v) continue;
      const arr = variantsByValue.get(link.option_values_id) || [];
      arr.push(v);
      variantsByValue.set(link.option_values_id, arr);
    }

    const pricesByVariant = new Map();
    for (const link of safeArray(variantPricesLink.data)) {
      const price = pricesById.get(link.volume_prices_id);
      if (!price) continue;
      const arr = pricesByVariant.get(link.current_variant_id) || [];
      arr.push(price);
      pricesByVariant.set(link.current_variant_id, arr);
    }

    // Step 3: Compose complete products
    console.log("\nStep 3: Building complete product structures...");

    const completeProducts = products.map((product) => {
      const categoryKey = firstExistingKey(product, FIELDS.categoryId);
      const supplierKey = firstExistingKey(product, FIELDS.supplierId);

      const category = categoryKey ? categoriesById.get(product[categoryKey]) || null : null;
      const supplier = supplierKey ? suppliersById.get(product[supplierKey]) || null : null;

      // Build nested option structure
      const optionTypes = (optionTypesByProduct.get(product.id) || []).map((ot) => {
        const optionValues = (optionValuesByType.get(ot.id) || []).map((ov) => {
          const currentVariants = (variantsByValue.get(ov.id) || []).map((variant) => {
            const volumePrices = safeArray(pricesByVariant.get(variant.id)).sort(
              (a, b) => (a.min_quantity || 0) - (b.min_quantity || 0)
            );
            return {
              ...variant,
              volume_prices: volumePrices,
              stock_quantity: variant.stock_quantity ?? variant.qty ?? 0,
              reorder_point: variant.reorder_point ?? null,
              track_inventory: variant.track_inventory ?? false,
              allow_backorders: variant.allow_backorders ?? false,
            };
          });
          return { ...ov, current_variants: currentVariants };
        });
        return { ...ot, option_values: optionValues };
      });

      const image_url = pickImage(product);
      const name = getFirst(product, FIELDS.productName, "Unnamed Product");

      // Calculate totals
      const totals = optionTypes.reduce(
        (acc, type) => {
          acc.totalOptionTypes += 1;
          acc.totalOptionValues += type.option_values.length;
          for (const v of type.option_values) acc.totalVariants += v.current_variants.length;
          return acc;
        },
        { totalOptionTypes: 0, totalOptionValues: 0, totalVariants: 0 }
      );

      const tags = normalizeTags(getFirst(product, FIELDS.tags, []));
      const competitor_links_raw = getFirst(product, FIELDS.competitorLinks, []);
      const competitor_links = Array.isArray(competitor_links_raw) ? competitor_links_raw : [];

      return {
        ...product,
        // Normalized fields
        name,
        cp_sku: getFirst(product, FIELDS.productSKU, null),
        image_url,
        description: getFirst(product, FIELDS.description, null),
        ecommerce_description: getFirst(product, FIELDS.ecommerceDescription, null),
        weight_oz: getFirst(product, FIELDS.weightOz, null),
        dimensions: getFirst(product, FIELDS.dimensions, null),
        unit_of_measure: getFirst(product, FIELDS.uom, null),
        minimum_order_quantity: getFirst(product, FIELDS.minOrderQty, null),
        lead_time_days: getFirst(product, FIELDS.leadTimeDays, null),
        status: getFirst(product, FIELDS.status, "Active"),
        tags,
        production_notes: getFirst(product, FIELDS.productionNotes, null),
        internal_notes: getFirst(product, FIELDS.internalNotes, null),
        competitor_links,

        // Relationships
        category,
        supplier,
        option_types: optionTypes,

        // UI helper fields
        total_variants: totals.totalVariants,
        total_option_values: totals.totalOptionValues,
        total_option_types: totals.totalOptionTypes,
      };
    });

    // Step 4: Calculate statistics
    const stats = {
      productsWithOptions: 0,
      totalOptionTypes: 0,
      totalOptionValues: 0,
      totalVariants: 0,
      totalVolumePrices: 0,
      productsWithImages: 0,
      productsWithAirtableImages: 0,
    };

    for (const p of completeProducts) {
      if (p.option_types?.length) {
        stats.productsWithOptions += 1;
        stats.totalOptionTypes += p.option_types.length;
        for (const t of p.option_types) {
          stats.totalOptionValues += t.option_values.length;
          for (const ov of t.option_values) {
            stats.totalVariants += ov.current_variants.length;
            for (const v of ov.current_variants) {
              stats.totalVolumePrices += (v.volume_prices?.length || 0);
            }
          }
        }
      }
      if (p.image_url) {
        stats.productsWithImages += 1;
        if (typeof p.image_url === "string" && p.image_url.toLowerCase().includes("airtable")) {
          stats.productsWithAirtableImages += 1;
        }
      }
    }

    console.log("\n=== FINAL RESULTS ===");
    console.log(`Total products: ${completeProducts.length}`);
    console.table(stats);
    
    // Debug: Show first product's structure
    if (completeProducts.length > 0) {
      console.log("\n📦 Sample product structure:");
      const sample = completeProducts[0];
      console.log({
        id: sample.id,
        name: sample.name,
        image_url: sample.image_url,
        total_variants: sample.total_variants,
        total_option_types: sample.total_option_types,
        total_option_values: sample.total_option_values,
        hasOptionTypes: !!sample.option_types?.length
      });
    }

    // Store globally for access
    window.fullProducts = completeProducts;
    
    // Also update the global products array for backward compatibility
    window.products = completeProducts;
    window.debugProducts = completeProducts;
    
    // Store categories and suppliers globally
    window.categories = safeArray(categoriesResult.data);
    window.suppliers = safeArray(suppliersResult.data);
    
    console.log("\n✅ Products loaded and stored in window.fullProducts, window.products, and window.debugProducts");
    
    return completeProducts;
    
  } catch (err) {
    console.error("Error loading products:", err);
    return [];
  }
}

// Export for use in other modules
if (typeof window !== "undefined") {
  window.loadProductsWithFullRelationships = loadProductsWithFullRelationships;
}