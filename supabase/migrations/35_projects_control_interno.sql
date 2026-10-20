-- ==============================================================================
-- MIGRACIÓN 35: Control Interno y Rentabilidad de Proyectos
-- ==============================================================================

-- 1. Sede y Festivos por Cliente
CREATE TABLE IF NOT EXISTS public.location_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    country_code VARCHAR(10) DEFAULT 'MX',
    holiday_date DATE NOT NULL,
    holiday_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabulador de Costos Estimados por Rol (para cálculo de margen de presupuesto)
CREATE TABLE IF NOT EXISTS public.cost_rates_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name VARCHAR(100) NOT NULL,
    seniority VARCHAR(50) DEFAULT 'Mid',
    hourly_rate_estimated NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'MXN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Compensación Real Confidencial (Extensión / Contrato Talent Flow)
CREATE TABLE IF NOT EXISTS public.talent_resource_compensation (
    profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    monthly_salary NUMERIC(12, 2) NOT NULL,
    benefits_multiplier NUMERIC(4, 2) DEFAULT 1.30,
    real_hourly_cost NUMERIC(12, 2) GENERATED ALWAYS AS ((monthly_salary * benefits_multiplier) / 160.0) STORED,
    monthly_target_hours INT DEFAULT 160,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Extensión de Proyectos (Campos Comerciales, Stakeholders y Esquema de Pagos)
ALTER TABLE public.projects 
    ADD COLUMN IF NOT EXISTS target_margin_pct NUMERIC(5, 2) DEFAULT 35.0,
    ADD COLUMN IF NOT EXISTS quoted_budget NUMERIC(14, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS quoted_hours NUMERIC(10, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS baseline_start_date DATE,
    ADD COLUMN IF NOT EXISTS baseline_end_date DATE,
    ADD COLUMN IF NOT EXISTS current_projected_end_date DATE,
    ADD COLUMN IF NOT EXISTS pm_id UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS stakeholder_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_scheme VARCHAR(50) DEFAULT 'por_entregables', -- 'exhibicion_unica' | 'por_entregables'
    ADD COLUMN IF NOT EXISTS current_baseline_version INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS google_drive_folder_url TEXT,
    ADD COLUMN IF NOT EXISTS stage VARCHAR(50) DEFAULT 'arranque'; -- 'arranque', 'discovery', 'ejecucion', 'cierre', 'sustain'

-- 5. Múltiples POs (Purchase Orders) por Proyecto
CREATE TABLE IF NOT EXISTS public.project_pos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    po_number VARCHAR(100) NOT NULL,
    po_amount NUMERIC(14, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'MXN',
    document_url TEXT,
    is_mismatch_with_quote BOOLEAN DEFAULT FALSE,
    mismatch_justification TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Entregables del Proyecto (con Peso % para avance real ponderado)
CREATE TABLE IF NOT EXISTS public.project_deliverables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    weight_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, review, accepted
    acceptance_criteria TEXT,
    acceptance_proof_url TEXT,
    baseline_start_date DATE,
    baseline_end_date DATE,
    current_end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Extensiones de Tareas (`tasks` existente)
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(8, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(8, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS baseline_start_date DATE,
    ADD COLUMN IF NOT EXISTS baseline_end_date DATE,
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS block_reason TEXT,
    ADD COLUMN IF NOT EXISTS required_role VARCHAR(100);

-- 8. Bitácora de Horas Reales (Timesheets)
CREATE TABLE IF NOT EXISTS public.task_time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    hours_logged NUMERIC(5, 2) NOT NULL CHECK (hours_logged > 0 AND hours_logged <= 24),
    description TEXT,
    hourly_rate_snapshot NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Matriz de Riesgos
CREATE TABLE IF NOT EXISTS public.project_risks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    deliverable_id UUID REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    probability VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'identified', -- identified, mitigated, materialized, resolved
    mitigation_plan TEXT,
    responsible_id UUID REFERENCES public.profiles(id),
    materialized_impact_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Control de Cambios (Change Requests / Adendas)
CREATE TABLE IF NOT EXISTS public.project_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    change_number INT NOT NULL,
    requested_by VARCHAR(150) NOT NULL,
    approved_by UUID REFERENCES public.profiles(id),
    reason TEXT NOT NULL,
    scope_change_summary TEXT,
    exchanged_deliverable_id UUID REFERENCES public.project_deliverables(id),
    budget_impact NUMERIC(14, 2) DEFAULT 0.0,
    time_impact_days INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
    approved_at TIMESTAMPTZ,
    new_baseline_version INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Hitos de Facturación y Cobranza (vinculado a facturas.id bigint)
CREATE TABLE IF NOT EXISTS public.project_payment_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    po_id UUID REFERENCES public.project_pos(id) ON DELETE SET NULL,
    deliverable_id UUID REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    percentage NUMERIC(5, 2) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    trigger_condition VARCHAR(100) NOT NULL, -- 'contra_entrega', 'anticipo', 'fecha_fija'
    estimated_invoice_date DATE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, ready_to_bill, invoiced, paid, overdue
    factura_id BIGINT REFERENCES public.facturas(id) ON DELETE SET NULL,
    sat_uuid VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Pase a Sustain (Acta de Transferencia a Operaciones)
CREATE TABLE IF NOT EXISTS public.project_sustain_handoff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    support_contract_url TEXT,
    support_quote_url TEXT,
    support_scope_description TEXT NOT NULL,
    monitoring_analyst_id UUID REFERENCES public.profiles(id),
    data_eng_changes_scope TEXT,
    pbi_changes_scope TEXT,
    additional_notes TEXT,
    supported_products_census JSONB DEFAULT '[]'::jsonb,
    documentation_urls JSONB DEFAULT '[]'::jsonb,
    acceptance_act_url TEXT,
    handoff_approved_by UUID REFERENCES public.profiles(id),
    handoff_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Comentarios Transversales
CREATE TABLE IF NOT EXISTS public.entity_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    author_id UUID NOT NULL REFERENCES public.profiles(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Vincular flujos de operaciones si aplica
ALTER TABLE public.operation_flows
    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- 15. Habilitar RLS con WITH CHECK (true)
ALTER TABLE public.location_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_rates_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_resource_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payment_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sustain_handoff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on location_holidays" ON public.location_holidays;
CREATE POLICY "Allow all on location_holidays" ON public.location_holidays FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on cost_rates_catalog" ON public.cost_rates_catalog;
CREATE POLICY "Allow all on cost_rates_catalog" ON public.cost_rates_catalog FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on talent_resource_compensation" ON public.talent_resource_compensation;
CREATE POLICY "Allow all on talent_resource_compensation" ON public.talent_resource_compensation FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_pos" ON public.project_pos;
CREATE POLICY "Allow all on project_pos" ON public.project_pos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_deliverables" ON public.project_deliverables;
CREATE POLICY "Allow all on project_deliverables" ON public.project_deliverables FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on task_time_logs" ON public.task_time_logs;
CREATE POLICY "Allow all on task_time_logs" ON public.task_time_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_risks" ON public.project_risks;
CREATE POLICY "Allow all on project_risks" ON public.project_risks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_change_requests" ON public.project_change_requests;
CREATE POLICY "Allow all on project_change_requests" ON public.project_change_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_payment_milestones" ON public.project_payment_milestones;
CREATE POLICY "Allow all on project_payment_milestones" ON public.project_payment_milestones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on project_sustain_handoff" ON public.project_sustain_handoff;
CREATE POLICY "Allow all on project_sustain_handoff" ON public.project_sustain_handoff FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on entity_comments" ON public.entity_comments;
CREATE POLICY "Allow all on entity_comments" ON public.entity_comments FOR ALL USING (true) WITH CHECK (true);

-- Insertar roles iniciales en catálogo de costos para estimaciones
INSERT INTO public.cost_rates_catalog (role_name, seniority, hourly_rate_estimated)
VALUES 
    ('Project Manager', 'Senior', 650.00),
    ('Arquitecto de Soluciones', 'Senior', 850.00),
    ('Ingeniero de Datos', 'Mid', 500.00),
    ('Ingeniero de Datos', 'Senior', 700.00),
    ('Desarrollador Fullstack', 'Mid', 450.00),
    ('Desarrollador Fullstack', 'Senior', 650.00),
    ('Consultor Power BI', 'Mid', 450.00),
    ('QA / Tester', 'Mid', 350.00)
ON CONFLICT DO NOTHING;
