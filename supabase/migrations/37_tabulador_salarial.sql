-- =====================================================
-- Migración 37: Creación y Poblado de Tabla Tabulador
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tabulador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rol TEXT NOT NULL,
  seniority TEXT,
  costo_hora_usd NUMERIC(12, 2),
  costo_mensual_usd NUMERIC(12, 2),
  costo_hora_mxn NUMERIC(12, 2),
  costo_mensual_mxn NUMERIC(12, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_tabulador_rol ON public.tabulador (rol);
CREATE INDEX IF NOT EXISTS idx_tabulador_seniority ON public.tabulador (seniority);

-- RLS (Row Level Security)
ALTER TABLE public.tabulador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tabulador_read_policy" ON public.tabulador;
CREATE POLICY "tabulador_read_policy" ON public.tabulador
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "tabulador_admin_all" ON public.tabulador;
CREATE POLICY "tabulador_admin_all" ON public.tabulador
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Limpiar antes de poblar si ya existía
DELETE FROM public.tabulador;

-- Inserción de catálogo de costos por rol y nivel de seniority
INSERT INTO public.tabulador (rol, seniority, costo_hora_usd, costo_mensual_usd, costo_hora_mxn, costo_mensual_mxn) VALUES
  ('BI Visualization Developer', 'Junior (1-2)', 16.85, 2831.11, 337.00, 56622.20),
  ('BI Visualization Developer', 'Medium (3-5)', 24.58, 4128.70, 491.60, 82574.00),
  ('BI Visualization Developer', 'Senior (>5)', 31.60, 5308.33, 632.00, 106166.60),
  ('BI Visualization Developer', 'Expert (>10)', 34.41, 5780.19, 688.20, 115603.80),
  ('Azure Developer', 'Junior (1-2)', 18.43, 2949.07, 368.63, 58981.40),
  ('Azure Developer', 'Medium (3-5)', 24.58, 4128.70, 491.60, 82574.00),
  ('Azure Developer', 'Senior (>5)', 35.11, 5898.15, 702.20, 117963.00),
  ('Azure Developer', 'Expert (>10)', NULL, NULL, NULL, NULL),
  ('Solution Architect', 'Junior (1-2)', 25.80, 4128.70, 516.09, 82574.00),
  ('Solution Architect', 'Medium (3-5)', 31.60, 5308.33, 632.00, 106166.60),
  ('Solution Architect', 'Senior (>5)', 37.92, 6370.00, 758.40, 127400.00),
  ('Solution Architect', 'Expert (>10)', 43.60, 7962.50, 872.00, 159250.00),
  ('BI Data Architect', 'Junior (1-2)', 25.80, 4128.70, 516.09, 82574.00),
  ('BI Data Architect', 'Medium (3-5)', 31.60, 5308.33, 632.00, 106166.60),
  ('BI Data Architect', 'Senior (>5)', 37.92, 6370.00, 758.40, 127400.00),
  ('BI Data Architect', 'Expert (>10)', 43.60, 7325.50, 872.00, 146510.00),
  ('Data Engineer', 'Junior (1-2)', 24.58, 4128.70, 491.60, 82574.00),
  ('Data Engineer', 'Medium (3-5)', 29.49, 4954.44, 589.80, 99088.80),
  ('Data Engineer', 'Senior (>5)', 42.13, 7077.78, 842.60, 141555.60),
  ('Data Engineer', 'Expert (>10)', 44.24, 7431.67, 884.80, 148633.40),
  ('Data Scientist', 'Junior (1-2)', NULL, NULL, NULL, NULL),
  ('Data Scientist', 'Medium (3-5)', 30.90, 5190.37, 618.00, 103807.40),
  ('Data Scientist', 'Senior (>5)', 37.21, 6252.04, 744.20, 125040.80),
  ('Data Scientist', 'Expert (>10)', 44.66, 7502.44, 893.20, 150048.80),
  ('Data / Operations Analyst', 'Junior (1-2)', 16.85, 2831.11, 337.00, 56622.20),
  ('Data / Operations Analyst', 'Medium (3-5)', 21.06, 3538.89, 421.20, 70777.80),
  ('Data / Operations Analyst', 'Senior (>5)', 28.09, 4718.52, 561.80, 94370.40),
  ('Data / Operations Analyst', 'Expert (>10)', 32.30, 5426.30, 646.00, 108526.00),
  ('Data / Operations Analyst  Fin de Semana', NULL, NULL, NULL, 0.00, 0.00),
  ('Data / Operations Analyst  Madrugrada', NULL, NULL, NULL, 0.00, 0.00),
  ('Project / Product Manager', 'Medium (3-5)', 31.60, 5308.33, 632.00, 106166.60),
  ('Project / Product Manager', 'Senior (>5)', 34.41, 5780.19, 688.20, 115603.80),
  ('Business Analyst', 'Medium (3-5)', 25.80, 4128.70, 516.09, 82574.00),
  ('Low Code Developer', 'Junior (1-2)', 9.38, 1500.00, 187.50, 30000.00),
  ('Low Code Developer', 'Medium (3-5)', 22.11, 3538.00, 442.25, 70760.00),
  ('Low Code Developer', 'Senior (>5)', 25.80, 4128.00, 516.00, 82560.00),
  ('Low Code Developer', 'Expert (>10)', 33.18, 5308.00, 663.50, 106160.00),
  ('Power App / Streamlit Developer', 'Junior (1-2)', NULL, NULL, 0.00, 0.00),
  ('Power App / Streamlit Developer', 'Medium (3-5)', 25.80, 4128.00, 516.00, 82560.00),
  ('Power App / Streamlit Developer', 'Senior (>5)', 33.18, 5308.00, 663.50, 106160.00),
  ('Power App / Streamlit Developer', 'Expert (>10)', 39.08, 6252.00, 781.50, 125040.00);
