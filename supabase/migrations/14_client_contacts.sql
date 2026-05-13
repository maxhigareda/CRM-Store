-- Add contacts column to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb;
