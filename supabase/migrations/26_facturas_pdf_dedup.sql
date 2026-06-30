-- ──────────────────────────────────────────────────────────────
-- 26_facturas_pdf_dedup.sql
-- Idempotencia para facturas que vienen de PDF (vía n8n + Hermes).
-- Los PDF extranjeros NO tienen `cfdi_uuid` (es null), así que el upsert por
-- `cfdi_uuid` (que usa la rama XML) no las deduplica. Igual que con los estados
-- de cuenta, agregamos una `dedup_key` determinista calculada en la app.
--
-- Índice único NO parcial (un único índice sirve de target para PostgREST
-- `onConflict=dedup_key`). Postgres permite múltiples NULL, así que las filas
-- XML (dedup_key null, deduplicadas por cfdi_uuid) no estorban.
--
-- ADITIVA. Aplicar a mano en el SQL editor.
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

COMMENT ON COLUMN public.facturas.dedup_key IS
  'Clave determinista para facturas SIN cfdi_uuid (PDF): '
  'PDF|emisor|folio|fecha|total|conceptos. Habilita upsert idempotente. '
  'NULL para CFDI XML (esos se deduplican por cfdi_uuid).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_dedup
  ON public.facturas (dedup_key);
