-- ──────────────────────────────────────────────────────────────
-- 30_reset_movimientos.sql
-- Reset LIMPIO de estados de cuenta para re-cargar desde los PDF oficiales
-- (fuente original sin modificar) con el nuevo parser `procesar-edo-cuenta`.
--
-- DESTRUCTIVO. Aplicar A MANO en el SQL editor (no hay Supabase CLI versionado).
--
-- `conciliaciones` tiene FK a `movimientos_bancarios` con ON DELETE CASCADE:
-- vaciar los movimientos invalida cualquier conciliacion factura<->movimiento
-- previa (los IDs SERIAL cambian al recargar), asi que se limpian ambas.
-- ──────────────────────────────────────────────────────────────

TRUNCATE TABLE public.conciliaciones, public.movimientos_bancarios RESTART IDENTITY CASCADE;
