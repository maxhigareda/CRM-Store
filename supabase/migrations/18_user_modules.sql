-- Add 'modules' array to profiles to control access to different sections of the app
ALTER TABLE profiles 
ADD COLUMN modules text[] DEFAULT ARRAY['proyectos']::text[];

-- Update existing profiles to ensure they have at least the 'proyectos' module
UPDATE profiles 
SET modules = ARRAY['proyectos']::text[] 
WHERE modules IS NULL OR array_length(modules, 1) IS NULL;
