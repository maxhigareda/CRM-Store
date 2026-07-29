-- ──────────────────────────────────────────────────────────────
-- 24_movimientos_dedup.sql
-- Idempotencia para la ingesta de estados de cuenta (Edge Function
-- `procesar-edo-cuenta`). A diferencia de un CFDI, un movimiento bancario
-- NO trae UUID, asi que necesitamos una clave determinista para upsert.
--
-- ADITIVA: solo agrega columna + indice unico. No recrea la tabla.
-- Aplicar a mano en el SQL editor (no hay Supabase CLI versionado).
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

COMMENT ON COLUMN public.movimientos_bancarios.dedup_key IS
  'Clave determinista calculada en el parser (_shared/edocuenta.mjs): '
  'moneda|fecha|tipo|monto|saldo|concepto. Habilita upsert idempotente '
  'sin UUID. Re-subir el mismo edo. de cuenta no duplica.';

-- UNIQUE necesario para `upsert(..., { onConflict: "dedup_key" })`.
-- Postgres permite multiples NULL, asi que filas viejas sin clave no estorban.
CREATE UNIQUE INDEX IF NOT EXISTS uq_movbanc_dedup
  ON public.movimientos_bancarios (dedup_key);
