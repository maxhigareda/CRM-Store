-- Migración 36: Control de Horas (Timesheets), Costo Real y Capacidad
-- Soporta Historia 4 (Registro Dual de Horas y Margen Real) e Historia 5 (Control de Sobreasignación)

-- 1. Asegurar columnas en `projects`
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(10, 2) DEFAULT 0.0;

-- 2. Asegurar columnas en `tasks`
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(8, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(8, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES public.project_deliverables(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS required_role VARCHAR(100);

-- 3. Índices para optimizar consultas de Timesheet y Capacidad
CREATE INDEX IF NOT EXISTS idx_task_time_logs_profile_date ON public.task_time_logs(profile_id, work_date);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_project_date ON public.task_time_logs(project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_task_id ON public.task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);

-- 4. Función de sincronización automática de costos reales y horas acumuladas
CREATE OR REPLACE FUNCTION public.fn_sync_task_and_project_time_logs()
RETURNS TRIGGER AS $$
DECLARE
    v_task_id UUID;
    v_project_id UUID;
    v_total_task_hours NUMERIC(10, 2);
    v_total_proj_hours NUMERIC(10, 2);
    v_total_proj_cost NUMERIC(14, 2);
BEGIN
    v_task_id := COALESCE(NEW.task_id, OLD.task_id);
    v_project_id := COALESCE(NEW.project_id, OLD.project_id);

    -- Recalcular horas de la tarea
    SELECT COALESCE(SUM(hours_logged), 0)
    INTO v_total_task_hours
    FROM public.task_time_logs
    WHERE task_id = v_task_id;

    UPDATE public.tasks
    SET actual_hours = v_total_task_hours
    WHERE id = v_task_id;

    -- Recalcular horas y costo real acumulado del proyecto
    SELECT 
        COALESCE(SUM(hours_logged), 0),
        COALESCE(SUM(hours_logged * COALESCE(hourly_rate_snapshot, 0)), 0)
    INTO v_total_proj_hours, v_total_proj_cost
    FROM public.task_time_logs
    WHERE project_id = v_project_id;

    UPDATE public.projects
    SET actual_hours = v_total_proj_hours,
        actual_cost = v_total_proj_cost
    WHERE id = v_project_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger en task_time_logs
DROP TRIGGER IF EXISTS trg_sync_task_and_project_time_logs ON public.task_time_logs;
CREATE TRIGGER trg_sync_task_and_project_time_logs
AFTER INSERT OR UPDATE OR DELETE ON public.task_time_logs
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_task_and_project_time_logs();
