-- Ensure all columns for projects are present
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS proposal_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_weeks INTEGER DEFAULT 1;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date DATE;

-- Notify PostgREST to reload schema cache (standard procedure for missing column errors)
NOTIFY pgrst, 'reload schema';
