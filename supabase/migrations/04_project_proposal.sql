-- Add proposal_url to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS proposal_url TEXT;
