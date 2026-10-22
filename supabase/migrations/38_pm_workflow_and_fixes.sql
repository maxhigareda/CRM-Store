-- ==============================================================================
-- MIGRACIÓN 38: Flujo PM (Directorio, Acuerdos/Pendientes) y Fixes de Proyectos
-- ==============================================================================

-- 1. Asegurar columnas faltantes en projects
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS baseline_start_date DATE,
    ADD COLUMN IF NOT EXISTS stakeholder_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS payment_scheme VARCHAR(50) DEFAULT 'por_entregables',
    ADD COLUMN IF NOT EXISTS committed_roles_breakdown JSONB DEFAULT '[]'::jsonb;

-- 2. Paso 1: Directorio del Proyecto (Stakeholders y Equipo Store)
CREATE TABLE IF NOT EXISTS public.project_directory_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    group_type VARCHAR(20) NOT NULL DEFAULT 'Store', -- 'Cliente' | 'Store'
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role_title VARCHAR(150) NOT NULL,
    location_country VARCHAR(100) DEFAULT 'México',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directory_project_id ON public.project_directory_members(project_id);
CREATE INDEX IF NOT EXISTS idx_directory_role ON public.project_directory_members(role_title);

ALTER TABLE public.project_directory_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_read_all" ON public.project_directory_members;
CREATE POLICY "directory_read_all" ON public.project_directory_members
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "directory_manage_all" ON public.project_directory_members;
CREATE POLICY "directory_manage_all" ON public.project_directory_members
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 3. Paso 4: Acuerdos y Pendientes del Proyecto
CREATE TABLE IF NOT EXISTS public.project_agreements_pending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL DEFAULT 'Acuerdo', -- 'Acuerdo' | 'Pendiente'
    title TEXT NOT NULL,
    link_type VARCHAR(50) NOT NULL DEFAULT 'general', -- 'general' | 'entregable' | 'tarea'
    deliverable_id UUID REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    responsible_member_id UUID REFERENCES public.project_directory_members(id) ON DELETE SET NULL,
    responsible_name TEXT,
    deadline DATE,
    non_compliance_impact TEXT,
    status VARCHAR(30) DEFAULT 'abierto', -- 'abierto' | 'cumplido'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agreements_project_id ON public.project_agreements_pending(project_id);

ALTER TABLE public.project_agreements_pending ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agreements_read_all" ON public.project_agreements_pending;
CREATE POLICY "agreements_read_all" ON public.project_agreements_pending
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "agreements_manage_all" ON public.project_agreements_pending;
CREATE POLICY "agreements_manage_all" ON public.project_agreements_pending
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 4. Extensión de columnas en tasks para Paso 3
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS auto_status VARCHAR(50) DEFAULT 'Por iniciar',
    ADD COLUMN IF NOT EXISTS directory_member_id UUID REFERENCES public.project_directory_members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS has_risk BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS risk_id UUID REFERENCES public.project_risks(id) ON DELETE SET NULL;
