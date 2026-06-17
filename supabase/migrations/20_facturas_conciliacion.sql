-- 20_facturas_conciliacion.sql
-- Modelo contable: facturas, movimientos bancarios y su conciliacion.

-- ──────────────────────────────────────────────
-- 1. Facturas (emitidas y recibidas) — espeja el concentrado del Sheet
-- ──────────────────────────────────────────────
CREATE TABLE public.facturas (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    -- Identidad fiscal (CFDI). Nullable: las facturas extranjeras en PDF no tienen UUID del SAT.
    cfdi_uuid       UUID UNIQUE,

    -- Clasificacion del comprobante
    tipo_factura    TEXT NOT NULL CHECK (tipo_factura IN ('EMITIDA', 'RECIBIDA')),
    tipo            TEXT,            -- CFDI tipo de comprobante: I, E, P, N, T
    formato_origen  TEXT CHECK (formato_origen IN ('XML', 'PDF')),

    -- Fechas
    fecha           DATE,
    fecha_timbrado  DATE,

    -- Folios
    serie           TEXT,
    folio           TEXT,

    -- Partes
    emisor          TEXT,
    rfc_emisor      TEXT,
    receptor        TEXT,
    rfc_receptor    TEXT,

    -- Detalle fiscal
    uso_cfdi        TEXT,
    moneda          TEXT,            -- MXN, USD, BRL, XXX
    subtotal        NUMERIC(14,2),
    total           NUMERIC(14,2),
    forma_pago      TEXT,
    metodo_pago     TEXT,            -- PUE, PPD
    conceptos       TEXT,
    categoria       TEXT,

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_facturas_fecha         ON public.facturas (fecha);
CREATE INDEX idx_facturas_tipo_factura  ON public.facturas (tipo_factura);
CREATE INDEX idx_facturas_rfc_emisor    ON public.facturas (rfc_emisor);
CREATE INDEX idx_facturas_rfc_receptor  ON public.facturas (rfc_receptor);
CREATE INDEX idx_facturas_moneda        ON public.facturas (moneda);

-- ──────────────────────────────────────────────
-- 2. Movimientos bancarios (estados de cuenta, en USD y MXN)
-- ──────────────────────────────────────────────
CREATE TABLE public.movimientos_bancarios (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

    banco           TEXT,
    cuenta          TEXT,            -- ultimos digitos / alias de la cuenta
    moneda          TEXT NOT NULL CHECK (moneda IN ('MXN', 'USD')),

    fecha           DATE NOT NULL,
    descripcion     TEXT,            -- concepto del estado de cuenta
    referencia      TEXT,

    tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('CARGO', 'ABONO')),
    monto           NUMERIC(14,2) NOT NULL,   -- siempre positivo; el signo lo da tipo_movimiento
    saldo           NUMERIC(14,2),            -- opcional, si el estado de cuenta lo trae

    archivo_origen  TEXT,            -- nombre/ref del estado de cuenta cargado

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_movbanc_fecha   ON public.movimientos_bancarios (fecha);
CREATE INDEX idx_movbanc_moneda  ON public.movimientos_bancarios (moneda);

-- ──────────────────────────────────────────────
-- 3. Conciliaciones (puente factura <-> movimiento bancario, muchos-a-muchos)
--    Un pago PPD puede cubrir varias facturas; una factura puede pagarse en parcialidades.
-- ──────────────────────────────────────────────
CREATE TABLE public.conciliaciones (
    id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    factura_id      UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
    movimiento_id   UUID NOT NULL REFERENCES public.movimientos_bancarios(id) ON DELETE CASCADE,

    monto_aplicado  NUMERIC(14,2) NOT NULL,
    moneda          TEXT,            -- debe coincidir con la moneda de ambas partes
    metodo          TEXT DEFAULT 'manual' CHECK (metodo IN ('auto', 'manual')),
    conciliado_por  UUID REFERENCES public.profiles(id),
    nota            TEXT,

    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    UNIQUE (factura_id, movimiento_id)
);

CREATE INDEX idx_concil_factura     ON public.conciliaciones (factura_id);
CREATE INDEX idx_concil_movimiento  ON public.conciliaciones (movimiento_id);

-- ──────────────────────────────────────────────
-- 4. Vista: estado de conciliacion CALCULADO para movimientos bancarios
--    security_invoker => respeta el RLS de la tabla base.
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
-- 5. RLS (mismo patron que el resto del esquema)
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
