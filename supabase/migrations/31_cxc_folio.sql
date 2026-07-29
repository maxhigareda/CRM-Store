-- 31_cxc_folio.sql
-- Anexa el FOLIO (serie + folio) de la factura emitida a la vista de Cuentas por
-- Cobrar. `v_facturas_conciliacion` ya expone `f.*` (incluye serie/folio); aqui
-- solo los pasamos a traves de la vista de CxC para mostrarlos en la tabla.
-- Sin cambios de logica: mismo filtro (EMITIDA, tipo 'I', saldo pendiente) y
-- misma derivacion de credito que la migracion 29.

-- DROP + CREATE (no CREATE OR REPLACE): al insertar serie/folio despues de `id`
-- cambia el orden de columnas, y REPLACE solo permite anexar al final.
DROP VIEW IF EXISTS public.v_cuentas_por_cobrar;

CREATE VIEW public.v_cuentas_por_cobrar
WITH (security_invoker = on) AS
SELECT
    f.id,
    f.serie,
    f.folio,
    f.receptor,
    f.rfc_receptor,
    f.fecha,
    f.moneda,
    f.tipo_cambio,
    f.total,
    f.saldo_pendiente,
    f.estado_conciliacion,
    c.dias_credito,
    CASE WHEN c.dias_credito IS NOT NULL
         THEN (f.fecha::date + (c.dias_credito || ' days')::interval)::date
    END AS fecha_estimada_pago,
    CASE WHEN c.dias_credito IS NOT NULL
         THEN to_char((f.fecha::date + (c.dias_credito || ' days')::interval)::date, 'YYYY-MM')
    END AS mes_estimado_pago
FROM public.v_facturas_conciliacion f
LEFT JOIN public.catalogo_dias_credito c
       ON upper(btrim(f.receptor)) = upper(btrim(c.cliente))
WHERE f.tipo_factura = 'EMITIDA'
  AND f.tipo = 'I'
  AND f.saldo_pendiente > 0.005;
