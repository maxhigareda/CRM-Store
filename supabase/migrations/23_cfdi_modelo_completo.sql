-- 23_cfdi_modelo_completo.sql
-- Reingenieria del modelo Financiero: captura SIN PERDIDA del CFDI 4.0.
--
-- Filosofia: UNA sola fila de `public.facturas` == UN archivo XML completo.
-- Lo escalar (atributos del comprobante, emisor/receptor, totales) va en columnas;
-- lo anidado o repetido (impuestos, complemento de PAGO con sus documentos
-- relacionados, complemento de NOMINA, CFDIs relacionados) va en columnas JSONB.
-- Asi no se pierde nada del XML y el modelo se mantiene simple y legible.
--
-- Convenciones:
--   * PK = SERIAL (INT), para no confundir con el GUID propio del CFDI (`cfdi_uuid`).
--   * Conceptos NO se desglosan: se concatenan en `conceptos` (contexto para LLM).
--   * Estado calculado en vistas, sin `updated_at`.
--
-- NOTA: recrea `facturas` (cambia el tipo de PK), por lo que tambien recrea
-- `conciliaciones` y la vista `v_movimientos_bancarios`. Pensado para wipe & reload.

-- ──────────────────────────────────────────────
-- 0. Tirar objetos dependientes (orden inverso de dependencia)
-- ──────────────────────────────────────────────
DROP VIEW  IF EXISTS public.v_facturas_saldo;
DROP VIEW  IF EXISTS public.v_movimientos_bancarios;
DROP TABLE IF EXISTS public.conciliaciones        CASCADE;
DROP TABLE IF EXISTS public.facturas              CASCADE;
DROP TABLE IF EXISTS public.movimientos_bancarios CASCADE;

