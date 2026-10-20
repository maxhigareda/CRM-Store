import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Layers, 
  AlertCircle,
  Edit2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { Deliverable } from '../../types/projectControl';

interface DeliverablesManagerProps {
  projectId: string;
  deliverables: Deliverable[];
  onDeliverablesUpdated: () => void;
  canEdit?: boolean;
}

export default function DeliverablesManager({
  projectId,
  deliverables,
  onDeliverablesUpdated,
  canEdit = true
}: DeliverablesManagerProps) {
  const { showNotification } = useNotification();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Deliverable | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weightPct, setWeightPct] = useState<number>(20);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [baselineStartDate, setBaselineStartDate] = useState('');
  const [baselineEndDate, setBaselineEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Cálculo total de pesos
  const totalWeight = deliverables.reduce((acc, curr) => acc + (Number(curr.weight_pct) || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 100) < 0.1;

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    // Proponer peso restante
    const remaining = Math.max(0, 100 - totalWeight);
    setWeightPct(remaining > 0 ? remaining : 10);
    setAcceptanceCriteria('');
    setBaselineStartDate('');
    setBaselineEndDate('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: Deliverable) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || '');
    setWeightPct(item.weight_pct);
    setAcceptanceCriteria(item.acceptance_criteria || '');
    setBaselineStartDate(item.baseline_start_date || '');
    setBaselineEndDate(item.baseline_end_date || '');
    setShowAddModal(true);
  };

  const handleSaveDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showNotification('error', 'El nombre del entregable es obligatorio');
    if (weightPct <= 0 || weightPct > 100) return showNotification('error', 'El peso debe estar entre 1% y 100%');

    setSaving(true);
    try {
      if (editingItem && editingItem.id) {
        const { error } = await supabase
          .from('project_deliverables')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            weight_pct: weightPct,
            acceptance_criteria: acceptanceCriteria.trim() || null,
            baseline_start_date: baselineStartDate || null,
            baseline_end_date: baselineEndDate || null,
            current_end_date: baselineEndDate || null
          })
          .eq('id', editingItem.id);

        if (error) throw error;
        showNotification('success', 'Entregable actualizado');
      } else {
        const { error } = await supabase
          .from('project_deliverables')
          .insert([{
            project_id: projectId,
            name: name.trim(),
            description: description.trim() || null,
            weight_pct: weightPct,
            status: 'pending',
            acceptance_criteria: acceptanceCriteria.trim() || null,
            baseline_start_date: baselineStartDate || null,
            baseline_end_date: baselineEndDate || null,
            current_end_date: baselineEndDate || null
          }]);

        if (error) throw error;
        showNotification('success', 'Entregable creado exitosamente');
      }

      setShowAddModal(false);
      onDeliverablesUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al guardar entregable: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeliverable = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este entregable? Las tareas asociadas perderán su vínculo.')) return;
    try {
      const { error } = await supabase.from('project_deliverables').delete().eq('id', id);
      if (error) throw error;
      showNotification('success', 'Entregable eliminado');
      onDeliverablesUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al eliminar: ' + err.message);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('project_deliverables')
        .update({ status: newStatus })
        .eq('id', id);
      if (error) throw error;
      showNotification('success', 'Estado de entregable actualizado');
      onDeliverablesUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al actualizar estado: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header y Control de Peso */}
      <div style={{
        background: 'white',
        padding: '16px 20px',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#f5f3ff', padding: '10px', borderRadius: '10px', color: '#7c3aed' }}>
            <Layers size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Entregables del Proyecto ({deliverables.length})
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Cada entregable tiene un peso asignado para el cálculo de avance real ponderado
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: isWeightValid ? '#f0fdf4' : '#fff7ed',
            border: `1px solid ${isWeightValid ? '#bbf7d0' : '#fed7aa'}`,
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: isWeightValid ? '#15803d' : '#b45309',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            {isWeightValid ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>Suma de Pesos: {totalWeight.toFixed(1)}% / 100%</span>
          </div>

          {canEdit && (
            <button
              onClick={handleOpenAdd}
              className="btn btn-primary"
              style={{ background: '#7c3aed', borderColor: '#6d28d9', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} /> Nuevo Entregable
            </button>
          )}
        </div>
      </div>

      {/* Lista de Entregables */}
      {deliverables.length === 0 ? (
        <div style={{ background: 'white', padding: '40px 20px', borderRadius: '14px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
          <Layers size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
          <h4 style={{ margin: '0 0 4px', fontWeight: 700, color: '#1e293b' }}>Sin entregables configurados</h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Agrega los paquetes de trabajo clave para calcular el avance real ponderado del proyecto.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
          {deliverables.map(item => {
            const isAccepted = item.status === 'accepted';
            const isInProgress = item.status === 'in_progress';
            const isReview = item.status === 'review';

            return (
              <div 
                key={item.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  border: `1px solid ${isAccepted ? '#bbf7d0' : '#e2e8f0'}`,
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: '#f3e8ff',
                        color: '#7c3aed',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px'
                      }}>
                        {item.weight_pct}%
                      </span>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                        {item.name}
                      </h4>
                    </div>

                    {canEdit && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: '2px' }}
                          title="Editar entregable"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => item.id && handleDeleteDeliverable(item.id)}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                          title="Eliminar entregable"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {item.description && (
                    <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                      {item.description}
                    </p>
                  )}

                  {item.acceptance_criteria && (
                    <div style={{ marginTop: '10px', background: '#f8fafc', padding: '8px 10px', borderRadius: '6px', fontSize: '0.75rem', color: '#475569' }}>
                      <strong>Criterio de Aceptación:</strong> {item.acceptance_criteria}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} />
                    <span>Límite: {item.current_end_date || item.baseline_end_date || 'Por definir'}</span>
                  </div>

                  <select
                    disabled={!canEdit}
                    value={item.status}
                    onChange={e => item.id && handleStatusChange(item.id, e.target.value)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: '1px solid #cbd5e1',
                      background: isAccepted ? '#f0fdf4' : isReview ? '#f5f3ff' : isInProgress ? '#eff6ff' : '#f8fafc',
                      color: isAccepted ? '#15803d' : isReview ? '#7c3aed' : isInProgress ? '#2563eb' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="in_progress">⚡ En Proceso</option>
                    <option value="review">👀 En Revisión</option>
                    <option value="accepted">✓ Aceptado / Cumplido</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Crear/Editar Entregable */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1200,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '540px',
            maxWidth: '94%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
              {editingItem ? 'Editar Entregable' : 'Nuevo Entregable de Proyecto'}
            </h3>

            <form onSubmit={handleSaveDeliverable} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  NOMBRE DEL ENTREGABLE *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej. Arquitectura Data Pipeline, Reporte Power BI..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    PESO PONDERADO (% EN PROYECTO) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    step={0.5}
                    value={weightPct}
                    onChange={e => setWeightPct(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    FECHA FIN ESTIMADA
                  </label>
                  <input
                    type="date"
                    value={baselineEndDate}
                    onChange={e => setBaselineEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  CRITERIO DE ACEPTACIÓN
                </label>
                <textarea
                  rows={2}
                  value={acceptanceCriteria}
                  onChange={e => setAcceptanceCriteria(e.target.value)}
                  placeholder="¿Qué condiciones debe cumplir para considerarse aceptado por el cliente?"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  DESCRIPCIÓN DEL ALCANCE
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detalla qué incluye y qué excluye este entregable..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ background: '#7c3aed', borderColor: '#6d28d9', fontSize: '0.85rem' }}
                >
                  {saving ? 'Guardando...' : 'Guardar Entregable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
