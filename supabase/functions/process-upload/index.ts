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