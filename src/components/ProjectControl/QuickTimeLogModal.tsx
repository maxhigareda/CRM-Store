import { useState, useEffect } from 'react';
import { X, Clock, Calendar, FileText, Check, Trash2, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { logTaskHours, deleteTimeLog } from '../../utils/timeTrackingService';
import type { TaskTimeLog } from '../../types/projectControl';

interface QuickTimeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  projectId: string;
  taskTitle: string;
  projectName?: string;
  onLogSaved?: () => void;
}

export default function QuickTimeLogModal({
  isOpen,
  onClose,
  taskId,
  projectId,
  taskTitle,
  projectName,
  onLogSaved
}: QuickTimeLogModalProps) {
  const { profile } = useAuth();
  const { showNotification } = useNotification();
  const isCollaborator = profile?.role === 'collaborator';
  const isManagerOrAdmin = !isCollaborator;

  const [hours, setHours] = useState<string>('2');
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [logs, setLogs] = useState<TaskTimeLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && taskId) {
      fetchLogs();
    }
  }, [isOpen, taskId]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('task_time_logs')
        .select('*, profile:profiles(id, full_name, email)')
        .eq('task_id', taskId)
        .order('work_date', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  if (!isOpen) return null;



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHours = parseFloat(hours);
    if (!parsedHours || parsedHours <= 0) {
      showNotification('error', 'Por favor ingresa un número válido de horas.');
      return;
    }
    if (parsedHours > 24) {
      showNotification('error', 'No puedes registrar más de 24 horas en un día.');
      return;
    }

    setSaving(true);
    const res = await logTaskHours({
      taskId,
      projectId,
      profileId: profile?.id || '',
      workDate,
      hoursLogged: parsedHours,
      description
    });
    setSaving(false);

    if (res.success) {
      showNotification('success', `Se registraron ${parsedHours}h con éxito e impactaron el costo real.`);
      setDescription('');
      fetchLogs();
      if (onLogSaved) onLogSaved();
    } else {
      showNotification('error', res.error || 'Error al registrar horas');
    }
  };

  const handleDelete = async (logId: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este registro de horas? El costo real del proyecto se recalculará.')) {
      return;
    }
    const res = await deleteTimeLog(logId, taskId, projectId);
    if (res.success) {
      showNotification('success', 'Registro eliminado y costo recalculado');
      fetchLogs();
      if (onLogSaved) onLogSaved();
    } else {
      showNotification('error', res.error || 'No se pudo eliminar');
    }
  };

  const totalLoggedOnTask = logs.reduce((acc, l) => acc + Number(l.hours_logged || 0), 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '620px', 
          width: '94%', 
          borderRadius: '24px', 
          background: 'white', 
          overflow: 'hidden', 
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          padding: 0
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', background: '#0f172a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: '#3b82f6', padding: '10px', borderRadius: '12px', display: 'flex' }}>
              <Clock size={20} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Registrar Horas de Trabajo</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                {projectName ? `${projectName} • ` : ''}{taskTitle}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Total Badge */}
        <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}>
            <span style={{ fontWeight: 600 }}>Total registrado en esta tarea:</span>
            <span style={{ fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
              {totalLoggedOnTask.toFixed(1)} hrs
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Impacta el costo del proyecto de inmediato
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                FECHA DE TRABAJO
              </label>
              <div style={{ position: 'relative' }}>
                <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }} />
                <input
                  type="date"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '38px', borderRadius: '12px', height: '42px', fontWeight: 700 }}
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                HORAS TRABAJADAS
              </label>
              <div style={{ position: 'relative' }}>
                <Clock size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: '#94a3b8' }} />
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '38px', borderRadius: '12px', height: '42px', fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="Ej. 3.5"
                  required
                />
              </div>
            </div>
          </div>

          {/* Quick hour pills */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Atajos:</span>
            {[0.5, 1, 2, 4, 8].map((qty) => (
              <button
                key={qty}
                type="button"
                onClick={() => setHours(qty.toString())}
                style={{
                  background: hours === qty.toString() ? '#3b82f6' : '#f1f5f9',
                  color: hours === qty.toString() ? 'white' : '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {qty}h
              </button>
            ))}
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ACTIVIDADES REALIZADAS (NOTAS)
            </label>
            <div style={{ position: 'relative' }}>
              <FileText size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
              <textarea
                className="form-input"
                style={{ width: '100%', paddingLeft: '38px', borderRadius: '12px', minHeight: '65px', fontSize: '0.85rem', paddingTop: '10px' }}
                placeholder="Breve resumen de los avances, resolución de bugs o implementación..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
            style={{
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 800,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            {saving ? 'Guardando...' : (
              <>
                <Check size={18} /> Guardar Horas
              </>
            )}
          </button>
        </form>

        {/* Recent logs history */}
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '16px 24px', maxHeight: '220px', overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Historial de Horas en esta Tarea
          </h4>

          {loadingLogs ? (
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Cargando registros...</p>
          ) : logs.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>Aún no hay horas registradas en esta tarea.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    background: 'white',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 800, color: '#1e293b' }}>{log.hours_logged} hrs</span>
                      <span style={{ color: '#64748b', fontSize: '0.75rem' }}>• {log.work_date}</span>
                      <span style={{ color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600 }}>
                        <User size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '2px' }} />
                        {log.profile?.full_name || 'Colaborador'}
                      </span>
                      {/* Confidentiality: Cost is ONLY visible to PM or Admin */}
                      {isManagerOrAdmin && log.hourly_rate_snapshot && (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
                          ${(Number(log.hours_logged) * Number(log.hourly_rate_snapshot)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                        </span>
                      )}
                    </div>
                    {log.description && (
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                        "{log.description}"
                      </span>
                    )}
                  </div>

                  {/* Delete button: Only PM/Admin can delete past logs */}
                  {isManagerOrAdmin && log.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(log.id!)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px'
                      }}
                      title="Eliminar registro (recalculará costo del proyecto)"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
