-- ==============================================================================
-- MIGRACIÓN 40: Contratos en Proyectos, Columnas Extendidas en Tasks y Etapas
-- ==============================================================================

-- 1. Contrato opcional en proyectos
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS contract_url TEXT,
    ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100);

-- 2. Atributos extendidos en tasks para Plan de Trabajo (Paso 3)
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS auto_status VARCHAR(50) DEFAULT 'Por iniciar',
    ADD COLUMN IF NOT EXISTS required_role VARCHAR(150),
    ADD COLUMN IF NOT EXISTS directory_member_id UUID REFERENCES public.project_directory_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS has_risk BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS risk_id UUID REFERENCES public.project_risks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_directory_member ON public.tasks(directory_member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_status ON public.tasks(auto_status);

-- 3. Notificar a PostgREST para recargar el schema cache inmediatamente
NOTIFY pgrst, 'reload schema';
