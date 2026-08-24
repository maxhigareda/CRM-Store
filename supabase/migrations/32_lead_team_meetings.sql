-- Crear tabla para almacenar las juntas y transcripciones del Lead Team
CREATE TABLE IF NOT EXISTS public.lead_team_meetings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    transcript TEXT,
    summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.lead_team_meetings ENABLE ROW LEVEL SECURITY;

-- Crear política simplificada: cualquier usuario autenticado puede realizar todas las operaciones
DROP POLICY IF EXISTS "Manage lead team meetings" ON public.lead_team_meetings;
CREATE POLICY "Manage lead team meetings" ON public.lead_team_meetings 
    FOR ALL USING (auth.role() = 'authenticated');
