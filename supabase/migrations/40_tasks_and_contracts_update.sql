-- ==============================================================================
-- MIGRACIÓN 40: Auto-Contenida y Definitiva: Directorio, Acuerdos, Contratos y Tasks
-- ==============================================================================

-- 1. Crear tabla project_directory_members (Paso 1 del Flujo PM) si no existe
CREATE TABLE IF NOT EXISTS public.project_directory_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    group_type VARCHAR(20) NOT NULL DEFAULT 'Store', -- 'Cliente' | 'Store'
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role_title VARCHAR(150) NOT NULL,
    secondary_role_title VARCHAR(150),
    location_country VARCHAR(100) DEFAULT 'México',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar columnas si la tabla ya existía previamente
ALTER TABLE public.project_directory_members
    ADD COLUMN IF NOT EXISTS secondary_role_title VARCHAR(150),
    ADD COLUMN IF NOT EXISTS location_country VARCHAR(100) DEFAULT 'México';

CREATE INDEX IF NOT EXISTS idx_directory_project_id ON public.project_directory_members(project_id);
CREATE INDEX IF NOT EXISTS idx_directory_role ON public.project_directory_members(role_title);

ALTER TABLE public.project_directory_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_read_all" ON public.project_directory_members;
CREATE POLICY "directory_read_all" ON public.project_directory_members
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "directory_manage_all" ON public.project_directory_members;
CREATE POLICY "directory_manage_all" ON public.project_directory_members
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- 2. Crear tabla project_agreements_pending (Paso 4 del Flujo PM) si no existe
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

-- 3. Columnas en projects (incluyendo contratos y baseline)
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS baseline_start_date DATE,
    ADD COLUMN IF NOT EXISTS stakeholder_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS payment_scheme VARCHAR(50) DEFAULT 'por_entregables',
    ADD COLUMN IF NOT EXISTS committed_roles_breakdown JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS contract_url TEXT,
    ADD COLUMN IF NOT EXISTS contract_number VARCHAR(100);

-- 4. Columnas en tasks (Plan de Trabajo)
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS progress_pct NUMERIC(5, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS auto_status VARCHAR(50) DEFAULT 'Por iniciar',
    ADD COLUMN IF NOT EXISTS required_role VARCHAR(150),
    ADD COLUMN IF NOT EXISTS directory_member_id UUID,
    ADD COLUMN IF NOT EXISTS has_risk BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS risk_id UUID;

-- Agregar foreign key a directory_members de manera segura
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_directory_member'
    ) THEN
        ALTER TABLE public.tasks 
        ADD CONSTRAINT fk_tasks_directory_member 
        FOREIGN KEY (directory_member_id) 
        REFERENCES public.project_directory_members(id) 
        ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_directory_member ON public.tasks(directory_member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_status ON public.tasks(auto_status);

-- 5. Recargar esquema en PostgREST inmediatamente
NOTIFY pgrst, 'reload schema';
