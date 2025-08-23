-- Create all required tables for the Product Catalog
-- Run this in your Supabase SQL Editor

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create supplier table (note: singular, not plural)
CREATE TABLE IF NOT EXISTS supplier (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    website VARCHAR(255),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update products table to ensure it has all required columns
-- First check if products table exists
DO $$ 
BEGIN
    -- Add category_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'category_id') THEN
        ALTER TABLE products ADD COLUMN category_id UUID REFERENCES categories(id);
    END IF;
    
    -- Add supplier_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'supplier_id') THEN
        ALTER TABLE products ADD COLUMN supplier_id UUID REFERENCES supplier(id);
    END IF;
    
    -- Add status column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'status') THEN
        ALTER TABLE products ADD COLUMN status VARCHAR(50) DEFAULT 'Active';
    END IF;
    
    -- Add image_url column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'image_url') THEN
        ALTER TABLE products ADD COLUMN image_url TEXT;
    END IF;
    
    -- Add images column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'images') THEN
        ALTER TABLE products ADD COLUMN images JSONB;
    END IF;
    
    -- Add cp_sku column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'cp_sku') THEN
        ALTER TABLE products ADD COLUMN cp_sku VARCHAR(100);
    END IF;
    
    -- Add description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'description') THEN
        ALTER TABLE products ADD COLUMN description TEXT;
    END IF;
    
    -- Add base_price column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'products' AND column_name = 'base_price') THEN
        ALTER TABLE products ADD COLUMN base_price DECIMAL(10,2);
    END IF;
END $$;

-- 4. Create product_variants table (optional - for products with variations)
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_sku VARCHAR(100) UNIQUE,
    variant_name VARCHAR(255),
    base_price DECIMAL(10,2),
    compare_at_price DECIMAL(10,2),
    cost DECIMAL(10,2),
    weight DECIMAL(10,3),
    stock_quantity INTEGER DEFAULT 0,
    options JSONB,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create product_option_groups table (optional - for product options)
CREATE TABLE IF NOT EXISTS product_option_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INTEGER DEFAULT 0,
    required BOOLEAN DEFAULT false,
    option_type VARCHAR(50) DEFAULT 'select',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create product_option_values table (optional - for option values)
CREATE TABLE IF NOT EXISTS product_option_values (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    option_group_id UUID REFERENCES product_option_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    sku_suffix VARCHAR(50),
    price_adjustment DECIMAL(10,2) DEFAULT 0,
    weight_adjustment DECIMAL(10,3) DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    stock_quantity INTEGER,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Insert sample data for testing
INSERT INTO categories (name, description, display_order) VALUES
    ('Business Cards', 'Professional business cards in various styles', 1),
    ('Flyers', 'Marketing flyers and handouts', 2),
    ('Banners', 'Indoor and outdoor banners', 3),
    ('Labels', 'Custom labels and stickers', 4),
    ('Packaging', 'Custom packaging solutions', 5)
ON CONFLICT DO NOTHING;

INSERT INTO supplier (name, contact_email, website) VALUES
    ('Print Partner Inc', 'contact@printpartner.com', 'https://printpartner.com'),
    ('Quality Prints Co', 'info@qualityprints.com', 'https://qualityprints.com'),
    ('Express Printing', 'sales@expressprinting.com', 'https://expressprinting.com')
ON CONFLICT DO NOTHING;

-- 8. Set up Row Level Security (RLS) with proper policies
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_values ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read (SELECT) all tables
CREATE POLICY "Allow public read access" ON categories FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON supplier FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON product_option_groups FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON product_option_values FOR SELECT USING (true);

-- For products table, check if it has RLS enabled
DO $$ 
BEGIN
    -- Enable RLS on products if not already enabled
    ALTER TABLE products ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policy if it exists to avoid conflicts
    DROP POLICY IF EXISTS "Allow public read access" ON products;
    
    -- Create new policy
    CREATE POLICY "Allow public read access" ON products FOR SELECT USING (true);
EXCEPTION
    WHEN others THEN
        -- If any error, just continue
        NULL;
END $$;

-- 9. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_option_groups_product ON product_option_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_option_values_group ON product_option_values(option_group_id);

-- 10. Grant permissions for anonymous users (if needed)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE 'All tables created successfully! Your product catalog database is ready.';
END $$;