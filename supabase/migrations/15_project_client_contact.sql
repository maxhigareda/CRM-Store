-- Add client_contact_name column to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_contact_name TEXT;
