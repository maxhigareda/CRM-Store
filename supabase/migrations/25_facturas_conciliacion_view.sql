-- ──────────────────────────────────────────────────────────────
-- 25_facturas_conciliacion_view.sql
-- Vista de apoyo para la conciliación bancaria MANUAL: estado y saldo
-- de cada factura calculados a partir de la tabla puente `conciliaciones`.
-- Espejo de `v_movimientos_bancarios` (migración 23) pero del lado factura.
--
-- El modelo NO cambia: `conciliaciones` (muchos-a-muchos factura<->movimiento)
-- ya soporta "varios movimientos -> 1 factura". Esta vista solo agrega el
-- estado CALCULADO (preferencia: estado en vistas, no en columnas).
--
-- ADITIVA. Aplicar a mano en el SQL editor.
-- ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_facturas_conciliacion;

CREATE VIEW public.v_facturas_conciliacion
WITH (security_invoker = on) AS
SELECT
    f.*,
    COALESCE(c.monto_conciliado, 0)                          AS monto_conciliado,
    COALESCE(f.total, 0) - COALESCE(c.monto_conciliado, 0)   AS saldo_pendiente,
    CASE
        WHEN COALESCE(c.monto_conciliado, 0) <= 0                      THEN 'pendiente'
        WHEN COALESCE(c.monto_conciliado, 0) < COALESCE(f.total, 0)    THEN 'parcial'
        ELSE 'conciliada'
    END AS estado_conciliacion
FROM public.facturas f
LEFT JOIN (
    SELECT factura_id, SUM(monto_aplicado) AS monto_conciliado
    FROM public.conciliaciones
    GROUP BY factura_id
) c ON c.factura_id = f.id;
