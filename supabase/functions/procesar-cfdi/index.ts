// Edge Function: procesar-cfdi
// Recibe XMLs de CFDI, los parsea de forma DETERMINISTA (sin LLM) y los inserta
// (upsert idempotente por cfdi_uuid) en `public.facturas`. Reemplaza al workflow
// de n8n "CLASIFICADOR FACTURAS" para la rama XML.
//
// Input  (POST JSON): { files: [{ name: string, xml: string }] }
// Output (JSON):      { processed, inserted, errors: [{ file, msg }] }

import { createClient } from "@supabase/supabase-js";
import { parseCfdiXml } from "../_shared/cfdi.mjs";

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

  let files: Array<{ name: string; xml: string }>;
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
      rows.push(parseCfdiXml(f.xml, f.name));
    } catch (e) {
      errors.push({ file: f.name, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  let inserted = 0;
  if (rows.length) {
    // Upsert idempotente: re-procesar el mismo CFDI no duplica.
    const { error } = await supabase
      .from("facturas")
      .upsert(rows, { onConflict: "cfdi_uuid" });
    if (error) return json({ error: error.message, errors }, 500);
    inserted = rows.length;
  }

  return json({ processed: files.length, inserted, errors });
});
