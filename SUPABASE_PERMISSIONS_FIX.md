# Fixing Supabase Permission Errors

If you're seeing "permission denied for schema public" errors, follow these steps:

## Quick Fix (Disable RLS - Development Only)

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Disable Row Level Security for all product-related tables
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_values DISABLE ROW LEVEL SECURITY;
```

## Proper Fix (Enable RLS with Policies - Recommended)

### 1. Enable RLS and Create Read Policies

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_option_values ENABLE ROW LEVEL SECURITY;

-- Create policies allowing anonymous read access
CREATE POLICY "Allow anonymous read access" ON products
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON categories
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON supplier
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON product_variants
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON product_option_groups
    FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read access" ON product_option_values
    FOR SELECT USING (true);

-- Optional: Create policies for authenticated users to modify data
CREATE POLICY "Allow authenticated users to insert" ON products
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update" ON products
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete" ON products
    FOR DELETE USING (auth.role() = 'authenticated');
```

### 2. Alternative: Using Service Role Key (Admin Access)

If you need full admin access, update your `supabase-config.js` to use the service role key instead of the anon key:

```javascript
window.SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SERVICE_ROLE_KEY' // Use service role key for admin access
};
```

**Warning:** Never expose the service role key in client-side code in production!

## Checking Current Permissions

To see which tables have RLS enabled:

```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

To see existing policies:

```sql
SELECT * FROM pg_policies 
WHERE schemaname = 'public';
```

## Creating Missing Tables

If tables don't exist, create them:

```sql
-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cp_sku VARCHAR(100),
    description TEXT,
    category_id UUID,
    supplier_id UUID,
    status VARCHAR(50) DEFAULT 'Active',
    image_url TEXT,
    images JSONB,
    base_price DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create supplier table (note: singular, not plural)
CREATE TABLE IF NOT EXISTS supplier (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing Your Fix

After applying the fixes:

1. Go to your product catalog page
2. Click the "🔄 Refresh" button
3. Check the browser console for any remaining errors
4. Products should now load successfully

## Need Help?

If you continue to have issues:
1. Check the Supabase dashboard logs for detailed error messages
2. Ensure your Supabase project is active and not paused
3. Verify your API keys are correct in `supabase-config.js`