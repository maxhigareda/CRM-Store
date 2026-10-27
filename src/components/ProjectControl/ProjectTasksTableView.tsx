import { useState, useMemo, useEffect } from 'react';
import { 
  Plus
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { Deliverable } from '../../types/projectControl';
import type { DirectoryMember } from './ProjectDirectoryManager';

interface TaskItem {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  deliverable_id?: string;
  start_date?: string;
  due_date?: string;
  progress_pct?: number;
  auto_status?: string;
  required_role?: string;
  directory_member_id?: string;
  has_risk?: boolean;
  risk_id?: string;
  is_blocked?: boolean;
  status: string;
}

interface ProjectTasksTableViewProps {
  projectId: string;
  tasks: TaskItem[];
  deliverables: Deliverable[];
  directoryMembers: DirectoryMember[];
  committedRoles: string[]; // Roles cotizados en la propuesta inicial
  onTasksUpdated: () => void;
  onNavigateToTab?: (tab: string) => void;
}

// Cálculo de días hábiles entre dos fechas (lunes a viernes)
function calculateWorkingDays(startDateStr?: string, endDateStr?: string): number {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;

  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dayOfWeek = cur.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Cuenta regresiva o tiempo restante
function calculateRemainingTime(endDateStr?: string, progressPct: number = 0): { text: string; isOverdue: boolean } {
  if (progressPct >= 100) return { text: 'Completada', isOverdue: false };
  if (!endDateStr) return { text: '-', isOverdue: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr + 'T00:00:00');
  if (isNaN(end.getTime())) return { text: '-', isOverdue: false };

  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Retrasada ${Math.abs(diffDays)}d`, isOverdue: true };
  } else if (diffDays === 0) {
    return { text: 'Vence hoy', isOverdue: true };
  } else {
    return { text: `${diffDays} días rest.`, isOverdue: false };
  }
}

// Determinar Estado Automático
function computeAutoStatus(
  startDateStr?: string, 
  endDateStr?: string, 
  progressPct: number = 0, 
  isBlocked: boolean = false
): string {
  if (progressPct >= 100) return 'Cerrada';
  if (isBlocked) return 'Retrasada con dependencia';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!startDateStr || !endDateStr) return 'Por iniciar';

  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');

  if (today < start && progressPct === 0) {
    return 'Por iniciar';
  }

  if (today > end && progressPct < 100) {
    return 'Ejecución retrasada';
  }

  // Si está entre start y end
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = Math.max(0, (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  if (progressPct > expectedProgress + 15) {
    return 'Ejecución adelantada';
  } else if (progressPct < expectedProgress - 20) {
    return 'Ejecución retrasada';
  } else {
    return 'Ejecución en tiempo';
  }
}

export default function ProjectTasksTableView({
  projectId,
  tasks,
  deliverables,
  directoryMembers,
  committedRoles = [],
  onTasksUpdated
}: ProjectTasksTableViewProps) {
  const { showNotification } = useNotification();

  // Formulario nueva tarea rápida
  const [showNewRow, setShowNewRow] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDeliverableId, setNewDeliverableId] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newMemberId, setNewMemberId] = useState('');
  const [newHasRisk, setNewHasRisk] = useState(false);
  const [saving, setSaving] = useState(false);

  // Miembros resueltos con fallback garantizado a localStorage
  const [effectiveMembers, setEffectiveMembers] = useState<DirectoryMember[]>(directoryMembers);

  // Respaldo y sincronización de atributos extendidos de tareas (auto_status, progress_pct, has_risk)
  const [tasksExtra, setTasksExtra] = useState<Record<string, any>>({});

  useEffect(() => {
    try {
      const cached = localStorage.getItem(`project_tasks_extra_${projectId}`);
      if (cached) {
        setTasksExtra(JSON.parse(cached));
      }
    } catch (e) {
      console.warn('Error reading tasks extra cache:', e);
    }
  }, [projectId, tasks]);

  useEffect(() => {
    if (directoryMembers && directoryMembers.length > 0) {
      setEffectiveMembers(directoryMembers);
    } else if (projectId) {
      const cached = localStorage.getItem(`project_dir_${projectId}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEffectiveMembers(parsed);
          }
        } catch (e) {
          console.warn('Error reading cached directory in tasks:', e);
        }
      }
    }
  }, [directoryMembers, projectId]);

  // Lista de todos los roles únicos disponibles (combinando propuesta + directorio)
  const allAvailableRoles = useMemo(() => {
    const rolesSet = new Set<string>();
    committedRoles.forEach(r => rolesSet.add(r));
    effectiveMembers.forEach(m => {
      if (m.role_title) rolesSet.add(m.role_title);
      if (m.secondary_role_title) rolesSet.add(m.secondary_role_title);
    });
    // Roles base si no hay ninguno
    if (rolesSet.size === 0) {
      ['Project Manager', 'Data Engineer', 'BI Visualization Developer', 'Analista'].forEach(r => rolesSet.add(r));
    }
    return Array.from(rolesSet);
  }, [committedRoles, effectiveMembers]);

  // Manejador de cambio de rol en una tarea existente con regla de negocio de Adenda
  const handleRoleChange = async (taskId: string, selectedRole: string) => {
    // Regla: si no está en la propuesta inicial, emitir alerta y registrar Adenda
    const isOutOfScope = committedRoles.length > 0 && !committedRoles.some(r => r.toLowerCase().includes(selectedRole.toLowerCase()) || selectedRole.toLowerCase().includes(r.toLowerCase()));

    try {
      await supabase
        .from('tasks')
        .update({ required_role: selectedRole })
        .eq('id', taskId);

      if (isOutOfScope) {
        showNotification('info', `⚠️ Alerta: El rol "${selectedRole}" no estaba contemplado en la propuesta inicial. Se generó un punto en la sección Adendas.`);
        
        // Crear automáticamente registro en Adendas / Change Requests
        await supabase
          .from('project_change_requests')
          .insert([{
            project_id: projectId,
            title: `Adición de rol no contemplado: ${selectedRole}`,
            request_type: 'scope',
            justification: `Se asignó el rol "${selectedRole}" a una tarea del Plan de Trabajo, el cual no formaba parte de las horas cotizadas en la propuesta inicial. Requiere revisión de impacto de margen por el PM.`,
            status: 'draft',
            hours_impact: 40,
            cost_impact: 15000
          }]);
      } else {
        showNotification('success', 'Rol asignado a la tarea');
      }

      onTasksUpdated();
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al actualizar rol');
    }
  };

  // Manejador de cambio de % de avance
  const handleProgressChange = async (taskId: string, pct: number, start?: string, end?: string) => {
    const clamped = Math.max(0, Math.min(100, pct));
    const autoStatus = computeAutoStatus(start, end, clamped);
    const newKanbanStatus = clamped >= 100 ? 'done' : clamped > 0 ? 'doing' : 'todo';

    const updatePayload: Record<string, any> = { 
      progress_pct: clamped,
      auto_status: autoStatus,
      status: newKanbanStatus 
    };

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error } = await supabase
          .from('tasks')
          .update(updatePayload)
          .eq('id', taskId);

        if (!error) break;

        const missingColMatch = error.message.match(/Could not find the '([^']+)' column/i) ||
                                error.message.match(/column "?([^"\s]+)"? of relation "?tasks"? does not exist/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in updatePayload) {
          delete updatePayload[missingColMatch[1]];
          continue;
        }
        break;
      }

      // Respaldo local de atributos de progreso
      try {
        const cachedRaw = localStorage.getItem(`project_tasks_extra_${projectId}`) || '{}';
        const cached = JSON.parse(cachedRaw);
        cached[taskId] = { progress_pct: clamped, auto_status: autoStatus };
        localStorage.setItem(`project_tasks_extra_${projectId}`, JSON.stringify(cached));
      } catch (e) {
        console.warn(e);
      }

      onTasksUpdated();
    } catch (err: any) {
      console.error(err);
    }
  };

  // Manejador del checkbox de Riesgo
  const handleToggleRisk = async (task: TaskItem) => {
    const nextRisk = !(task.has_risk ?? tasksExtra[task.id]?.has_risk ?? false);
    try {
      let riskId = task.risk_id;

      if (nextRisk) {
        // Generar en automático un ID y documentar el riesgo en la sección Riesgos
        const { data: newRisk } = await supabase
          .from('project_risks')
          .insert([{
            project_id: projectId,
            risk_description: `Riesgo identificado en tarea: ${task.title}`,
            risk_category: 'scope',
            probability: 'medium',
            impact: 'high',
            is_blocking: false,
            mitigation_plan: 'Documentado desde el Plan de Trabajo. Pendiente plan de mitigación por el PM.',
            status: 'identificado'
          }])
          .select('id')
          .single();

        if (newRisk) riskId = newRisk.id;
        showNotification('info', '⚠️ Riesgo documentado automáticamente con ID en la Matriz de Riesgos');
      } else {
        showNotification('info', 'Bandera de riesgo desactivada');
      }

      // Actualización resiliente en BD
      const riskPayload: Record<string, any> = { 
        has_risk: nextRisk,
        risk_id: riskId || null 
      };

      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase
          .from('tasks')
          .update(riskPayload)
          .eq('id', task.id);

        if (!error) break;
        const missingColMatch = error.message?.match(/Could not find the '([^']+)' column/i) ||
                                error.message?.match(/column "?([^"\s]+)"? of relation "?tasks"? does not exist/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in riskPayload) {
          delete riskPayload[missingColMatch[1]];
          continue;
        }
        break;
      }

      // Respaldo local
      try {
        const cachedRaw = localStorage.getItem(`project_tasks_extra_${projectId}`) || '{}';
        const cached = JSON.parse(cachedRaw);
        cached[task.id] = { ...(cached[task.id] || {}), has_risk: nextRisk, risk_id: riskId || null };
        localStorage.setItem(`project_tasks_extra_${projectId}`, JSON.stringify(cached));
        setTasksExtra(cached);
      } catch (e) {
        console.warn(e);
      }

      onTasksUpdated();
    } catch (err: any) {
      console.error(err);
    }
  };

  // Crear nueva tarea desde la tabla (Resiliente a columnas aún no cacheadas en Supabase)
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return showNotification('error', 'La descripción de la tarea es obligatoria');

    setSaving(true);
    const workingDays = calculateWorkingDays(newStartDate, newEndDate);
    const autoStatus = computeAutoStatus(newStartDate, newEndDate, 0);

    const isOutOfScope = newRole && committedRoles.length > 0 && !committedRoles.some(r => r.toLowerCase().includes(newRole.toLowerCase()) || newRole.toLowerCase().includes(r.toLowerCase()));

    try {
      const currentPayload: Record<string, any> = {
        project_id: projectId,
        title: newTitle.trim(),
        deliverable_id: newDeliverableId || null,
        start_date: newStartDate || null,
        due_date: newEndDate || null,
        required_role: newRole || null,
        directory_member_id: newMemberId || null,
        progress_pct: 0,
        auto_status: autoStatus,
        status: 'todo',
        priority: 'medium',
        estimated_hours: workingDays * 8
      };

      let insertedTask: any = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await supabase
          .from('tasks')
          .insert([currentPayload])
          .select()
          .single();

        if (!error) {
          insertedTask = data;
          break;
        }

        const missingColMatch = error.message?.match(/Could not find the '([^']+)' column/i) ||
                                error.message?.match(/column "?([^"\s]+)"? of relation "?tasks"? does not exist/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in currentPayload) {
          delete currentPayload[missingColMatch[1]];
          continue;
        }
        throw error;
      }

      // Guardar respaldo local de atributos de control PM
      if (insertedTask?.id) {
        try {
          const cachedRaw = localStorage.getItem(`project_tasks_extra_${projectId}`) || '{}';
          const cached = JSON.parse(cachedRaw);
          cached[insertedTask.id] = {
            progress_pct: 0,
            auto_status: autoStatus,
            has_risk: newHasRisk,
            required_role: newRole || null,
            directory_member_id: newMemberId || null
          };
          localStorage.setItem(`project_tasks_extra_${projectId}`, JSON.stringify(cached));
          setTasksExtra(cached);
        } catch (e) {
          console.warn(e);
        }
      }

      if (newHasRisk && insertedTask) {
        // Crear riesgo automático
        const { data: newRisk } = await supabase
          .from('project_risks')
          .insert([{
            project_id: projectId,
            risk_description: `Riesgo detectado al dar de alta tarea: ${newTitle.trim()}`,
            risk_category: 'scope',
            probability: 'medium',
            impact: 'high',
            status: 'identificado'
          }])
          .select('id')
          .single();

        if (newRisk) {
          try {
            await supabase.from('tasks').update({ has_risk: true, risk_id: newRisk.id }).eq('id', insertedTask.id);
          } catch (e) {
            console.warn(e);
          }
        }
      }

      if (isOutOfScope) {
        showNotification('info', `⚠️ Alerta: El rol "${newRole}" no estaba en la propuesta inicial. Se generó punto en Adendas.`);
        await supabase
          .from('project_change_requests')
          .insert([{
            project_id: projectId,
            title: `Adición de rol no contemplado: ${newRole}`,
            request_type: 'scope',
            justification: `Se dio de alta la tarea "${newTitle.trim()}" con el rol "${newRole}" no contemplado inicialmente.`,
            status: 'draft',
            hours_impact: 40,
            cost_impact: 15000
          }]);
      } else {
        showNotification('success', 'Tarea creada en el Plan de Trabajo');
      }

      setNewTitle('');
      setNewStartDate('');
      setNewEndDate('');
      setNewRole('');
      setNewMemberId('');
      setNewHasRisk(false);
      setShowNewRow(false);
      onTasksUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al crear tarea: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper de estilos para Estado Automático
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Cerrada':
        return { bg: '#dcfce7', color: '#15803d', label: '✅ Cerrada' };
      case 'Ejecución adelantada':
        return { bg: '#dbeafe', color: '#1d4ed8', label: '⚡ Ejecución adelantada' };
      case 'Ejecución en tiempo':
        return { bg: '#ecfdf5', color: '#047857', label: '🟢 Ejecución en tiempo' };
      case 'Ejecución retrasada':
        return { bg: '#fee2e2', color: '#b91c1c', label: '🔴 Ejecución retrasada' };
      case 'Retrasada con dependencia':
        return { bg: '#fef3c7', color: '#b45309', label: '🔒 Retrasada con dependencia' };
      case 'Por iniciar':
      default:
        return { bg: '#f1f5f9', color: '#475569', label: '⚪ Por iniciar' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Informativo del Paso 3 */}
      <div style={{ 
        background: 'white', 
        padding: '24px', 
        borderRadius: '16px', 
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ 
              background: '#ecfdf5', 
              color: '#047857', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              padding: '4px 10px', 
              borderRadius: '8px' 
            }}>
              PASO 3 DEL FLUJO PM
            </span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Plan de Trabajo / Tareas
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Control de ejecución ligado a Entregables (Paso 2) con días hábiles automáticos, cuenta regresiva, responsable filtrado por Rol del Directorio (Paso 1) y detección de riesgos y adendas.
          </p>
        </div>

        <button
          onClick={() => setShowNewRow(!showNewRow)}
          className="btn btn-primary"
          style={{ 
            borderRadius: '10px', 
            fontSize: '0.8rem', 
            fontWeight: 700, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            padding: '8px 16px' 
          }}
        >
          <Plus size={15} /> Nueva Tarea en Plan
        </button>
      </div>

      {/* Formulario Inline de Alta Rápida en Tabla */}
      {showNewRow && (
        <form 
          onSubmit={handleCreateTask}
          style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '16px', 
            border: '2px solid #10b981',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.08)' 
          }}
        >
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', marginBottom: '14px' }}>
            + Agregar Tarea al Plan de Trabajo
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {/* Entregable (Paso 2) */}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                ENTREGABLE (PASO 2)
              </label>
              <select
                className="form-input"
                value={newDeliverableId}
                onChange={e => setNewDeliverableId(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              >
                <option value="">Sin entregable ligado</option>
                {deliverables.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.weight_pct}%)</option>
                ))}
              </select>
            </div>

            {/* Tarea (Descripción) */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                TAREA (DESCRIPCIÓN) *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Construcción de pipeline ETL en Databricks..."
                className="form-input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              />
            </div>

            {/* Inicio */}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                FECHA DE INICIO
              </label>
              <input
                type="date"
                className="form-input"
                value={newStartDate}
                onChange={e => setNewStartDate(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              />
            </div>

            {/* Fin */}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                FECHA DE FIN
              </label>
              <input
                type="date"
                className="form-input"
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              />
            </div>

            {/* Rol de la Propuesta */}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                ROL REQUERIDO
              </label>
              <select
                className="form-input"
                value={newRole}
                onChange={e => {
                  setNewRole(e.target.value);
                  setNewMemberId(''); // Reset responsable al cambiar rol
                }}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              >
                <option value="">Selecciona rol...</option>
                {allAvailableRoles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Responsable (Directorio con agrupación inteligente por rol) */}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                RESPONSABLE (DIRECTORIO)
              </label>
              <select
                className="form-input"
                value={newMemberId}
                onChange={e => setNewMemberId(e.target.value)}
                style={{ width: '100%', height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
              >
                <option value="">Sin asignar ({effectiveMembers.length} en directorio)...</option>
                {/* 1. Coincidentes con el rol */}
                {effectiveMembers
                  .filter(m => {
                    if (!newRole) return true;
                    const r = newRole.toLowerCase();
                    return (m.role_title && (m.role_title.toLowerCase() === r || m.role_title.toLowerCase().includes(r) || r.includes(m.role_title.toLowerCase()))) ||
                           (m.secondary_role_title && (m.secondary_role_title.toLowerCase() === r || m.secondary_role_title.toLowerCase().includes(r) || r.includes(m.secondary_role_title.toLowerCase())));
                  })
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.group_type} - {m.role_title})
                    </option>
                  ))
                }
                {/* 2. Otros miembros del directorio (si hay filtro de rol) */}
                {newRole && effectiveMembers.some(m => {
                  const r = newRole.toLowerCase();
                  const match = (m.role_title && (m.role_title.toLowerCase() === r || m.role_title.toLowerCase().includes(r) || r.includes(m.role_title.toLowerCase()))) ||
                                (m.secondary_role_title && (m.secondary_role_title.toLowerCase() === r || m.secondary_role_title.toLowerCase().includes(r) || r.includes(m.secondary_role_title.toLowerCase())));
                  return !match;
                }) && (
                  <optgroup label="── Otros colaboradores del directorio ──">
                    {effectiveMembers
                      .filter(m => {
                        const r = newRole.toLowerCase();
                        const match = (m.role_title && (m.role_title.toLowerCase() === r || m.role_title.toLowerCase().includes(r) || r.includes(m.role_title.toLowerCase()))) ||
                                      (m.secondary_role_title && (m.secondary_role_title.toLowerCase() === r || m.secondary_role_title.toLowerCase().includes(r) || r.includes(m.secondary_role_title.toLowerCase())));
                        return !match;
                      })
                      .map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.group_type} - {m.role_title})
                        </option>
                      ))
                    }
                  </optgroup>
                )}
              </select>
            </div>

            {/* Checkbox Riesgo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
              <input
                type="checkbox"
                id="new_has_risk"
                checked={newHasRisk}
                onChange={e => setNewHasRisk(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="new_has_risk" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}>
                ⚠️ Marcar como Riesgo
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowNewRow(false)}
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ padding: '6px 18px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px' }}
            >
              {saving ? 'Guardando...' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      )}

      {/* Tabla del Plan de Trabajo */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table className="table" style={{ margin: 0, minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>ENTREGABLE</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569', minWidth: '220px' }}>TAREA (DESCRIPCIÓN)</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>INICIO</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>FIN</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>DÍAS HÁBILES</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>TIEMPO RESTANTE</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569', width: '130px' }}>% AVANCE</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>ESTADO (AUTO)</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>ROL</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569' }}>RESPONSABLE</th>
              <th style={{ padding: '12px 14px', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>RIESGO</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No hay tareas registradas en el Plan de Trabajo. Haz clic en "+ Nueva Tarea en Plan" arriba.
                </td>
              </tr>
            ) : (
              tasks.map(task => {
                const extra = tasksExtra[task.id] || {};
                const progressPct = task.progress_pct ?? extra.progress_pct ?? 0;
                const taskRole = task.required_role ?? extra.required_role;
                const memberId = task.directory_member_id ?? extra.directory_member_id;
                const hasRisk = task.has_risk ?? extra.has_risk ?? false;
                const deliverableObj = deliverables.find(d => d.id === task.deliverable_id);
                const workingDays = calculateWorkingDays(task.start_date, task.due_date);
                const remaining = calculateRemainingTime(task.due_date, progressPct);
                const autoStatus = task.auto_status || extra.auto_status || computeAutoStatus(task.start_date, task.due_date, progressPct, task.is_blocked);
                const badge = getStatusBadge(autoStatus);

                // Miembros filtrados por el rol de la tarea
                const matchingMembers = effectiveMembers.filter(m => {
                  if (!taskRole) return true;
                  const r = taskRole.toLowerCase();
                  return (m.role_title && (m.role_title.toLowerCase() === r || m.role_title.toLowerCase().includes(r) || r.includes(m.role_title.toLowerCase()))) ||
                         (m.secondary_role_title && (m.secondary_role_title.toLowerCase() === r || m.secondary_role_title.toLowerCase().includes(r) || r.includes(m.secondary_role_title.toLowerCase())));
                });
                const otherMembers = effectiveMembers.filter(m => !matchingMembers.some(match => match.id === m.id));


                return (
                  <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    
                    {/* 1. Entregable */}
                    <td style={{ padding: '12px 14px', fontSize: '0.8rem' }}>
                      {deliverableObj ? (
                        <span style={{ 
                          background: '#f5f3ff', 
                          color: '#7c3aed', 
                          padding: '3px 8px', 
                          borderRadius: '6px', 
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          display: 'inline-block'
                        }}>
                          📦 {deliverableObj.name}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>-</span>
                      )}
                    </td>

                    {/* 2. Tarea (Descripción) */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>
                      {task.title}
                    </td>

                    {/* 3. Inicio */}
                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: '#475569' }}>
                      {task.start_date || '-'}
                    </td>

                    {/* 4. Fin */}
                    <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: '#475569' }}>
                      {task.due_date || '-'}
                    </td>

                    {/* 5. Días Hábiles */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: '#334155' }}>
                      {workingDays > 0 ? `${workingDays}d` : '-'}
                    </td>

                    {/* 6. Tiempo Restante */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                      <span style={{ 
                        color: remaining.isOverdue ? '#dc2626' : '#475569',
                        background: remaining.isOverdue ? '#fef2f2' : '#f8fafc',
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        {remaining.text}
                      </span>
                    </td>

                    {/* 7. % Avance (Editable) */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={progressPct}
                          onChange={e => handleProgressChange(task.id, Number(e.target.value), task.start_date, task.due_date)}
                          style={{
                            width: '55px',
                            height: '30px',
                            padding: '0 6px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>%</span>
                      </div>
                    </td>

                    {/* 8. Estado (Automático) */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ 
                        display: 'inline-block',
                        fontSize: '0.72rem', 
                        fontWeight: 800, 
                        padding: '4px 8px', 
                        borderRadius: '6px',
                        background: badge.bg,
                        color: badge.color
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    {/* 9. Rol (Desplegable) */}
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={taskRole || ''}
                        onChange={e => handleRoleChange(task.id, e.target.value)}
                        style={{
                          height: '30px',
                          padding: '0 6px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          maxWidth: '140px'
                        }}
                      >
                        <option value="">Seleccionar rol...</option>
                        {allAvailableRoles.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>

                    {/* 10. Responsable (Filtrado por Rol del Directorio con opción de ver todos) */}
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={memberId || ''}
                        onChange={async (e) => {
                          const mId = e.target.value;
                          try {
                            await supabase.from('tasks').update({ directory_member_id: mId || null }).eq('id', task.id);
                          } catch (err) {
                            console.warn(err);
                          }
                          try {
                            const cachedRaw = localStorage.getItem(`project_tasks_extra_${projectId}`) || '{}';
                            const cached = JSON.parse(cachedRaw);
                            cached[task.id] = { ...(cached[task.id] || {}), directory_member_id: mId || null };
                            localStorage.setItem(`project_tasks_extra_${projectId}`, JSON.stringify(cached));
                            setTasksExtra(cached);
                          } catch (err) {
                            console.warn(err);
                          }
                          onTasksUpdated();
                        }}
                        style={{
                          height: '30px',
                          padding: '0 6px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.75rem',
                          maxWidth: '140px'
                        }}
                      >
                        <option value="">Sin asignar ({effectiveMembers.length} en dir)...</option>
                        {matchingMembers.length > 0 && (
                          <optgroup label="✨ Coinciden con Rol">
                            {matchingMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.group_type})</option>
                            ))}
                          </optgroup>
                        )}
                        {taskRole && otherMembers.length > 0 && (
                          <optgroup label="👥 Otros del Directorio">
                            {otherMembers.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.group_type} - {m.role_title})</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </td>

                    {/* 11. Riesgo (Checkbox Sí/No) */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!hasRisk}
                        onChange={() => handleToggleRisk(task)}
                        title="Marcar riesgo (crea automáticamente entrada en Matriz de Riesgos)"
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#dc2626' }}
                      />
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
