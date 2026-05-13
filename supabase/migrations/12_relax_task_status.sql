-- Relax task status constraint to avoid "tasks_status_check" violation
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

-- Ensure Hazu-specific columns exist (they were added in migration 11, but we double-check)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority_level VARCHAR(20) DEFAULT 'media';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS internal_project_name VARCHAR(255);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
