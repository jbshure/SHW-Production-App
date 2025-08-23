-- SQL script to create product options/variants structure in Supabase

-- Product Options Groups (Size, Color, Wall Type, etc.)
CREATE TABLE IF NOT EXISTS product_option_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., "Size", "Wall Type", "Color"
    display_order INTEGER DEFAULT 0,
    required BOOLEAN DEFAULT false,
    option_type VARCHAR(50) DEFAULT 'select', -- 'select', 'radio', 'checkbox', 'text'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Option Values (100ml, 240ml, Single Wall, etc.)
CREATE TABLE IF NOT EXISTS product_option_values (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    option_group_id UUID REFERENCES product_option_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., "100 ml (4 oz)", "Single Wall"
    sku_suffix VARCHAR(50), -- e.g., "-100ML", "-SW"
    price_adjustment DECIMAL(10,2) DEFAULT 0, -- Additional price for this option
    weight_adjustment DECIMAL(10,3) DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    stock_quantity INTEGER,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Variants (combinations of options with specific pricing)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_sku VARCHAR(100) UNIQUE,
    variant_name VARCHAR(255), -- e.g., "100ml Single Wall White"
    base_price DECIMAL(10,2),
    compare_at_price DECIMAL(10,2),
    cost DECIMAL(10,2),
    weight DECIMAL(10,3),
    stock_quantity INTEGER DEFAULT 0,
    options JSONB, -- Store selected options as JSON {"Size": "100ml", "Wall": "Single"}
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Volume/Quantity Pricing Tiers
CREATE TABLE IF NOT EXISTS product_pricing_tiers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    min_quantity INTEGER NOT NULL,
    max_quantity INTEGER,
    unit_price DECIMAL(10,2) NOT NULL,
    setup_fee DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_option_groups_product ON product_option_groups(product_id);
CREATE INDEX idx_option_values_group ON product_option_values(option_group_id);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_pricing_tiers_product ON product_pricing_tiers(product_id);
CREATE INDEX idx_pricing_tiers_variant ON product_pricing_tiers(variant_id);

-- Sample data for a coffee cup product
/*
INSERT INTO product_option_groups (product_id, name, display_order, required, option_type) VALUES
    ('YOUR_PRODUCT_ID', 'Size', 1, true, 'select'),
    ('YOUR_PRODUCT_ID', 'Wall Type', 2, true, 'radio'),
    ('YOUR_PRODUCT_ID', 'Color', 3, false, 'select'),
    ('YOUR_PRODUCT_ID', 'Lid Type', 4, false, 'select'),
    ('YOUR_PRODUCT_ID', 'Lid Color', 5, false, 'select');

-- Then add option values for each group
*/