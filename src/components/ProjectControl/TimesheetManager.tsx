import { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Save, 
  User, 
  Filter,
  BarChart2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { logTaskHours } from '../../utils/timeTrackingService';
import QuickTimeLogModal from './QuickTimeLogModal';
import type { TaskTimeLog } from '../../types/projectControl';

interface TimesheetManagerProps {
  projectId: string;
  project: any;
  tasks: any[];
  profiles: any[];
  onDataUpdated?: () => void;
}

export default function TimesheetManager({
  projectId,
  project,
  tasks,
  profiles,
  onDataUpdated
}: TimesheetManagerProps) {
  const { profile } = useAuth();
  const { showNotification } = useNotification();
  const isCollaborator = profile?.role === 'collaborator';
  const isManagerOrAdmin = !isCollaborator;

  // Fecha base para la semana
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [filterProfileId, setFilterProfileId] = useState<string>(
    isCollaborator ? (profile?.id || '') : 'ALL'
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<TaskTimeLog[]>([]);
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<any | null>(null);

  // Matriz de inputs para edición rápida en grilla: { [taskId]: { [dateStr]: hours } }
  const [gridHours, setGridHours] = useState<{ [taskId: string]: { [dateStr: string]: string } }>({});
  const [dirtyTasks, setDirtyTasks] = useState<Set<string>>(new Set());
  const [savingGrid, setSavingGrid] = useState<boolean>(false);

  // Calcular las 7 fechas de la semana seleccionada
  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() + idx);
    const dateStr = d.toISOString().split('T')[0];
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return {
      name: dayNames[idx],
      dateStr,
      displayDate: `${d.getDate()}/${d.getMonth() + 1}`,
      isToday: dateStr === new Date().toISOString().split('T')[0]
    };
  });

  const startOfWeekStr = weekDays[0].dateStr;
  const endOfWeekStr = weekDays[6].dateStr;

  useEffect(() => {
    fetchWeekLogs();
  }, [currentWeekMonday, projectId, filterProfileId]);

  const fetchWeekLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('task_time_logs')
        .select('*, profile:profiles(id, full_name, email)')
        .eq('project_id', projectId)
        .gte('work_date', startOfWeekStr)
        .lte('work_date', endOfWeekStr);

      if (filterProfileId && filterProfileId !== 'ALL') {
        query = query.eq('profile_id', filterProfileId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLogs(data || []);

      // Mapear logs existentes a la matriz de edición
      const initialGrid: { [taskId: string]: { [dateStr: string]: string } } = {};
      (data || []).forEach((l) => {
        if (!initialGrid[l.task_id]) initialGrid[l.task_id] = {};
        initialGrid[l.task_id][l.work_date] = String(l.hours_logged);
      });
      setGridHours(initialGrid);
      setDirtyTasks(new Set());
    } catch (err: any) {
      console.error('Error fetching week logs:', err);
      showNotification('error', 'Error al cargar timesheets de la semana');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() - 7);
    setCurrentWeekMonday(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() + 7);
    setCurrentWeekMonday(d);
  };

  const handleThisWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    setCurrentWeekMonday(d);
  };

  const handleGridHourChange = (taskId: string, dateStr: string, value: string) => {
    setGridHours((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] || {}),
        [dateStr]: value
      }
    }));
    setDirtyTasks((prev) => new Set(prev).add(taskId));
  };

  const handleSaveGrid = async () => {
    setSavingGrid(true);
    let successCount = 0;

    try {
      for (const taskId of Array.from(dirtyTasks)) {
        const taskDayHours = gridHours[taskId] || {};
        for (const day of weekDays) {
          const val = parseFloat(taskDayHours[day.dateStr] || '0');
          // Buscar si ya existía un log en este día
          const existing = logs.find((l) => l.task_id === taskId && l.work_date === day.dateStr);

          if (val > 0) {
            if (!existing || Number(existing.hours_logged) !== val) {
              await logTaskHours({
                taskId,
                projectId,
                profileId: profile?.id || '',
                workDate: day.dateStr,
                hoursLogged: val,
                description: 'Registro desde Matriz Semanal de Timesheets'
              });
              successCount++;
            }
          }
        }
      }

      showNotification('success', `Matriz semanal guardada (${successCount} registros procesados).`);
      await fetchWeekLogs();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error('Error saving timesheet grid:', err);
      showNotification('error', 'Ocurrió un error al guardar la matriz');
    } finally {
      setSavingGrid(false);
    }
  };

  // Filtrar tareas a mostrar
  const displayTasks = tasks.filter((t) => {
    if (isCollaborator) {
      return t.assigned_to === profile?.id;
    }
    if (filterProfileId !== 'ALL') {
      return t.assigned_to === filterProfileId;
    }
    return true;
  });

  // Métricas financieras y de avance
  const quotedBudget = Number(project?.quoted_budget || 0);
  const estimatedCost = Number(project?.estimated_cost || 0);
  const actualCost = Number(project?.actual_cost || 0);
  const quotedHours = Number(project?.quoted_hours || 0);
  const actualHours = Number(project?.actual_hours || 0);

  // Margen Real Actual
  const realMarginAmount = quotedBudget - actualCost;
  const realMarginPct = quotedBudget > 0 ? (realMarginAmount / quotedBudget) * 100 : 0;
  const targetMarginPct = Number(project?.target_margin_pct || 35);

  // Avance en Tiempo (Horas Incurridas vs Cotizadas)
  const timeProgressPct = quotedHours > 0 ? Math.min(100, (actualHours / quotedHours) * 100) : 0;

  // Avance en Peso de Tareas Completadas (Opción A y B que pidió el usuario)
  const completedTasks = tasks.filter((t) => t.status === 'done');
  const taskCountProgressPct = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  // Totales de la semana por día
  const dailyTotals = weekDays.map((day) => {
    return logs
      .filter((l) => l.work_date === day.dateStr)
      .reduce((sum, l) => sum + Number(l.hours_logged || 0), 0);
  });
  const weekTotalHours = dailyTotals.reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header: KPIs Financieros y Avances (Solo visible para PM / Admin) */}
      {isManagerOrAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {/* Card 1: Avance Dual (Tiempo vs Tareas) */}
          <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Avance Dual</span>
              <BarChart2 size={18} color="#3b82f6" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                  <span>Avance en Tiempo (Horas):</span>
                  <span>{actualHours.toFixed(1)} / {quotedHours}h ({timeProgressPct.toFixed(0)}%)</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginTop: '3px' }}>
                  <div style={{ width: `${timeProgressPct}%`, height: '100%', background: actualHours > quotedHours ? '#ef4444' : '#3b82f6' }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                  <span>Avance en Tareas:</span>
                  <span>{completedTasks.length} / {tasks.length} ({taskCountProgressPct}%)</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginTop: '3px' }}>
                  <div style={{ width: `${taskCountProgressPct}%`, height: '100%', background: '#10b981' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Costo Real vs Cotizado */}
          <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Costo Real Incurrido</span>
              <DollarSign size={18} color="#059669" />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
              ${actualCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              Costo Est. Línea Base: ${estimatedCost.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
            </div>
          </div>

          {/* Card 3: Margen Financiero Real */}
          <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Margen Financiero Real</span>
              <TrendingUp size={18} color={realMarginPct >= targetMarginPct ? '#10b981' : '#f59e0b'} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: realMarginPct >= targetMarginPct ? '#15803d' : '#b45309' }}>
                {realMarginPct.toFixed(1)}%
              </span>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                (Meta: {targetMarginPct}%)
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
              Utilidad bruta: ${realMarginAmount.toLocaleString('es-MX', { minimumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      )}

      {/* Week Navigator & Controls */}
      <div 
        style={{ 
          background: 'white', 
          padding: '16px 20px', 
          borderRadius: '16px', 
          border: '1px solid #e2e8f0', 
          display: 'flex', 
          flexWrap: 'wrap', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '12px' 
        }}
      >
        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '12px', padding: '4px' }}>
            <button
              onClick={handlePrevWeek}
              style={{ background: 'transparent', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
              title="Semana anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleThisWeek}
              style={{ background: 'white', border: 'none', padding: '6px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
            >
              Hoy
            </button>
            <button
              onClick={handleNextWeek}
              style={{ background: 'transparent', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
              title="Semana siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
            <Calendar size={18} color="#3b82f6" />
            <span>
              Semana del {weekDays[0].displayDate} al {weekDays[6].displayDate} ({new Date(weekDays[0].dateStr).getFullYear()})
            </span>
          </div>
        </div>

        {/* Filter by collaborator & Save Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isManagerOrAdmin && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={16} color="#64748b" />
              <select
                className="form-input"
                style={{ height: '38px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 600, padding: '0 10px' }}
                value={filterProfileId}
                onChange={(e) => setFilterProfileId(e.target.value)}
              >
                <option value="ALL">👥 Todo el Equipo</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {dirtyTasks.size > 0 && (
            <button
              onClick={handleSaveGrid}
              disabled={savingGrid}
              className="btn btn-primary"
              style={{
                borderRadius: '10px',
                height: '38px',
                padding: '0 18px',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Save size={16} />
              {savingGrid ? 'Guardando...' : `Guardar Cambios (${dirtyTasks.size})`}
            </button>
          )}
        </div>
      </div>

      {/* Timesheet Matrix Table */}
      <div 
        style={{ 
          background: 'white', 
          borderRadius: '16px', 
          border: '1px solid #e2e8f0', 
          overflow: 'hidden', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' 
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 20px', fontSize: '0.75rem', fontWeight: 800, color: '#475569', minWidth: '240px' }}>
                  TAREA / ASIGNADO
                </th>
                <th style={{ padding: '14px 12px', fontSize: '0.75rem', fontWeight: 800, color: '#475569', width: '90px', textAlign: 'center' }}>
                  ESTIMADO
                </th>
                {weekDays.map((d) => (
                  <th 
                    key={d.dateStr}
                    style={{ 
                      padding: '12px 8px', 
                      fontSize: '0.75rem', 
                      fontWeight: 800, 
                      color: d.isToday ? '#2563eb' : '#475569',
                      background: d.isToday ? '#eff6ff' : 'transparent',
                      textAlign: 'center',
                      minWidth: '70px'
                    }}
                  >
                    <div>{d.name}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{d.displayDate}</div>
                  </th>
                ))}
                <th style={{ padding: '14px 12px', fontSize: '0.75rem', fontWeight: 800, color: '#1e293b', width: '90px', textAlign: 'center' }}>
                  TOTAL SEMANA
                </th>
                <th style={{ padding: '14px 12px', width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    Cargando matriz de horas...
                  </td>
                </tr>
              ) : displayTasks.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    No hay tareas asignadas para el filtro seleccionado en este proyecto.
                  </td>
                </tr>
              ) : (
                displayTasks.map((t) => {
                  const assignedCollab = profiles.find((p) => p.id === t.assigned_to);
                  const taskLogs = logs.filter((l) => l.task_id === t.id);
                  const taskWeekTotal = weekDays.reduce((acc, d) => {
                    const gridVal = gridHours[t.id]?.[d.dateStr];
                    if (gridVal !== undefined) return acc + (parseFloat(gridVal) || 0);
                    const log = taskLogs.find((l) => l.work_date === d.dateStr);
                    return acc + Number(log?.hours_logged || 0);
                  }, 0);

                  return (
                    <tr 
                      key={t.id}
                      style={{ 
                        borderBottom: '1px solid #f1f5f9',
                        background: dirtyTasks.has(t.id) ? '#fffbeb' : 'transparent'
                      }}
                    >
                      {/* Task Info */}
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                          {t.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <User size={12} />
                            {assignedCollab?.full_name || 'Sin asignar'}
                          </span>
                          {t.status === 'done' && (
                            <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              Terminada
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Estimated Hours */}
                      <td style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>
                        {t.estimated_hours ? `${t.estimated_hours}h` : '-'}
                      </td>

                      {/* 7 Week Day Input Cells */}
                      {weekDays.map((d) => {
                        const cellVal = gridHours[t.id]?.[d.dateStr] || '';

                        return (
                          <td 
                            key={d.dateStr}
                            style={{ 
                              padding: '8px 4px', 
                              textAlign: 'center',
                              background: d.isToday ? 'rgba(239, 246, 255, 0.4)' : 'transparent'
                            }}
                          >
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              placeholder="-"
                              value={cellVal}
                              onChange={(e) => handleGridHourChange(t.id, d.dateStr, e.target.value)}
                              style={{
                                width: '56px',
                                height: '34px',
                                textAlign: 'center',
                                borderRadius: '8px',
                                border: cellVal ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                background: cellVal ? '#eff6ff' : 'white',
                                fontWeight: cellVal ? 800 : 500,
                                color: cellVal ? '#1d4ed8' : '#94a3b8',
                                fontSize: '0.85rem',
                                outline: 'none'
                              }}
                            />
                          </td>
                        );
                      })}

                      {/* Task Week Total */}
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', color: taskWeekTotal > 0 ? '#1e293b' : '#94a3b8' }}>
                        {taskWeekTotal.toFixed(1)}h
                      </td>

                      {/* Quick Detail Modal Trigger */}
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <button
                          onClick={() => setSelectedTaskForModal(t)}
                          style={{
                            background: '#f1f5f9',
                            border: 'none',
                            padding: '6px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: '#475569'
                          }}
                          title="Detalles y notas de esta tarea"
                        >
                          <Plus size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Total Row */}
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: '#0f172a' }}>
                  TOTAL HORAS REGISTRADAS
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'center', color: '#64748b' }}>-</td>
                {dailyTotals.map((tot, idx) => (
                  <td 
                    key={idx}
                    style={{ 
                      padding: '14px 4px', 
                      textAlign: 'center', 
                      fontSize: '0.85rem', 
                      color: tot > 8 ? '#ef4444' : tot > 0 ? '#2563eb' : '#94a3b8',
                      background: weekDays[idx].isToday ? '#eff6ff' : 'transparent'
                    }}
                  >
                    {tot > 0 ? `${tot.toFixed(1)}h` : '-'}
                  </td>
                ))}
                <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: '0.95rem', color: '#1e293b' }}>
                  {weekTotalHours.toFixed(1)}h
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Quick Time Log Modal */}
      {selectedTaskForModal && (
        <QuickTimeLogModal
          isOpen={true}
          onClose={() => setSelectedTaskForModal(null)}
          taskId={selectedTaskForModal.id}
          projectId={projectId}
          taskTitle={selectedTaskForModal.title}
          projectName={project?.title}
          onLogSaved={() => {
            fetchWeekLogs();
            if (onDataUpdated) onDataUpdated();
          }}
        />
      )}
    </div>
  );
}
