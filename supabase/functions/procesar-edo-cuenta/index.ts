// Edge Function: procesar-edo-cuenta
// Recibe estados de cuenta BBVA (PDF oficial) ya extraidos a items con
// coordenadas, los parsea de forma DETERMINISTA (sin LLM) con el modulo
// compartido y hace upsert idempotente (por dedup_key) en
// `public.movimientos_bancarios`. Reemplaza al webhook de n8n.
//
// La extraccion bytes->items (pdfjs) la hace el cliente (browser) porque pdfjs
// corre de forma robusta en el DOM; aqui llega ya como datos, sin dependencias.
//
// Input  (POST JSON): { files: [{ name: string, pages: Item[][] }] }
//   Item = { x, y, right, s }  (ver _shared/edocuenta.mjs -> itemsFromTextContent)
// Output (JSON):      { processed, inserted, errors: [{ file, msg }] }

import { createClient } from "@supabase/supabase-js";
import { parseEdoCuenta } from "../_shared/edocuenta.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let files: Array<{ name: string; pages: unknown[][] }>;
  try {
    const body = await req.json();
    files = body?.files ?? [];
    if (!Array.isArray(files) || files.length === 0) {
      return json({ error: "Falta `files` (array no vacio)" }, 400);
    }
  } catch {
    return json({ error: "Body invalido (se espera JSON)" }, 400);
  }

  const rows: Record<string, unknown>[] = [];
  const errors: Array<{ file: string; msg: string }> = [];

  for (const f of files) {
    try {
      rows.push(...parseEdoCuenta(f.pages, f.name));
    } catch (e) {
      errors.push({ file: f.name, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  // Dedup dentro del lote: upsert con onConflict no acepta claves repetidas.
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of rows) byKey.set(r.dedup_key as string, r);
  const unique = [...byKey.values()];

  let inserted = 0;
  if (unique.length) {
    const { error } = await supabase
      .from("movimientos_bancarios")
      .upsert(unique, { onConflict: "dedup_key" });
    if (error) return json({ error: error.message, errors }, 500);
    inserted = unique.length;
  }

  return json({ processed: files.length, inserted, errors });
});
