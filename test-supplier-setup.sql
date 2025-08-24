-- Quick test setup for supplier pricing system
-- Run this in Supabase SQL Editor after installing the main schema

-- Add sample suppliers
INSERT INTO suppliers (name, currency, incoterm)
VALUES 
  ('China Packaging Solutions', 'USD', 'FOB'),
  ('Vietnam Print Co', 'USD', 'CIF'),
  ('Local Quick Print', 'USD', 'EXW')
ON CONFLICT DO NOTHING;

-- Add sample product families if your products table needs them
-- (Adjust this based on your actual products structure)
/*
UPDATE products 
SET family = 'bag' 
WHERE category_id IN (SELECT id FROM categories WHERE name ILIKE '%bag%');

UPDATE products 
SET family = 'cup' 
WHERE category_id IN (SELECT id FROM categories WHERE name ILIKE '%cup%');

UPDATE products 
SET family = 'carton' 
WHERE category_id IN (SELECT id FROM categories WHERE name ILIKE '%box%' OR name ILIKE '%carton%');
*/

-- Sample pricing rule: Add $0.10 per unit for UV coating
INSERT INTO pricing_rules (
  supplier_id, 
  family, 
  condition, 
  action, 
  basis, 
  value, 
  notes
)
VALUES (
  NULL, -- applies to all suppliers
  NULL, -- applies to all families
  '{"attrs.finish": {"eq": "UV coating"}}', -- condition
  'adder', 
  'per_unit', 
  0.10, 
  'UV coating surcharge'
)
ON CONFLICT DO NOTHING;

-- Sample pricing rule: 15% discount for quantities over 10,000
INSERT INTO pricing_rules (
  supplier_id, 
  family, 
  condition, 
  action, 
  basis, 
  value, 
  notes,
  priority
)
VALUES (
  NULL, 
  NULL, 
  '{"calc.qty": {"gte": "10000"}}', 
  'multiplier', 
  'per_unit', 
  0.85, -- 15% discount
  'Volume discount for 10k+ quantity',
  90 -- higher priority (lower number = higher priority)
)
ON CONFLICT DO NOTHING;

-- Check what was created
SELECT 'Suppliers created:' as info, count(*) as count FROM suppliers
UNION ALL
SELECT 'Margin tiers:', count(*) FROM margin_tiers
UNION ALL
SELECT 'Pricing rules:', count(*) FROM pricing_rules;

-- Show the suppliers
SELECT id, name, currency, incoterm FROM suppliers;

-- Show pricing rules
SELECT id, condition, action, basis, value, notes FROM pricing_rules;