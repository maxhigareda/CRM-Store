-- 21_dashboard_financiero_rpc.sql
-- Agregación server-side para el Dashboard Financiero.
-- En vez de traer todas las facturas al navegador y sumar en JS, Postgres
-- calcula KPIs/series/tops y devuelve un único JSON ya agregado.
-- SECURITY INVOKER => respeta el RLS de public.facturas (corre como el usuario).

CREATE OR REPLACE FUNCTION public.dashboard_financiero(
    p_mes  text DEFAULT 'todos',   -- 'todos' | 'YYYY-MM'
    p_tipo text DEFAULT 'todas'    -- 'todas' | 'emitidas' | 'recibidas'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH base AS (
        -- Facturas con monto real (excluye complementos de pago y moneda XXX),
        -- aplicando los filtros de mes y tipo recibidos.
        SELECT *
        FROM public.facturas
        WHERE COALESCE(tipo, '')   <> 'P'
          AND COALESCE(moneda, '') <> 'XXX'
          AND total > 0
          AND (p_mes = 'todos' OR to_char(fecha, 'YYYY-MM') = p_mes)
          AND (
                p_tipo = 'todas'
             OR (p_tipo = 'emitidas'  AND tipo_factura = 'EMITIDA')
             OR (p_tipo = 'recibidas' AND tipo_factura = 'RECIBIDA')
          )
    ),
    kpis AS (
        SELECT
            COALESCE(SUM(total) FILTER (WHERE tipo_factura = 'EMITIDA'),  0) AS total_ingresos,
            COALESCE(SUM(total) FILTER (WHERE tipo_factura = 'RECIBIDA'), 0) AS total_gastos,
            COALESCE(SUM(GREATEST(total - subtotal, 0)), 0)                 AS iva_total,
            COUNT(*)                                                        AS num_facturas
        FROM base
    ),
    monthly AS (
        SELECT
            to_char(fecha, 'YYYY-MM') AS month,
            COALESCE(SUM(total) FILTER (WHERE tipo_factura = 'EMITIDA'),  0) AS ingresos,
            COALESCE(SUM(total) FILTER (WHERE tipo_factura = 'RECIBIDA'), 0) AS gastos
        FROM base
        WHERE fecha IS NOT NULL
        GROUP BY 1
    ),
    categorias AS (
        SELECT
            COALESCE(NULLIF(TRIM(categoria), ''), 'Sin categoría') AS categoria,
            SUM(total) AS total
        FROM base
        WHERE tipo_factura = 'RECIBIDA'
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 10
    ),
    proveedores AS (
        SELECT
            COALESCE(NULLIF(TRIM(emisor), ''), NULLIF(rfc_emisor, ''), 'Desconocido') AS emisor,
            SUM(total) AS total
        FROM base
        WHERE tipo_factura = 'RECIBIDA'
        GROUP BY 1
        ORDER BY total DESC
        LIMIT 8
    ),
    ultimas AS (
        -- Independiente de los filtros: siempre las 10 más recientes con monto.
        SELECT fecha, emisor, rfc_emisor, categoria, total, tipo_factura
        FROM public.facturas
        WHERE COALESCE(tipo, '') <> 'P' AND total > 0
        ORDER BY fecha DESC NULLS LAST
        LIMIT 10
    ),
    meses AS (
        -- Lista completa de meses con datos (para el dropdown), sin filtrar.
        SELECT DISTINCT to_char(fecha, 'YYYY-MM') AS m
        FROM public.facturas
        WHERE fecha IS NOT NULL
    )
    SELECT jsonb_build_object(
        'total_registros',   (SELECT count(*) FROM public.facturas),
        'kpis',              (SELECT to_jsonb(k) FROM kpis k),
        'monthly',           COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.month)          FROM monthly m),     '[]'::jsonb),
        'categorias',        COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.total DESC)      FROM categorias c),  '[]'::jsonb),
        'proveedores',       COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.total DESC)      FROM proveedores p), '[]'::jsonb),
        'ultimas',           COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.fecha DESC)      FROM ultimas u),     '[]'::jsonb),
        'meses_disponibles', COALESCE((SELECT jsonb_agg(m ORDER BY m)                          FROM meses),         '[]'::jsonb)
    );
$$;

GRANT EXECUTE ON FUNCTION public.dashboard_financiero(text, text) TO authenticated;
