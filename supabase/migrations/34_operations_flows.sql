-- 1. Crear tabla para el catálogo de flujos de operaciones
CREATE TABLE IF NOT EXISTS public.operation_flows (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    n8n_workflow_id TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'error'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Crear tabla para las ejecuciones y bitácora de N8N
CREATE TABLE IF NOT EXISTS public.flow_executions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    flow_id UUID REFERENCES public.operation_flows(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    execution_id TEXT, -- ID de ejecución provisto por n8n
    status TEXT NOT NULL DEFAULT 'running', -- 'queued', 'running', 'success', 'error'
    step_current INT DEFAULT 1,
    step_total INT DEFAULT 3,
    step_name TEXT,
    error_log TEXT,
    payload_input JSONB DEFAULT '{}'::jsonb,
    payload_output JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Índices para acelerar consultas de estados recientes
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id ON public.flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_client_id ON public.flow_executions(client_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status ON public.flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_started_at ON public.flow_executions(started_at DESC);

-- 4. Habilitar RLS
ALTER TABLE public.operation_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;

-- 5. Políticas RLS permisivas con WITH CHECK para CRUD de usuarios y webhooks
DROP POLICY IF EXISTS "Manage operation flows" ON public.operation_flows;
CREATE POLICY "Manage operation flows" ON public.operation_flows
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Manage flow executions" ON public.flow_executions;
CREATE POLICY "Manage flow executions" ON public.flow_executions
    FOR ALL
    USING (true)
    WITH CHECK (true);
