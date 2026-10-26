import { useState, useEffect } from 'react';
import { 
  Pin, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  User, 
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { DirectoryMember } from './ProjectDirectoryManager';
import type { Deliverable } from '../../types/projectControl';

export interface AgreementPendingItem {
  id: string;
  project_id: string;
  item_type: 'Acuerdo' | 'Pendiente';
  title: string;
  link_type: 'general' | 'entregable' | 'tarea';
  deliverable_id?: string;
  task_id?: string;
  responsible_member_id?: string;
  responsible_name?: string;
  deadline?: string;
  non_compliance_impact?: string;
  status: 'abierto' | 'cumplido';
  created_at: string;
}

interface ProjectAgreementsManagerProps {
  projectId: string;
  deliverables?: Deliverable[];
  tasks?: any[];
  directoryMembers?: DirectoryMember[];
  onDataUpdated?: () => void;
}

export default function ProjectAgreementsManager({
  projectId,
  deliverables = [],
  tasks = [],
  directoryMembers = [],
  onDataUpdated
}: ProjectAgreementsManagerProps) {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<AgreementPendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'Acuerdo' | 'Pendiente'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'abierto' | 'cumplido'>('abierto');

  // Formulario nuevo
  const [showAddForm, setShowAddForm] = useState(false);
  const [itemType, setItemType] = useState<'Acuerdo' | 'Pendiente'>('Pendiente');
  const [title, setTitle] = useState('');
  const [linkType, setLinkType] = useState<'general' | 'entregable' | 'tarea'>('general');
  const [selectedDeliverableId, setSelectedDeliverableId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [responsibleMemberId, setResponsibleMemberId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [impact, setImpact] = useState('');
  const [saving, setSaving] = useState(false);

  // Miembros resueltos con fallback garantizado a localStorage
  const [effectiveMembers, setEffectiveMembers] = useState<DirectoryMember[]>(directoryMembers);

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
          console.warn('Error reading cached directory in agreements:', e);
        }
      }
    }
  }, [directoryMembers, projectId]);

  useEffect(() => {
    fetchItems();
  }, [projectId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_agreements_pending')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        const cached = localStorage.getItem(`project_agreements_${projectId}`);
        if (cached) setItems(JSON.parse(cached));
        else setItems([]);
      } else {
        setItems(data || []);
        localStorage.setItem(`project_agreements_${projectId}`, JSON.stringify(data || []));
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return showNotification('error', 'El título o descripción es obligatorio');

    const responsibleObj = effectiveMembers.find(m => m.id === responsibleMemberId);

    setSaving(true);
    const newItem: Partial<AgreementPendingItem> = {
      project_id: projectId,
      item_type: itemType,
      title: title.trim(),
      link_type: linkType,
      deliverable_id: linkType === 'entregable' ? selectedDeliverableId || undefined : undefined,
      task_id: linkType === 'tarea' ? selectedTaskId || undefined : undefined,
      responsible_member_id: responsibleMemberId || undefined,
      responsible_name: responsibleObj?.name || undefined,
      deadline: deadline || undefined,
      non_compliance_impact: impact.trim() || undefined,
      status: 'abierto',
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('project_agreements_pending')
        .insert([newItem])
        .select()
        .single();

      if (error) {
        const localItem: AgreementPendingItem = {
          ...newItem,
          id: 'agr_' + Date.now(),
          status: 'abierto',
          created_at: new Date().toISOString()
        } as AgreementPendingItem;
        const updated = [localItem, ...items];
        setItems(updated);
        localStorage.setItem(`project_agreements_${projectId}`, JSON.stringify(updated));
      } else if (data) {
        const updated = [data, ...items];
        setItems(updated);
        localStorage.setItem(`project_agreements_${projectId}`, JSON.stringify(updated));
      }

      showNotification('success', `${itemType} registrado correctamente`);
      setTitle('');
      setImpact('');
      setDeadline('');
      setShowAddForm(false);
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: AgreementPendingItem) => {
    const newStatus: 'abierto' | 'cumplido' = item.status === 'abierto' ? 'cumplido' : 'abierto';
    try {
      await supabase
        .from('project_agreements_pending')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      const updated = items.map(i => i.id === item.id ? { ...i, status: newStatus } : i);
      setItems(updated);
      localStorage.setItem(`project_agreements_${projectId}`, JSON.stringify(updated));
      showNotification('success', `Marcado como ${newStatus}`);
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      await supabase.from('project_agreements_pending').delete().eq('id', id);
      const updated = items.filter(i => i.id !== id);
      setItems(updated);
      localStorage.setItem(`project_agreements_${projectId}`, JSON.stringify(updated));
      showNotification('success', 'Registro eliminado');
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      console.error(err);
    }
  };

  const filteredItems = items.filter(i => {
    if (filterType !== 'all' && i.item_type !== filterType) return false;
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Informativo del Paso 4 */}
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
              background: '#fef3c7', 
              color: '#b45309', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              padding: '4px 10px', 
              borderRadius: '8px' 
            }}>
              PASO 4 DEL FLUJO PM
            </span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Acuerdos y Pendientes
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Registro de compromisos entre Cliente y Store vinculados a entregables, tareas o al proyecto en general, con impacto de incumplimiento y fecha límite.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filtro Tipo */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px' }}>
            <button
              onClick={() => setFilterType('all')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterType === 'all' ? 'white' : 'transparent',
                color: filterType === 'all' ? '#1e293b' : '#64748b',
                cursor: 'pointer'
              }}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => setFilterType('Acuerdo')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterType === 'Acuerdo' ? 'white' : 'transparent',
                color: filterType === 'Acuerdo' ? '#059669' : '#64748b',
                cursor: 'pointer'
              }}
            >
              🤝 Acuerdos ({items.filter(i => i.item_type === 'Acuerdo').length})
            </button>
            <button
              onClick={() => setFilterType('Pendiente')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterType === 'Pendiente' ? 'white' : 'transparent',
                color: filterType === 'Pendiente' ? '#ea580c' : '#64748b',
                cursor: 'pointer'
              }}
            >
              ⏳ Pendientes ({items.filter(i => i.item_type === 'Pendiente').length})
            </button>
          </div>

          {/* Filtro Estado */}
          <select
            className="form-input"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            style={{ width: 'auto', height: '36px', padding: '0 10px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }}
          >
            <option value="abierto">Abiertos</option>
            <option value="cumplido">Cumplidos</option>
            <option value="all">Todos los estados</option>
          </select>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
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
            {showAddForm ? <X size={15} /> : <Plus size={15} />}
            {showAddForm ? 'Cerrar' : '+ Nuevo Acuerdo/Pendiente'}
          </button>
        </div>
      </div>

      {/* Formulario de Alta */}
      {showAddForm && (
        <form 
          onSubmit={handleAddItem}
          style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '16px', 
            border: '2px solid #f59e0b',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.08)' 
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pin size={18} color="#f59e0b" /> Registrar Acuerdo o Pendiente
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            {/* Tipo */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                TIPO *
              </label>
              <select
                className="form-input"
                value={itemType}
                onChange={e => setItemType(e.target.value as any)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                <option value="Pendiente">⏳ Pendiente</option>
                <option value="Acuerdo">🤝 Acuerdo</option>
              </select>
            </div>

            {/* Vinculación */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                VINCULACIÓN *
              </label>
              <select
                className="form-input"
                value={linkType}
                onChange={e => setLinkType(e.target.value as any)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <option value="general">🌐 Impacto general del proyecto</option>
                <option value="entregable">📦 Ligado a un Entregable</option>
                <option value="tarea">📋 Ligado a una Tarea</option>
              </select>
            </div>

            {/* Selección según Vinculación */}
            {linkType === 'entregable' && (
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                  ENTREGABLE RELACIONADO
                </label>
                <select
                  className="form-input"
                  value={selectedDeliverableId}
                  onChange={e => setSelectedDeliverableId(e.target.value)}
                  style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
                >
                  <option value="">Selecciona entregable...</option>
                  {deliverables.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {linkType === 'tarea' && (
              <div>
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                  TAREA RELACIONADA
                </label>
                <select
                  className="form-input"
                  value={selectedTaskId}
                  onChange={e => setSelectedTaskId(e.target.value)}
                  style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
                >
                  <option value="">Selecciona tarea...</option>
                  {tasks.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Responsable (Directorio Paso 1) */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                RESPONSABLE (DIRECTORIO PASO 1)
              </label>
              <select
                className="form-input"
                value={responsibleMemberId}
                onChange={e => setResponsibleMemberId(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <option value="">Seleccionar del Directorio ({effectiveMembers.length} disponibles)...</option>
                {effectiveMembers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.group_type} - {m.role_title}{m.secondary_role_title ? ` / ${m.secondary_role_title}` : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Deadline */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                DEADLINE / FECHA LÍMITE
              </label>
              <input
                type="date"
                className="form-input"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Título */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
              DESCRIPCIÓN DEL ACUERDO O PENDIENTE *
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Cliente entregará accesos al ambiente de staging antes del viernes..."
              className="form-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
            />
          </div>

          {/* Impacto de Incumplimiento */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
              IMPACTO DE INCUMPLIMIENTO (TEXTO LIBRE DEL PM)
            </label>
            <textarea
              rows={2}
              placeholder="Ej: Si no se entregan accesos en la fecha, se retrasará el inicio de pruebas y se generará adenda por desfase de calendario..."
              className="form-input"
              value={impact}
              onChange={e => setImpact(e.target.value)}
              style={{ width: '100%', borderRadius: '10px', fontSize: '0.85rem', padding: '10px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="btn btn-secondary"
              style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ borderRadius: '10px', padding: '8px 20px', fontSize: '0.8rem', fontWeight: 700, background: '#f59e0b', borderColor: '#d97706' }}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Lista de Acuerdos y Pendientes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
            Cargando acuerdos y pendientes...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <Pin size={32} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontWeight: 700, color: '#64748b' }}>
              No hay acuerdos ni pendientes registrados.
            </p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              Utiliza el botón "+ Nuevo Acuerdo/Pendiente" para documentar compromisos clave del proyecto.
            </p>
          </div>
        ) : (
          filteredItems.map(item => {
            const isCompleted = item.status === 'cumplido';
            const isOverdue = !isCompleted && item.deadline && new Date(item.deadline + 'T23:59:59') < new Date();

            return (
              <div 
                key={item.id}
                style={{ 
                  background: 'white', 
                  borderRadius: '14px', 
                  border: `1px solid ${isOverdue ? '#fca5a5' : isCompleted ? '#bbf7d0' : '#e2e8f0'}`,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  opacity: isCompleted ? 0.75 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
                  <button
                    onClick={() => handleToggleStatus(item)}
                    style={{ 
                      background: 'transparent', 
                      border: 'none', 
                      cursor: 'pointer',
                      padding: 0,
                      marginTop: '2px'
                    }}
                    title={isCompleted ? 'Marcar como abierto' : 'Marcar como cumplido'}
                  >
                    {isCompleted ? (
                      <CheckCircle2 size={22} color="#16a34a" />
                    ) : (
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #cbd5e1' }} />
                    )}
                  </button>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 800, 
                        padding: '2px 8px', 
                        borderRadius: '6px',
                        background: item.item_type === 'Acuerdo' ? '#ecfdf5' : '#fff7ed',
                        color: item.item_type === 'Acuerdo' ? '#059669' : '#ea580c'
                      }}>
                        {item.item_type === 'Acuerdo' ? '🤝 Acuerdo' : '⏳ Pendiente'}
                      </span>

                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        color: '#64748b',
                        background: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: '6px'
                      }}>
                        {item.link_type === 'general' ? '🌐 Impacto General' : item.link_type === 'entregable' ? '📦 Entregable' : '📋 Tarea'}
                      </span>

                      {isOverdue && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: '6px' }}>
                          ⚠️ VENCIDO
                        </span>
                      )}
                    </div>

                    <div style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: 700, 
                      color: isCompleted ? '#64748b' : '#0f172a',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      marginBottom: '8px'
                    }}>
                      {item.title}
                    </div>

                    {item.non_compliance_impact && (
                      <div style={{ 
                        background: '#f8fafc', 
                        padding: '8px 12px', 
                        borderRadius: '8px', 
                        borderLeft: '3px solid #f59e0b',
                        fontSize: '0.8rem', 
                        color: '#475569',
                        marginBottom: '8px'
                      }}>
                        <strong>Impacto si incumple:</strong> {item.non_compliance_impact}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.75rem', color: '#64748b', flexWrap: 'wrap' }}>
                      {item.responsible_name && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <User size={12} color="#94a3b8" />
                          <span>Resp: <strong>{item.responsible_name}</strong></span>
                        </div>
                      )}

                      {item.deadline && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isOverdue ? '#dc2626' : '#64748b' }}>
                          <Calendar size={12} />
                          <span>Límite: <strong>{item.deadline}</strong></span>
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                        <Clock size={12} />
                        <span>Creado: {new Date(item.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 8px', color: '#ef4444', borderRadius: '8px' }}
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
