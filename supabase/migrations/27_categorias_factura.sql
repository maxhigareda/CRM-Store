-- 27_categorias_factura.sql
-- Catalogo de categorias (labels) para clasificar facturas.
--
-- Filosofia: este catalogo SOLO alimenta el dropdown de la UI. NO hay integridad
-- referencial contra `public.facturas`: la columna `facturas.categoria` sigue
-- siendo TEXTO ABIERTO. El catalogo restringe lo que el usuario puede ELEGIR al
-- clasificar (no escribe libre), pero el valor final se guarda como texto plano.
-- Asi, borrar o renombrar una categoria aqui NO rompe ni altera las facturas ya
-- clasificadas.
--
-- Convenciones del proyecto: PK SERIAL, sin `updated_at`, solo `created_at`,
-- valores de negocio (nombre/color) los provee la app (sin defaults de DB).

CREATE TABLE public.categorias_factura (
    id         SERIAL PRIMARY KEY,
    nombre     TEXT NOT NULL UNIQUE,
    color      TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS: mismo patron que el resto del modulo Financiero.
ALTER TABLE public.categorias_factura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categorias factura manejables por autenticados" ON public.categorias_factura
    FOR ALL USING (auth.role() = 'authenticated');
