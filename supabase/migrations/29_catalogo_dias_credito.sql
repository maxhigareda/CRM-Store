-- 29_catalogo_dias_credito.sql
-- Catalogo de DIAS DE CREDITO por cliente + vista de Cuentas por Cobrar (CxC).
--
-- Contexto: hoy la CxC del Dashboard estima el vencimiento con
-- `fecha + diasCredito(condiciones_pago)` y un DEFAULT de 30 dias cuando no hay
-- dato. Esta migracion introduce el termino de credito REAL por cliente para
-- calcular la fecha estimada de pago y bucketizar el saldo por el MES en que se
-- espera cobrar.
--
-- Matching (decision del usuario): la columna `cliente` del catalogo contiene
-- EXACTAMENTE el mismo texto que aparece en `facturas.receptor`
-- (p.ej. 'NESTLE DE PURINA' == receptor 'NESTLE DE PURINA'). El cruce es por
-- NOMBRE (normalizado a mayusculas/trim), NO por RFC. Un receptor que no exista
-- en el catalogo queda SIN termino (dias_credito NULL) y se segrega en la UI.
--
-- Convenciones del proyecto (ver migracion 27): PK SERIAL, sin `updated_at`,
-- solo `created_at`, valores de negocio los provee la app (sin defaults de DB),
-- estado calculado en VISTAS.

-- ── Catalogo ──────────────────────────────────────────────────────────────
CREATE TABLE public.catalogo_dias_credito (
    id           SERIAL PRIMARY KEY,
    cliente      TEXT NOT NULL,           -- == facturas.receptor (mismo texto)
    dias_credito INT  NOT NULL,           -- 0 = contado
    created_at   TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Un termino por cliente. Unico CASE-INSENSITIVE para que 'Nestle' y 'NESTLE'
-- no se dupliquen (el cruce con receptor tambien es case-insensitive).
CREATE UNIQUE INDEX uq_catalogo_dias_credito_cliente
    ON public.catalogo_dias_credito (upper(btrim(cliente)));

ALTER TABLE public.catalogo_dias_credito ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalogo dias credito manejable por autenticados"
    ON public.catalogo_dias_credito
    FOR ALL USING (auth.role() = 'authenticated');

-- ── Vista CxC ─────────────────────────────────────────────────────────────
-- EMITIDAS de ingreso (tipo 'I') con saldo pendiente, cruzadas con el catalogo.
-- Expone la derivacion de credito (dias, fecha y mes estimados de pago); la
-- normalizacion a MXN, el filtro de mes y la agregacion se hacen en la app
-- (mismo patron que el Dashboard). `dias_credito`/`fecha_estimada_pago`/
-- `mes_estimado_pago` quedan NULL cuando el receptor no esta en el catalogo.
CREATE OR REPLACE VIEW public.v_cuentas_por_cobrar
WITH (security_invoker = on) AS
SELECT
    f.id,
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
