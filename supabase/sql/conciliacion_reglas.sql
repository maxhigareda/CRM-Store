-- conciliacion_reglas.sql
-- Cascada determinista de conciliación: facturas <-> movimientos_bancarios.
-- Cada regla tiene un PREVIEW (SELECT, para revisar antes) y un APPLY (INSERT).
-- Correr en orden: Regla 1, luego Regla 2 — cada una solo ve lo que la anterior dejó pendiente.

-- ════════════════════════════════════════════════════════════════
-- REGLA 1 — FOLIO REFERENCIADO (la más confiable)
-- El banco menciona el folio de la factura en la descripción:
--   "SPEI RECIBIDOSANTANDER/... FACT A 2187", "... A2200", "... PROV REV 24654"
-- Empata serie+folio (con y sin espacio). Si el folio aparece, el monto
-- no necesita ser exacto: un pago parcial concilia con monto_aplicado = LEAST.
-- ════════════════════════════════════════════════════════════════

-- PREVIEW
WITH candidatos AS (
    SELECT f.id AS factura_id, m.id AS movimiento_id,
           f.serie || f.folio AS folio_ref, f.fecha AS fecha_factura, f.total,
           m.fecha AS fecha_pago, m.monto, m.descripcion, f.moneda
    FROM facturas f
    JOIN movimientos_bancarios m
      ON  m.moneda = f.moneda
      AND m.tipo_movimiento = CASE f.tipo_factura WHEN 'EMITIDA' THEN 'ABONO' ELSE 'CARGO' END
      AND m.fecha >= f.fecha
      AND (   m.descripcion ILIKE '%' || f.serie || f.folio || '%'          -- "A2187"
           OR m.descripcion ILIKE '%' || f.serie || ' ' || f.folio || '%')  -- "A 2187"
    WHERE f.total > 0                       -- excluye REP (tipo P, total=0)
      AND f.serie IS NOT NULL
      AND f.folio IS NOT NULL
      AND length(f.folio) >= 3              -- folios cortos generan falsos positivos
      AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.factura_id    = f.id)
      AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.movimiento_id = m.id)
)
SELECT * FROM candidatos c
WHERE (SELECT count(*) FROM candidatos x WHERE x.factura_id    = c.factura_id)    = 1
  AND (SELECT count(*) FROM candidatos x WHERE x.movimiento_id = c.movimiento_id) = 1
ORDER BY fecha_pago;

-- APPLY (descomenta cuando el preview se vea bien)
-- WITH candidatos AS (
--     SELECT f.id AS factura_id, m.id AS movimiento_id,
--            LEAST(f.total, m.monto) AS monto_aplicado, f.moneda
--     FROM facturas f
--     JOIN movimientos_bancarios m
--       ON  m.moneda = f.moneda
--       AND m.tipo_movimiento = CASE f.tipo_factura WHEN 'EMITIDA' THEN 'ABONO' ELSE 'CARGO' END
--       AND m.fecha >= f.fecha
--       AND (   m.descripcion ILIKE '%' || f.serie || f.folio || '%'
--            OR m.descripcion ILIKE '%' || f.serie || ' ' || f.folio || '%')
--     WHERE f.total > 0
--       AND f.serie IS NOT NULL
--       AND f.folio IS NOT NULL
--       AND length(f.folio) >= 3
--       AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.factura_id    = f.id)
--       AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.movimiento_id = m.id)
-- )
-- INSERT INTO conciliaciones (factura_id, movimiento_id, monto_aplicado, moneda, metodo, nota)
-- SELECT factura_id, movimiento_id, monto_aplicado, moneda, 'auto', 'regla 1: folio en descripcion'
-- FROM candidatos c
-- WHERE (SELECT count(*) FROM candidatos x WHERE x.factura_id    = c.factura_id)    = 1
--   AND (SELECT count(*) FROM candidatos x WHERE x.movimiento_id = c.movimiento_id) = 1;

-- ════════════════════════════════════════════════════════════════
-- REGLA 2 — MONTO EXACTO + VENTANA DE FECHA + CANDIDATO ÚNICO
-- Mismo monto al centavo, misma moneda, dirección correcta del dinero,
-- pago entre la fecha de la factura y 45 días después (ajustable; PPD
-- puede necesitar más). Solo concilia pares 1-a-1 sin ambigüedad.
-- ════════════════════════════════════════════════════════════════

-- PREVIEW
WITH candidatos AS (
    SELECT f.id AS factura_id, m.id AS movimiento_id,
           f.fecha AS fecha_factura, f.emisor, f.receptor, f.total,
           m.fecha AS fecha_pago, m.descripcion, f.moneda
    FROM facturas f
    JOIN movimientos_bancarios m
      ON  m.moneda = f.moneda
      AND m.monto  = f.total
      AND m.tipo_movimiento = CASE f.tipo_factura WHEN 'EMITIDA' THEN 'ABONO' ELSE 'CARGO' END
      AND m.fecha BETWEEN f.fecha AND f.fecha + 45
    WHERE f.total > 0
      AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.factura_id    = f.id)
      AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.movimiento_id = m.id)
)
SELECT * FROM candidatos c
WHERE (SELECT count(*) FROM candidatos x WHERE x.factura_id    = c.factura_id)    = 1
  AND (SELECT count(*) FROM candidatos x WHERE x.movimiento_id = c.movimiento_id) = 1
ORDER BY fecha_pago;

-- APPLY
-- WITH candidatos AS (
--     SELECT f.id AS factura_id, m.id AS movimiento_id, f.total, f.moneda
--     FROM facturas f
--     JOIN movimientos_bancarios m
--       ON  m.moneda = f.moneda
--       AND m.monto  = f.total
--       AND m.tipo_movimiento = CASE f.tipo_factura WHEN 'EMITIDA' THEN 'ABONO' ELSE 'CARGO' END
--       AND m.fecha BETWEEN f.fecha AND f.fecha + 45
--     WHERE f.total > 0
--       AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.factura_id    = f.id)
--       AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.movimiento_id = m.id)
-- )
-- INSERT INTO conciliaciones (factura_id, movimiento_id, monto_aplicado, moneda, metodo, nota)
-- SELECT factura_id, movimiento_id, total, moneda, 'auto', 'regla 2: monto exacto'
-- FROM candidatos c
-- WHERE (SELECT count(*) FROM candidatos x WHERE x.factura_id    = c.factura_id)    = 1
--   AND (SELECT count(*) FROM candidatos x WHERE x.movimiento_id = c.movimiento_id) = 1;

-- ════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — qué tanto conciliaron las reglas y qué queda
-- ════════════════════════════════════════════════════════════════

-- Cobertura de movimientos bancarios
SELECT estado_conciliacion, count(*) AS movimientos, sum(monto) AS monto_total
FROM v_movimientos_bancarios
GROUP BY estado_conciliacion;

-- Facturas aún sin conciliar (el residuo para AI / manual)
SELECT f.fecha, f.tipo_factura, f.serie, f.folio, f.emisor, f.receptor, f.moneda, f.total
FROM facturas f
WHERE f.total > 0
  AND NOT EXISTS (SELECT 1 FROM conciliaciones c WHERE c.factura_id = f.id)
ORDER BY f.fecha;

-- Movimientos aún pendientes (excluye ruido obvio: nómina, SAT, traspasos)
SELECT fecha, tipo_movimiento, monto, descripcion
FROM v_movimientos_bancarios
WHERE estado_conciliacion = 'pendiente'
ORDER BY fecha;
