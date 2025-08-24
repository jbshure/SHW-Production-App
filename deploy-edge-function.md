# Edge Function Deployment Guide

## Option 1: Use Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard**
   - Open your Supabase project dashboard
   - Navigate to "Edge Functions" in the sidebar

2. **Create New Function**
   - Click "Create Function"
   - Name: `process-upload`
   - Copy and paste the code from `supabase/functions/process-upload/index.ts`

3. **Set Environment Variables**
   - In the Edge Functions dashboard, go to Settings
   - Add these secrets:
     - `SUPABASE_URL`: Your project URL
     - `SUPABASE_SERVICE_ROLE_KEY`: Your service role key (found in Settings > API)

4. **Deploy**
   - Click "Deploy Function"

## Option 2: Using CLI (If you can install it)

### Install CLI via npm (in project directory)
```bash
npm install supabase --save-dev
```

### Create environment file
Create `supabase/.env` with:
```
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Login and deploy
```bash
npx supabase login
npx supabase functions deploy process-upload --project-ref your-project-ref
```

## Option 3: Manual cURL Upload (Advanced)

If you want to deploy via API:

```bash
curl -X POST https://api.supabase.com/v1/projects/YOUR_PROJECT_REF/functions \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "process-upload",
    "name": "process-upload",
    "source_code": "BASE64_ENCODED_TYPESCRIPT"
  }'
```

## Testing the Function

Once deployed, you can test it:

```javascript
// In browser console or your app
const response = await fetch(`${SUPABASE_URL}/functions/v1/process-upload?uploadId=test-id`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  }
});
```

## Verify Deployment

1. Go to Supabase Dashboard > Edge Functions
2. You should see `process-upload` listed
3. Click on it to see logs and test

## Next Steps After Deployment

1. **Test Upload Flow**:
   - Go to `/supplier-pricing.html`
   - Try uploading a CSV file
   - Check if it processes correctly

2. **Add Test Data**:
   ```sql
   INSERT INTO suppliers (name, currency, incoterm)
   VALUES ('Test Supplier', 'USD', 'FOB');
   ```

3. **Create Sample CSV**:
   ```csv
   Material Cost,Print Cost,Colors Included,Setup,Plate Fee,Waste %
   0.25,0.15,1,50,25,5
   ```

## Troubleshooting

- **Function not found**: Check deployment status in dashboard
- **Permission denied**: Verify service role key is correct
- **Upload fails**: Check storage bucket `supplier-quotes` exists and is private
- **No parsing**: Check function logs in Supabase dashboard

The easiest route is **Option 1** using the Supabase Dashboard!