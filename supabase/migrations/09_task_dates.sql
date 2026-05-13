-- Add start_date to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;

-- Update existing tasks to have a start_date if they don't have one
UPDATE public.tasks SET start_date = created_at::DATE WHERE start_date IS NULL;
