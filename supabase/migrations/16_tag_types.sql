-- Add type column to tags table to differentiate between project and task tags
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'project';

-- Existing tags with a project_id were created inside a Board, so they are task tags.
UPDATE public.tags SET type = 'task' WHERE project_id IS NOT NULL;
