# Supplier Pricing System Setup Guide

## Overview
This guide will help you set up the supplier pricing upload and management system that has been integrated into your product catalog.

## Database Setup

### 1. Create Tables in Supabase
Run the SQL schema located at: `docs/database-schemas/supplier-pricing-schema.sql`

This will create:
- `suppliers` - Supplier master data
- `supplier_uploads` - Upload tracking
- `supplier_quote_raw_rows` - Parsed data from uploads
- `supplier_mapping_profiles` - Column mapping profiles
- `supplier_rate_cards` - Active pricing cards
- `supplier_rate_card_staging` - Staging area for new uploads
- `pricing_rules` - Custom pricing rules
- `margin_tiers` - Margin configuration by quantity
- Plus several helper functions and RPCs

### 2. Create Storage Bucket
In Supabase Studio:
1. Go to Storage
2. Create a new **private** bucket named `supplier-quotes`
3. The SQL script includes the necessary RLS policies for this bucket

## Edge Function Setup

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Create Edge Function
Create a new file at `supabase/functions/process-upload/index.ts`:

```typescript
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const uploadId = url.searchParams.get("uploadId");
    if (!uploadId) return new Response("Missing uploadId", { status: 400 });

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: up, error: e1 } = await supa
      .from("supplier_uploads")
      .select("*")
      .eq("id", uploadId)
      .single();
    if (e1 || !up) return new Response("Upload not found", { status: 404 });

    const key = up.file_path.replace(/^supplier-quotes\//, "");
    const { data: file, error: e2 } = await supa.storage.from("supplier-quotes").download(key);
    if (e2 || !file) return new Response("File not found in storage", { status: 404 });

    const rows: any[] = [];
    const name = (up.file_name || "").toLowerCase();
    const mime = (up.mime_type || "");

    if (mime.includes("csv") || name.endsWith(".csv")) {
      const text = await file.text();
      const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const headers = headerLine.split(",").map((h) => h.trim());
      lines.forEach((line, i) => {
        const vals = line.split(",");
        const cols: Record<string, string> = {};
        headers.forEach((h, j) => (cols[h] = (vals[j] ?? "").trim()));
        rows.push({ row_index: i, raw: { cols } });
      });
    } else if (mime.includes("spreadsheet") || name.endsWith(".xlsx")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const arr = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const headers = (arr.shift() || []).map((h) => String(h).trim());
      arr.forEach((r, i) => {
        const cols: Record<string, string> = {};
        headers.forEach((h, j) => (cols[h] = (r[j] ?? "").toString().trim()));
        rows.push({ row_index: i, raw: { cols } });
      });
    } else if (mime.includes("pdf") || name.endsWith(".pdf")) {
      const text = await file.text();
      rows.push({ row_index: 0, raw: { text } });
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      rows.push({ row_index: 0, raw: { binary_b64: btoa(binary) } });
    }

    if (rows.length) {
      const payload = rows.map((r) => ({ upload_id: uploadId, row_index: r.row_index, raw: r.raw }));
      const { error: e3 } = await supa.from("supplier_quote_raw_rows").upsert(payload);
      if (e3) throw e3;
    }

    await supa.from("supplier_uploads").update({
      status: "parsed",
      detected_format: name.endsWith(".xlsx")
        ? "xlsx"
        : name.endsWith(".csv")
        ? "csv"
        : name.endsWith(".pdf")
        ? "pdf"
        : "other",
    }).eq("id", uploadId);

    return new Response(JSON.stringify({ ok: true, rows: rows.length }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err?.message || err), { status: 500 });
  }
});
```

### 3. Deploy Edge Function
```bash
cd supabase
supabase functions deploy process-upload
```

## Web Interface

### New Pages Created
1. **Supplier Management** (`/supplier-management.html`)
   - Add/edit suppliers
   - View rate cards
   - Manage pricing rules

2. **Supplier Pricing Upload** (`/supplier-pricing.html`)
   - Upload CSV/XLSX files
   - Map columns to pricing fields
   - Preview pricing matrix
   - Approve and publish rate cards

### Product Catalog Integration
The product catalog has been updated with:
- Supplier pricing button on each product card
- Modal to view pricing from all suppliers
- Functions to calculate landed costs and margins

## Usage Workflow

### 1. Initial Setup
1. Add suppliers in Supplier Management
2. Configure margin tiers if needed
3. Set up any custom pricing rules

### 2. Upload Pricing
1. Go to Supplier Pricing page
2. Select supplier and upload CSV/XLSX
3. Map columns to pricing fields:
   - Material per m²
   - Print per m²
   - Included colors
   - Setup fee
   - Plate fee
   - Waste factor

### 3. Review & Approve
1. Select product family (bag, cup, carton, etc.)
2. Choose a product configuration
3. Enter test quantities
4. Preview the pricing matrix
5. Approve to make it the active rate card

### 4. View in Product Catalog
1. Go to Product Catalog
2. Click "💰 Pricing" button on any product
3. View pricing from all suppliers with active rate cards

## Testing

### Test Data
Create test suppliers:
```sql
INSERT INTO suppliers (name, currency, incoterm) VALUES
  ('China Supplier A', 'USD', 'FOB'),
  ('Vietnam Supplier B', 'USD', 'CIF'),
  ('Local Supplier C', 'USD', 'EXW');
```

### Sample CSV Format
```csv
Material Cost,Print Cost,Colors Included,Setup,Plate Fee,Waste %
0.25,0.15,1,50,25,5
```

## Troubleshooting

### Common Issues
1. **Upload fails**: Check that Edge Function is deployed
2. **No pricing shown**: Verify rate cards are active
3. **Wrong calculations**: Check product_configs mapping

### Debug Mode
Enable console logging in browser:
```javascript
localStorage.setItem('debug_pricing', 'true');
```

## API Reference

### Key Supabase RPCs
- `inbox_register_upload` - Register new upload
- `normalize_upload_to_staging` - Process with mapping
- `generate_matrix_from_staging` - Preview pricing
- `publish_staging_rate_card` - Activate rate card
- `compute_price` - Calculate single price point

## Security Notes
- All uploads require authentication
- Rate cards can only be published by authorized users
- Storage bucket is private with RLS policies

## Next Steps
1. Customize product family mappings
2. Add more sophisticated pricing rules
3. Implement approval workflows
4. Add historical pricing tracking
5. Create pricing reports and analytics