-- ──────────────────────────────────────────────
-- 1. Facturas — 1 fila = 1 XML CFDI completo
-- ──────────────────────────────────────────────
CREATE TABLE public.facturas (
    id              SERIAL PRIMARY KEY,

    -- Identidad fiscal (CFDI). Nullable: las facturas extranjeras en PDF no tienen UUID del SAT.
    cfdi_uuid       UUID UNIQUE,

    -- Clasificacion del comprobante
    tipo_factura    TEXT NOT NULL CHECK (tipo_factura IN ('EMITIDA', 'RECIBIDA')),
    tipo            TEXT,            -- CFDI TipoDeComprobante: I, E, P, N, T
    formato_origen  TEXT CHECK (formato_origen IN ('XML', 'PDF')),
    version         TEXT,            -- 4.0

    -- Fechas
    fecha           DATE,
    fecha_timbrado  DATE,

    -- Folios
    serie           TEXT,
    folio           TEXT,

    -- Partes
    emisor                    TEXT,
    rfc_emisor                TEXT,
    regimen_fiscal_emisor     TEXT,
    receptor                  TEXT,
    rfc_receptor              TEXT,
    regimen_fiscal_receptor   TEXT,
    domicilio_fiscal_receptor TEXT,

    -- Detalle fiscal del comprobante
    uso_cfdi         TEXT,
    moneda           TEXT,            -- MXN, USD, BRL, XXX
    tipo_cambio      NUMERIC(18,6),   -- FX del comprobante (USD/EUR); se perdia antes
    subtotal         NUMERIC(14,2),
    descuento        NUMERIC(14,2),
    total            NUMERIC(14,2),
    forma_pago       TEXT,
    metodo_pago      TEXT,            -- PUE, PPD
    condiciones_pago TEXT,
    exportacion      TEXT,
    lugar_expedicion TEXT,

    -- Impuestos: totales escalares + detalle JSONB
    total_impuestos_trasladados NUMERIC(14,2),
    total_impuestos_retenidos   NUMERIC(14,2),
    impuestos                   JSONB,   -- [{tipo, base, impuesto, tipo_factor, tasa_o_cuota, importe}]

    -- Complementos (lo que antes se perdia por completo)
    complemento_pago  JSONB,   -- {totales:{...}, pagos:[{...campos, docs_relacionados:[{...}]}]}
    nomina            JSONB,   -- {tipo_nomina, fechas, totales, empleado:{...}, percepciones:[], deducciones:[], otros_pagos:[]}
    cfdi_relacionados JSONB,   -- {tipo_relacion, uuids:[...]}

    -- Conceptos concatenados (solo contexto para clasificacion/auditoria con LLM)
    conceptos       TEXT,
    categoria       TEXT,            -- clasificacion aplazada; se llena despues

    archivo_origen  TEXT,            -- nombre del XML procesado

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_facturas_fecha         ON public.facturas (fecha);
CREATE INDEX idx_facturas_tipo_factura  ON public.facturas (tipo_factura);
CREATE INDEX idx_facturas_tipo          ON public.facturas (tipo);
CREATE INDEX idx_facturas_rfc_emisor    ON public.facturas (rfc_emisor);
CREATE INDEX idx_facturas_rfc_receptor  ON public.facturas (rfc_receptor);
CREATE INDEX idx_facturas_moneda        ON public.facturas (moneda);
-- Indice GIN para consultar dentro del complemento de pago (conciliacion)
CREATE INDEX idx_facturas_comp_pago_gin ON public.facturas USING GIN (complemento_pago);

-- ──────────────────────────────────────────────
-- 2. Movimientos bancarios (estados de cuenta, MXN y USD) — recreada con PK SERIAL
-- ──────────────────────────────────────────────
CREATE TABLE public.movimientos_bancarios (
    id              SERIAL PRIMARY KEY,

    banco           TEXT,
    cuenta          TEXT,
    moneda          TEXT NOT NULL CHECK (moneda IN ('MXN', 'USD')),

    fecha           DATE NOT NULL,
    descripcion     TEXT,
    referencia      TEXT,

    tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('CARGO', 'ABONO')),
    monto           NUMERIC(14,2) NOT NULL,   -- siempre positivo; el signo lo da tipo_movimiento
    saldo           NUMERIC(14,2),

    archivo_origen  TEXT,

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_movbanc_fecha  ON public.movimientos_bancarios (fecha);
CREATE INDEX idx_movbanc_moneda ON public.movimientos_bancarios (moneda);

-- ──────────────────────────────────────────────
-- 3. Conciliaciones (recreada: factura_id y movimiento_id ahora son INT)
--    Puente factura <-> movimiento bancario, muchos-a-muchos.
-- ──────────────────────────────────────────────
CREATE TABLE public.conciliaciones (
    id              SERIAL PRIMARY KEY,
    factura_id      INT NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
    movimiento_id   INT NOT NULL REFERENCES public.movimientos_bancarios(id) ON DELETE CASCADE,

    monto_aplicado  NUMERIC(14,2) NOT NULL,
    moneda          TEXT,
    metodo          TEXT DEFAULT 'manual' CHECK (metodo IN ('auto', 'manual')),
    conciliado_por  UUID REFERENCES public.profiles(id),
    nota            TEXT,

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    UNIQUE (factura_id, movimiento_id)
);

CREATE INDEX idx_concil_factura     ON public.conciliaciones (factura_id);
CREATE INDEX idx_concil_movimiento  ON public.conciliaciones (movimiento_id);

-- ──────────────────────────────────────────────
-- 4. Vista: estado de conciliacion CALCULADO de movimientos (igual que migracion 20)
-- ──────────────────────────────────────────────
CREATE VIEW public.v_movimientos_bancarios
WITH (security_invoker = on) AS
SELECT
    m.*,
    COALESCE(c.monto_conciliado, 0) AS monto_conciliado,
    CASE
        WHEN COALESCE(c.monto_conciliado, 0) <= 0      THEN 'pendiente'
        WHEN COALESCE(c.monto_conciliado, 0) < m.monto THEN 'parcial'
        ELSE 'conciliada'
    END AS estado_conciliacion
FROM public.movimientos_bancarios m
LEFT JOIN (
    SELECT movimiento_id, SUM(monto_aplicado) AS monto_conciliado
    FROM public.conciliaciones
    GROUP BY movimiento_id
) c ON c.movimiento_id = m.id;

-- ──────────────────────────────────────────────
-- 5. Vista: saldo CALCULADO de facturas a partir del complemento de pago (REP)
--    Expande el JSONB de los comprobantes tipo P y suma lo pagado por UUID.
-- ──────────────────────────────────────────────
CREATE VIEW public.v_facturas_saldo
WITH (security_invoker = on) AS
SELECT
    f.*,
    COALESCE(p.monto_pagado, 0) AS monto_pagado,
    (COALESCE(f.total, 0) - COALESCE(p.monto_pagado, 0)) AS saldo,
    CASE
        WHEN COALESCE(p.monto_pagado, 0) <= 0                   THEN 'pendiente'
        WHEN COALESCE(p.monto_pagado, 0) < COALESCE(f.total, 0) THEN 'parcial'
        ELSE 'pagada'
    END AS estado_pago
FROM public.facturas f
LEFT JOIN (
    SELECT
        (dr->>'id_documento')::uuid       AS id_documento,
        SUM((dr->>'imp_pagado')::numeric) AS monto_pagado
    FROM public.facturas rep
    CROSS JOIN LATERAL jsonb_array_elements(rep.complemento_pago->'pagos')      AS pago
    CROSS JOIN LATERAL jsonb_array_elements(pago->'docs_relacionados')          AS dr
    WHERE rep.tipo = 'P'
      AND rep.complemento_pago IS NOT NULL
      AND (dr->>'id_documento') IS NOT NULL
    GROUP BY (dr->>'id_documento')::uuid
) p ON p.id_documento = f.cfdi_uuid;

-- ──────────────────────────────────────────────
-- 6. RLS (mismo patron que migracion 20)
-- ──────────────────────────────────────────────
ALTER TABLE public.facturas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_bancarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conciliaciones        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Facturas manejables por autenticados" ON public.facturas
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Movimientos manejables por autenticados" ON public.movimientos_bancarios
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Conciliaciones manejables por autenticados" ON public.conciliaciones
    FOR ALL USING (auth.role() = 'authenticated');
