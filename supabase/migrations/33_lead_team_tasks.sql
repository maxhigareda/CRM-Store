-- Crear tabla para almacenar las tareas gerenciales del Lead Team
CREATE TABLE IF NOT EXISTS public.lead_team_tasks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    meeting_id UUID REFERENCES public.lead_team_meetings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    role TEXT NOT NULL, -- CEO, Office Manager, Development Manager, BI Manager, Business Manager, PMP, Low Code Manager
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'En Cola', -- En Cola, En Curso, Completada
    model TEXT DEFAULT 'gemini-1.5-flash',
    due_time TIME DEFAULT '09:00:00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.lead_team_tasks ENABLE ROW LEVEL SECURITY;

-- Crear política para que usuarios autenticados gestionen tareas
DROP POLICY IF EXISTS "Manage lead team tasks" ON public.lead_team_tasks;
CREATE POLICY "Manage lead team tasks" ON public.lead_team_tasks
    FOR ALL USING (auth.role() = 'authenticated');
