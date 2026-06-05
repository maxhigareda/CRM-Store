-- Agregar columna de prioridad a la tabla de proyectos para permitir ordenar y priorizar planes de trabajo.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
