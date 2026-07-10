// Re-ingesta de estados de cuenta BBVA (PDF oficial) hacia
// `public.movimientos_bancarios`. Reutiliza EXACTAMENTE el parser de la Edge
// Function (supabase/functions/_shared/edocuenta.mjs). Inserta via service_role
// (omite RLS). Idempotente: upsert por dedup_key.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/reingest-edos.mjs [rutas...]
// Por defecto procesa rsc/estados-cuenta-correctos.
//
// La extraccion bytes->items (pdfjs) es la misma logica que corre en el browser;
// el parseo determinista lo hace el modulo compartido.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseEdoCuenta, itemsFromTextContent } from "../supabase/functions/_shared/edocuenta.mjs";

// Extrae los items de texto con coordenadas, pagina por pagina (mismo contrato
// que el frontend: { x, y, right, s }).
async function extractPdfPages(path) {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(itemsFromTextContent(tc));
  }
  return pages;
}

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

// ── recorrer .pdf ────────────────────────────────────────
function walkPdf(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkPdf(p, out);
    else if (name.toLowerCase().endsWith(".pdf")) out.push(p);
  }
  return out;
}

const targets = (process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["rsc/estados-cuenta-correctos"]
).map((t) => resolve(ROOT, t));

const files = targets.flatMap((t) => {
  try { return walkPdf(t); } catch { console.warn("No existe:", t); return []; }
});
console.log(`Encontrados ${files.length} PDF.`);

// ── parsear ──────────────────────────────────────────────
const rows = [];
const parseErrors = [];
for (const f of files) {
  try {
    const name = f.replace(ROOT + "/", "");
    const pages = await extractPdfPages(f);
    rows.push(...parseEdoCuenta(pages, name));
  } catch (e) {
    parseErrors.push({ file: f, msg: e.message });
  }
}
console.log(`Parseados ${rows.length} movimientos, errores de parseo ${parseErrors.length}.`);

// Deduplicar por dedup_key (upsert con onConflict no acepta duplicados en el lote).
const byKey = new Map();
for (const r of rows) byKey.set(r.dedup_key, r);
const unique = [...byKey.values()];
console.log(`Unicos por dedup_key: ${unique.length} (duplicados en lote: ${rows.length - unique.length}).`);

// ── upsert por lotes ─────────────────────────────────────
const BATCH = 100;
let inserted = 0;
for (let i = 0; i < unique.length; i += BATCH) {
  const batch = unique.slice(i, i + BATCH);
  const { error } = await supabase
    .from("movimientos_bancarios")
    .upsert(batch, { onConflict: "dedup_key" });
  if (error) {
    console.error(`Lote ${i / BATCH} fallo:`, error.message);
    process.exit(1);
  }
  inserted += batch.length;
  process.stdout.write(`\rUpsert ${inserted}/${unique.length}`);
}
console.log(`\nListo. Upsert ${inserted} movimientos.`);
if (parseErrors.length) {
  console.log("Errores de parseo:");
  for (const e of parseErrors.slice(0, 20)) console.log(" -", e.file, "→", e.msg);
}
