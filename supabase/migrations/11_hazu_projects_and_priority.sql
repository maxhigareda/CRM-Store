-- Actualizar la tabla de proyectos para relajar la validación del estado si es necesario y admitir estado "Hazú" o manejar los estados como prefiera el usuario.
-- El usuario mencionó: "new row for relation "projects" violates check constraint "projects_status_check""
-- Vamos a revisar y relajar o eliminar la restricción.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Añadir prioridad a tareas
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority_level VARCHAR(20) DEFAULT 'media';

-- Crear la opción de "Proyecto" dentro de las tareas (ya existe project_id, pero se requiere un tratamiento especial si es "Hazú" - proyecto interno)
-- El proyecto "Hazú" será identificado porque el cliente se llama "Hazú" o por un flag.
-- De hecho, el usuario mencionó que "cuando sea Hazú... las tareas que se agreguen en este tablero tendrán un campo de Proyecto...".
-- Lo ideal es agregar un campo "internal_project_name" a las tareas para esos casos, o manejar "Hazú" como cliente y los "proyectos internos" como registros en `projects` pero que se asocian a las tareas como subtareas?
-- Según el prompt: "la tareas que se agreguen en este tablero tendrpan un acampo de Proyecto... para poder Indentoficarlos... Diga Interno- 'Nombre'".
-- Vamos a agregar un campo opcional a `tasks` llamado `internal_project_name` para capturar este dato "interno".
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS internal_project_name VARCHAR(255);
