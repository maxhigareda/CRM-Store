-- Create areas table
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated to see areas" ON areas;
CREATE POLICY "Allow authenticated to see areas" ON areas 
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow admins to manage areas" ON areas;
CREATE POLICY "Allow admins to manage areas" ON areas 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Update tags table for project-specific labels
ALTER TABLE tags ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- Update profiles for area association and photo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
