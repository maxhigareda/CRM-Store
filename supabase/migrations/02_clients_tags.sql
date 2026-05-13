-- Create Clients table
CREATE TABLE public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    reference_name TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Create Tags table
CREATE TABLE public.tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Add relation to projects table
-- Note: we use tag_ids as an array of UUIDs for simplicity
ALTER TABLE public.projects DROP COLUMN IF EXISTS client;
ALTER TABLE public.projects DROP COLUMN IF EXISTS tags;

ALTER TABLE public.projects ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.projects ADD COLUMN tag_ids UUID[] DEFAULT '{}';

-- Enable RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Policies for clients
CREATE POLICY "Enable read access for all authenticated users on clients" 
    ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users on clients" 
    ON public.clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users on clients" 
    ON public.clients FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users on clients" 
    ON public.clients FOR DELETE TO authenticated USING (true);

-- Policies for tags
CREATE POLICY "Enable read access for all authenticated users on tags" 
    ON public.tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert for authenticated users on tags" 
    ON public.tags FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users on tags" 
    ON public.tags FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Enable delete for authenticated users on tags" 
    ON public.tags FOR DELETE TO authenticated USING (true);
