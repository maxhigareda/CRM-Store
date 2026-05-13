-- Update tasks_status_check constraint to include 'review'
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check 
CHECK (status IN ('todo', 'doing', 'review', 'done', 'approved'));
