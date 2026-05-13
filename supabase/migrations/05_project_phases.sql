-- 1. Create Project Phases table
CREATE TABLE IF NOT EXISTS public.project_phases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration_weeks INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "Phases are manageable by authenticated users" ON public.project_phases
    FOR ALL USING (auth.role() = 'authenticated');
