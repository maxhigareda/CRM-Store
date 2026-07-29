-- Migración 22: RPC candidatos_conciliacion
-- Solo lectura. Genera candidatos de movimientos ABONO para una factura EMITIDA.
-- La tabla public.conciliaciones ya existe (DDL aplicado previamente).
-- Aplicar en Supabase SQL Editor (rol Developer).

CREATE OR REPLACE FUNCTION public.candidatos_conciliacion(p_factura_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH f AS (
    SELECT id, total, moneda, fecha, folio, serie, receptor, rfc_receptor
    FROM public.facturas
    WHERE id = p_factura_id AND tipo_factura = 'EMITIDA'
  ),
  -- saldo ya conciliado de la propia factura
  fc AS (
    SELECT COALESCE(SUM(monto_aplicado), 0) AS conciliado
    FROM public.conciliaciones
    WHERE factura_id = p_factura_id
  ),
  -- monto ya conciliado por movimiento (desde tabla base, sin vista)
  mc AS (
    SELECT movimiento_id, SUM(monto_aplicado) AS monto_conciliado
    FROM public.conciliaciones
    GROUP BY movimiento_id
  ),
  cand AS (
    SELECT
      m.id,
      m.fecha,
      m.descripcion,
      m.referencia,
      m.monto,
      m.moneda,
      COALESCE(mc.monto_conciliado, 0)              AS monto_conciliado,
      (m.monto - COALESCE(mc.monto_conciliado, 0))  AS saldo_disponible,
      abs(m.monto - (SELECT total FROM f))           AS dif_monto,
      abs(m.fecha - (SELECT fecha FROM f))           AS dif_dias
    FROM public.movimientos_bancarios m
    CROSS JOIN f
    LEFT JOIN mc ON mc.movimiento_id = m.id
    WHERE m.tipo_movimiento = 'ABONO'
      AND m.moneda = f.moneda
      AND (m.monto - COALESCE(mc.monto_conciliado, 0)) > 0   -- con saldo libre
      AND m.fecha BETWEEN f.fecha - INTERVAL '5 days'
                      AND f.fecha + INTERVAL '120 days'
    ORDER BY dif_monto ASC, dif_dias ASC
    LIMIT 25
  )
  SELECT jsonb_build_object(
    'factura',       (SELECT to_jsonb(f) FROM f),
    'factura_saldo', (SELECT total FROM f) - (SELECT conciliado FROM fc),
    'candidatos',    COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM cand c), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.candidatos_conciliacion(uuid) TO authenticated;
