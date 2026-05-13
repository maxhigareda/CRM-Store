-- 1. Update Profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS area TEXT;

-- 2. Update Projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'A tiempo' CHECK (status IN ('Terminado', 'A tiempo', 'Retraso'));
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_weeks INTEGER DEFAULT 1;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date DATE;
