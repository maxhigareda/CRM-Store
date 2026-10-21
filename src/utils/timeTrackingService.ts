import { supabase } from '../lib/supabase';
import type { TaskTimeLog, ResourceCapacity } from '../types/projectControl';

/**
 * Obtiene el costo por hora de nómina real de un colaborador.
 * Prioridad:
 * 1. talent_resource_compensation (real_hourly_cost)
 * 2. cost_rates_catalog (promedio o rol estimado)
 * 3. Fallback estándar (500.00 MXN/h)
 */
export async function getHourlyCostForProfile(profileId: string): Promise<number> {
  try {
    const { data: comp } = await supabase
      .from('talent_resource_compensation')
      .select('real_hourly_cost, monthly_salary, benefits_multiplier')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (comp?.real_hourly_cost) {
      return Number(comp.real_hourly_cost);
    }
    if (comp?.monthly_salary) {
      const mult = Number(comp.benefits_multiplier || 1.35);
      return Number(((Number(comp.monthly_salary) * mult) / 160).toFixed(2));
    }

    // Fallback: catálogo de costos
    const { data: catalog } = await supabase
      .from('cost_rates_catalog')
      .select('hourly_rate_estimated')
      .limit(1)
      .maybeSingle();

    if (catalog?.hourly_rate_estimated) {
      return Number(catalog.hourly_rate_estimated);
    }

    return 500.0;
  } catch (err) {
    console.error('Error fetching hourly cost:', err);
    return 500.0;
  }
}

/**
 * Sincroniza las horas reales de la tarea y el costo acumulado del proyecto en base a los logs.
 */
export async function syncTaskAndProjectActuals(taskId: string, projectId: string) {
  try {
    // 1. Sumar horas de la tarea
    const { data: taskLogs } = await supabase
      .from('task_time_logs')
      .select('hours_logged')
      .eq('task_id', taskId);

    const taskHours = (taskLogs || []).reduce((acc, l) => acc + Number(l.hours_logged || 0), 0);

    await supabase
      .from('tasks')
      .update({ actual_hours: taskHours })
      .eq('id', taskId);

    // 2. Sumar horas y costo total del proyecto
    const { data: projLogs } = await supabase
      .from('task_time_logs')
      .select('hours_logged, hourly_rate_snapshot')
      .eq('project_id', projectId);

    const projHours = (projLogs || []).reduce((acc, l) => acc + Number(l.hours_logged || 0), 0);
    const projCost = (projLogs || []).reduce(
      (acc, l) => acc + Number(l.hours_logged || 0) * Number(l.hourly_rate_snapshot || 0),
      0
    );

    await supabase
      .from('projects')
      .update({
        actual_hours: projHours,
        actual_cost: projCost
      })
      .eq('id', projectId);

    return { taskHours, projHours, projCost };
  } catch (err) {
    console.error('Error syncing task and project actuals:', err);
  }
}

/**
 * Registra horas trabajadas en una tarea (Historia 4: Afectación Inmediata de Costo Real).
 */
export async function logTaskHours(params: {
  taskId: string;
  projectId: string;
  profileId: string;
  workDate: string;
  hoursLogged: number;
  description?: string;
}): Promise<{ success: boolean; data?: TaskTimeLog; error?: string }> {
  try {
    if (params.hoursLogged <= 0 || params.hoursLogged > 24) {
      return { success: false, error: 'Las horas deben estar entre 0.1 y 24 hrs por registro.' };
    }

    const hourlyRate = await getHourlyCostForProfile(params.profileId);

    const { data, error } = await supabase
      .from('task_time_logs')
      .insert([
        {
          task_id: params.taskId,
          project_id: params.projectId,
          profile_id: params.profileId,
          work_date: params.workDate,
          hours_logged: params.hoursLogged,
          description: params.description || '',
          hourly_rate_snapshot: hourlyRate
        }
      ])
      .select('*, profile:profiles(id, full_name, email)')
      .single();

    if (error) throw error;

    // Sincronización inmediata de costos y horas
    await syncTaskAndProjectActuals(params.taskId, params.projectId);

    return { success: true, data };
  } catch (err: any) {
    console.error('Error logging task hours:', err);
    return { success: false, error: err.message || 'Error al registrar horas' };
  }
}

/**
 * Elimina un registro de horas (solo PM/Admin) y re-calcula costo y horas reales.
 */
export async function deleteTimeLog(logId: string, taskId: string, projectId: string) {
  try {
    const { error } = await supabase.from('task_time_logs').delete().eq('id', logId);
    if (error) throw error;
    await syncTaskAndProjectActuals(taskId, projectId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Calcula la carga y sobreasignación de un colaborador en una semana determinada (Historia 5).
 * Capacidad estándar: 40 hrs semanales (160 hrs / mes).
 */
export async function getCollaboratorWeeklyCapacity(
  profileId: string,
  profileName: string,
  profileEmail: string,
  weekStartDateStr?: string
): Promise<ResourceCapacity> {
  const weeklyTarget = 40;
  const monthlyTarget = 160;

  // Determinar rango de la semana (Lunes a Domingo)
  const now = weekStartDateStr ? new Date(weekStartDateStr + 'T00:00:00') : new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  try {
    // 1. Obtener todas las tareas activas asignadas al usuario
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, estimated_hours, start_date, due_date, status, project_id, projects(id, title, status)')
      .eq('assigned_to', profileId)
      .neq('status', 'done');

    // 2. Obtener horas reales registradas esta semana
    const { data: logs } = await supabase
      .from('task_time_logs')
      .select('hours_logged, project_id')
      .eq('profile_id', profileId)
      .gte('work_date', mondayStr)
      .lte('work_date', sundayStr);

    const weeklyLogged = (logs || []).reduce((acc, l) => acc + Number(l.hours_logged || 0), 0);

    // 3. Calcular asignación semanal por tarea
    const projectsMap: { [projId: string]: { project_id: string; project_name: string; hours: number } } = {};
    let totalAssignedHours = 0;

    (tasks || []).forEach((t: any) => {
      const projTitle = t.projects?.title || 'Proyecto sin nombre';
      const projId = t.project_id;
      const hours = Number(t.estimated_hours) || 8; // fallback 8h si no tiene estimación

      totalAssignedHours += hours;

      if (!projectsMap[projId]) {
        projectsMap[projId] = {
          project_id: projId,
          project_name: projTitle,
          hours: 0
        };
      }
      projectsMap[projId].hours += hours;
    });

    const occupancyPct = Math.round((totalAssignedHours / weeklyTarget) * 100);

    return {
      profile_id: profileId,
      full_name: profileName,
      email: profileEmail,
      weekly_target_hours: weeklyTarget,
      monthly_target_hours: monthlyTarget,
      weekly_assigned_hours: totalAssignedHours,
      weekly_logged_hours: weeklyLogged,
      occupancy_pct: occupancyPct,
      is_overallocated: totalAssignedHours > weeklyTarget,
      projects_breakdown: Object.values(projectsMap)
    };
  } catch (err) {
    console.error('Error calculating collaborator capacity:', err);
    return {
      profile_id: profileId,
      full_name: profileName,
      email: profileEmail,
      weekly_target_hours: weeklyTarget,
      monthly_target_hours: monthlyTarget,
      weekly_assigned_hours: 0,
      weekly_logged_hours: 0,
      occupancy_pct: 0,
      is_overallocated: false,
      projects_breakdown: []
    };
  }
}
