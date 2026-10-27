import { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ArrowUp, 
  ArrowDown, 
  Layers, 
  Check, 
  Calendar 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { Deliverable } from '../../types/projectControl';

interface PhaseItem {
  id?: string;
  name: string;
  duration_weeks: number;
  order_index: number;
}

interface EditProjectPhasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentPhases: PhaseItem[];
  deliverables?: Deliverable[];
  onPhasesUpdated: () => void;
}

export default function EditProjectPhasesModal({
  isOpen,
  onClose,
  projectId,
  currentPhases,
  deliverables = [],
  onPhasesUpdated
}: EditProjectPhasesModalProps) {
  const { showNotification } = useNotification();
  const [phases, setPhases] = useState<PhaseItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (currentPhases && currentPhases.length > 0) {
        setPhases([...currentPhases].sort((a, b) => a.order_index - b.order_index));
      } else {
        // Si no hay etapas, proponer etapas estándar o derivarlas de entregables
        if (deliverables.length > 0) {
          handleSyncFromDeliverables(false);
        } else {
          setPhases([
            { name: 'Fase 1: Descubrimiento y Levantamiento', duration_weeks: 2, order_index: 0 },
            { name: 'Fase 2: Diseño y Arquitectura', duration_weeks: 2, order_index: 1 },
            { name: 'Fase 3: Desarrollo y Pruebas', duration_weeks: 4, order_index: 2 },
            { name: 'Fase 4: Despliegue y Cierre', duration_weeks: 1, order_index: 3 },
          ]);
        }
      }
    }
  }, [isOpen, currentPhases, deliverables]);

  if (!isOpen) return null;

  // Sincronizar automáticamente etapas a partir de Entregables
  const handleSyncFromDeliverables = (showToast = true) => {
    if (!deliverables || deliverables.length === 0) {
      if (showToast) showNotification('error', 'No hay entregables dados de alta en el Paso 2 para generar etapas');
      return;
    }

    const generated: PhaseItem[] = deliverables.map((d, idx) => {
      let weeks = 2;
      if (d.baseline_start_date && d.baseline_end_date) {
        const start = new Date(d.baseline_start_date + 'T00:00:00');
        const end = new Date(d.baseline_end_date + 'T00:00:00');
        if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
          const diffDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
          weeks = Math.max(1, Math.round(diffDays / 7));
        }
      }
      return {
        name: d.name,
        duration_weeks: weeks,
        order_index: idx
      };
    });

    setPhases(generated);
    if (showToast) {
      showNotification('success', `⚡ ${generated.length} Etapas generadas desde los Entregables. Recuerda hacer clic en "Guardar Cambios".`);
    }
  };

  const handleAddPhase = () => {
    setPhases(prev => [
      ...prev,
      {
        name: `Etapa ${prev.length + 1}: Nueva Etapa`,
        duration_weeks: 2,
        order_index: prev.length
      }
    ]);
  };

  const handleRemovePhase = (index: number) => {
    setPhases(prev => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.map((item, idx) => ({ ...item, order_index: idx }));
    });
  };

  const handleUpdatePhase = (index: number, field: 'name' | 'duration_weeks', value: any) => {
    setPhases(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === phases.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setPhases(prev => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next.map((item, idx) => ({ ...item, order_index: idx }));
    });
  };

  const handleSave = async () => {
    if (phases.length === 0) {
      return showNotification('error', 'Debes incluir al menos una etapa para el proyecto');
    }

    for (let i = 0; i < phases.length; i++) {
      if (!phases[i].name.trim()) {
        return showNotification('error', `El nombre de la etapa #${i + 1} no puede estar vacío`);
      }
      if (phases[i].duration_weeks <= 0) {
        return showNotification('error', `La duración de la etapa #${i + 1} debe ser de al menos 1 semana`);
      }
    }

    setSaving(true);
    try {
      // 1. Reemplazar etapas en project_phases de forma segura
      await supabase
        .from('project_phases')
        .delete()
        .eq('project_id', projectId);

      const payload = phases.map((p, idx) => ({
        project_id: projectId,
        name: p.name.trim(),
        duration_weeks: Number(p.duration_weeks) || 1,
        order_index: idx
      }));

      const { error } = await supabase
        .from('project_phases')
        .insert(payload);

      if (error) throw error;

      // 2. Actualizar duration_weeks total del proyecto si difiere
      const totalWeeks = phases.reduce((acc, curr) => acc + (Number(curr.duration_weeks) || 1), 0);
      await supabase
        .from('projects')
        .update({ duration_weeks: totalWeeks })
        .eq('id', projectId);

      showNotification('success', 'Etapas del proyecto actualizadas exitosamente');
      onPhasesUpdated();
      onClose();
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al guardar etapas: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const totalWeeks = phases.reduce((acc, curr) => acc + (Number(curr.duration_weeks) || 0), 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-content" style={{ maxWidth: '820px', width: '95%', padding: '28px', borderRadius: '20px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ background: '#eff6ff', color: '#2563eb', padding: '6px', borderRadius: '10px' }}>
                <Layers size={20} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                Modificar Etapas del Proyecto
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Ajusta las etapas del cronograma (Gantt) y conéctalas directamente con los Entregables configurados en el Paso 2.
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="modal-close"
            style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} color="#64748b" />
          </button>
        </div>

        {/* Acciones Rápidas */}
        <div style={{ 
          background: '#f8fafc', 
          border: '1px solid #e2e8f0', 
          borderRadius: '12px', 
          padding: '12px 16px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#475569' }}>
            <Calendar size={16} color="#6366f1" />
            <span>
              Total cronograma: <strong>{totalWeeks} semanas</strong> (~{totalWeeks * 5} días hábiles)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {deliverables.length > 0 && (
              <button
                type="button"
                onClick={() => handleSyncFromDeliverables(true)}
                className="btn btn-secondary"
                style={{ 
                  background: '#f5f3ff', 
                  color: '#6d28d9', 
                  borderColor: '#ddd6fe', 
                  fontSize: '0.78rem', 
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '8px',
                  padding: '6px 12px'
                }}
              >
                <RefreshCw size={13} /> ⚡ Sincronizar desde Entregables ({deliverables.length})
              </button>
            )}

            <button
              type="button"
              onClick={handleAddPhase}
              className="btn btn-primary"
              style={{ 
                fontSize: '0.78rem', 
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '8px',
                padding: '6px 14px'
              }}
            >
              <Plus size={14} /> + Agregar Etapa
            </button>
          </div>
        </div>

        {/* Lista de Etapas */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', marginBottom: '24px', paddingRight: '4px' }}>
          {phases.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
              No hay etapas configuradas. Haz clic en "Sincronizar desde Entregables" o en "+ Agregar Etapa".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {phases.map((phase, idx) => {
                const isLinkedDeliverable = deliverables.some(d => d.name.toLowerCase() === phase.name.toLowerCase());
                return (
                  <div
                    key={idx}
                    style={{
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Controles de orden */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'up')}
                        disabled={idx === 0}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          opacity: idx === 0 ? 0.3 : 1
                        }}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'down')}
                        disabled={idx === phases.length - 1}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          cursor: idx === phases.length - 1 ? 'not-allowed' : 'pointer',
                          opacity: idx === phases.length - 1 ? 0.3 : 1
                        }}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    <div style={{ 
                      width: '26px', 
                      height: '26px', 
                      borderRadius: '50%', 
                      background: '#eff6ff', 
                      color: '#2563eb', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>
                      {idx + 1}
                    </div>

                    {/* Nombre de la Etapa */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b' }}>
                          NOMBRE DE LA ETAPA
                        </span>
                        {isLinkedDeliverable && (
                          <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            📦 Vinculada a Entregable
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        value={phase.name}
                        onChange={e => handleUpdatePhase(idx, 'name', e.target.value)}
                        placeholder="Ej. Fase 1: Levantamiento de Requerimientos..."
                        style={{ height: '36px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px' }}
                      />
                    </div>

                    {/* Duración en Semanas */}
                    <div style={{ width: '130px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                        DURACIÓN (SEMANAS)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          min={1}
                          max={52}
                          className="form-input"
                          value={phase.duration_weeks}
                          onChange={e => handleUpdatePhase(idx, 'duration_weeks', Number(e.target.value))}
                          style={{ height: '36px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center', borderRadius: '8px' }}
                        />
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>sem</span>
                      </div>
                    </div>

                    {/* Botón Eliminar */}
                    <button
                      type="button"
                      onClick={() => handleRemovePhase(idx)}
                      style={{
                        background: '#fef2f2',
                        border: 'none',
                        color: '#ef4444',
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        marginTop: '16px'
                      }}
                      title="Eliminar etapa"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '18px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ borderRadius: '10px', padding: '8px 18px', fontSize: '0.85rem' }}
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ 
              borderRadius: '10px', 
              padding: '8px 24px', 
              fontSize: '0.85rem', 
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#4f46e5'
            }}
          >
            <Check size={16} />
            {saving ? 'Guardando Etapas...' : 'Guardar Cambios de Etapas'}
          </button>
        </div>

      </div>
    </div>
  );
}
