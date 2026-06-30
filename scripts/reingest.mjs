// Re-ingesta masiva de CFDI hacia `public.facturas` con el modelo nuevo.
// Reutiliza EXACTAMENTE el parser de la Edge Function (supabase/functions/_shared/cfdi.mjs).
// Inserta via service_role (omite RLS). Idempotente: upsert por cfdi_uuid.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/reingest.mjs [rutas...]
// Por defecto procesa rsc/emitidas y rsc/recibidas.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseCfdiXml } from "../supabase/functions/_shared/cfdi.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── credenciales ─────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env */ }
  return env;
}
const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (env).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── recorrer xml ─────────────────────────────────────────
function walkXml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkXml(p, out);
    else if (name.toLowerCase().endsWith(".xml")) out.push(p);
  }
  return out;
}

const targets = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["rsc/emitidas", "rsc/recibidas"]
).map((t) => resolve(ROOT, t));

const files = targets.flatMap((t) => {
  try { return walkXml(t); } catch { console.warn("No existe:", t); return []; }
});
console.log(`Encontrados ${files.length} XML.`);

// ── parsear ──────────────────────────────────────────────
const rows = [];
const parseErrors = [];
for (const f of files) {
  try {
    rows.push(parseCfdiXml(readFileSync(f, "utf8"), f.replace(ROOT + "/", "")));
  } catch (e) {
    parseErrors.push({ file: f, msg: e.message });
  }
}
console.log(`Parseados ${rows.length}, errores de parseo ${parseErrors.length}.`);

// Deduplicar por cfdi_uuid (upsert con onConflict no acepta duplicados en el mismo lote).
const byUuid = new Map();
let sinUuid = 0;
for (const r of rows) {
  if (!r.cfdi_uuid) { sinUuid++; continue; }
  byUuid.set(r.cfdi_uuid, r);
}
const unique = [...byUuid.values()];
console.log(`Unicos por UUID: ${unique.length} (sin UUID descartados: ${sinUuid}).`);

// ── upsert por lotes ─────────────────────────────────────
const BATCH = 100;
let inserted = 0;
for (let i = 0; i < unique.length; i += BATCH) {
  const batch = unique.slice(i, i + BATCH);
  const { error } = await supabase
    .from("facturas")
    .upsert(batch, { onConflict: "cfdi_uuid" });
  if (error) {
    console.error(`Lote ${i / BATCH} fallo:`, error.message);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\rUpsert ${inserted}/${unique.length}`);
}
console.log(`\nListo. Upsert ${inserted} facturas.`);
if (parseErrors.length) {
  console.log("Errores de parseo:");
  for (const e of parseErrors.slice(0, 20)) console.log(" -", e.file, "→", e.msg);
}
