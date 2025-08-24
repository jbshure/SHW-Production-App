# Quick Test Instructions for Supplier Pricing System

## 1. Set Up Database (Do this first)

**In Supabase SQL Editor, run:**
```sql
-- Copy and paste the contents of:
docs/database-schemas/supplier-pricing-schema-fixed.sql
```

**Then run test data:**
```sql
-- Copy and paste the contents of:
test-supplier-setup.sql
```

## 2. Create Storage Bucket

**In Supabase Dashboard:**
1. Go to Storage
2. Create new bucket: `supplier-quotes`
3. Set as **Private**
4. Add these policies in Storage > Policies:

```sql
CREATE POLICY "auth_can_upload" ON storage.objects 
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'supplier-quotes');

CREATE POLICY "auth_can_read" ON storage.objects 
  FOR SELECT TO authenticated 
  USING (bucket_id = 'supplier-quotes');
```

## 3. Test the System

Your server should already be running at http://localhost:3000

### Test Supplier Management:
1. Go to: http://localhost:3000/supplier-management.html
2. You should see 3 test suppliers already created
3. Try adding a new supplier

### Test Supplier Pricing Upload:
1. Go to: http://localhost:3000/supplier-pricing.html
2. Select a supplier from dropdown
3. Upload the file: `sample-supplier-pricing.csv`
4. Map the columns:
   - Material Cost → Material per m²
   - Print Cost → Print per m²  
   - Colors Included → Included Colors
   - Setup Fee → Setup fee
   - Plate Fee → Plate fee
   - Waste Percent → Waste factor
5. Save mapping and normalize

### Test Product Catalog Integration:
1. Go to: http://localhost:3000/product-catalog.html
2. Click "💰 Pricing" button on any product
3. Should show supplier pricing modal

## 4. Troubleshooting

### If supplier pages don't load:
- Check browser console for errors
- Verify supabase-config.js has correct URL and key

### If upload fails:
- Check that Edge Function is deployed
- Verify storage bucket exists and is private
- Check browser network tab for errors

### If no pricing shows:
- Make sure suppliers have active rate cards
- Check product family mapping (bag, cup, carton, other)

### Enable Debug Mode:
```javascript
// In browser console:
localStorage.setItem('debug_pricing', 'true');
```

## 5. Sample Test Flow

1. **Add Supplier** → Go to supplier management, add "Test Supplier Co"
2. **Upload Pricing** → Use sample CSV, map columns, normalize for "bag" family  
3. **Approve Rate Card** → Select quantities like 1000,5000,10000, preview matrix, approve
4. **View in Catalog** → Go to product catalog, click pricing button on bag product
5. **See Results** → Should show pricing matrix with landed costs and margins

## Expected Results

- ✅ Suppliers load in management page
- ✅ File upload processes successfully  
- ✅ Column mapping saves
- ✅ Pricing matrix generates
- ✅ Rate cards become active
- ✅ Product catalog shows supplier pricing

If any step fails, check the troubleshooting section above!