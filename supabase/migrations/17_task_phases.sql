-- Add phase_id to tasks to link them to specific project phases
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL;
