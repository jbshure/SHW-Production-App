# Supabase Storage Setup Instructions

Before running the image migration, you need to create a storage bucket in Supabase Dashboard.

## Steps to Create Storage Bucket:

1. **Go to Supabase Dashboard**
   - Open: https://supabase.com/dashboard
   - Login to your account
   - Select your project: `elvbmvbbsymrcktvfbbk`

2. **Navigate to Storage**
   - In the left sidebar, click on "Storage"
   - You should see the Storage overview page

3. **Create New Bucket**
   - Click the "New bucket" button
   - Enter bucket name: `product-images`
   - Set as **Public bucket**: ✅ (This is important!)
   - File size limit: 50MB (or higher)
   - Click "Create bucket"

4. **Verify Bucket Settings**
   - The bucket should appear in your storage list
   - Make sure it shows as "Public" 
   - Click on the bucket to verify it's accessible

## Alternative: SQL Commands

If you prefer to create via SQL, you can run these commands in the SQL Editor:

```sql
-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- Create RLS policy to allow public uploads (if needed)
CREATE POLICY "Public Access" ON storage.objects FOR ALL USING (bucket_id = 'product-images');
```

## Test Bucket Access

After creating the bucket, run this command to test access:

```bash
node test-bucket-access.js
```

The script will verify that the bucket is accessible and ready for uploads.

## Troubleshooting

**Error: "new row violates row-level security policy"**
- This means you need to create the bucket manually through the Dashboard
- Anonymous users cannot create buckets, only use existing ones

**Error: "The object exceeded the maximum allowed size"**  
- Increase the bucket file size limit in Dashboard settings
- The optimized script compresses images to reduce file sizes

**Error: "permission denied"**
- Make sure the bucket is set to "Public"
- Check that RLS policies allow anonymous access

## Security Note

Making the bucket public means anyone with the URL can view the images, which is appropriate for product catalog images. If you need private images, you'll need to set up proper authentication and RLS policies.