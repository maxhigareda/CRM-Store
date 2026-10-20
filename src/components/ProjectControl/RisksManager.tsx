import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Plus, 
  CheckCircle, 
  Lock 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { Deliverable } from '../../types/projectControl';

export interface ProjectRisk {
  id?: string;
  project_id: string;
  deliverable_id?: string;
  task_id?: string;
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';
  status: 'identified' | 'mitigated' | 'materialized' | 'resolved';
  mitigation_plan?: string;
  responsible_id?: string;
  materialized_impact_summary?: string;
  responsible?: { id: string; full_name: string; email: string };
  deliverable?: { id: string; name: string };
}

interface RisksManagerProps {
  projectId: string;
  risks: ProjectRisk[];
  deliverables: Deliverable[];
  tasks: any[];
  profiles: any[];
  onRisksUpdated: () => void;
  canEdit?: boolean;
}

export default function RisksManager({
  projectId,
  risks,
  deliverables,
  onRisksUpdated,
  canEdit = true
}: RisksManagerProps) {
  const { showNotification } = useNotification();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [probability, setProbability] = useState<'low' | 'medium' | 'high'>('medium');
  const [deliverableId, setDeliverableId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [saving, setSaving] = useState(false);

  // Materialize Modal State
  const [materializingRisk, setMaterializingRisk] = useState<ProjectRisk | null>(null);
  const [materializedImpact, setMaterializedImpact] = useState('');
  const [blockLinkedTask, setBlockLinkedTask] = useState(true);

  const handleOpenAdd = () => {
    setEditingRisk(null);
    setTitle('');
    setDescription('');
    setSeverity('high');
    setProbability('medium');
    setDeliverableId('');
    setTaskId('');
    setResponsibleId('');
    setMitigationPlan('');
    setShowAddModal(true);
  };

  const handleSaveRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return showNotification('error', 'El título del riesgo es obligatorio');

    setSaving(true);
    try {
      const riskPayload = {
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        probability,
        deliverable_id: deliverableId || null,
        task_id: taskId || null,
        responsible_id: responsibleId || null,
        mitigation_plan: mitigationPlan.trim() || null,
        status: editingRisk ? editingRisk.status : 'identified'
      };

      if (editingRisk && editingRisk.id) {
        const { error } = await supabase
          .from('project_risks')
          .update(riskPayload)
          .eq('id', editingRisk.id);
        if (error) throw error;
        showNotification('success', 'Riesgo actualizado');
      } else {
        const { error } = await supabase.from('project_risks').insert([riskPayload]);
        if (error) throw error;
        showNotification('success', 'Riesgo registrado en la matriz');
      }

      setShowAddModal(false);
      onRisksUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al guardar riesgo: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Materializar riesgo (bloquear tarea vinculada)
  const handleMaterializeRisk = async () => {
    if (!materializingRisk || !materializingRisk.id) return;
    if (!materializedImpact.trim()) {
      return showNotification('error', 'Debes documentar la persona responsable y el impacto general en el proyecto.');
    }

    try {
      // 1. Actualizar estado del riesgo a 'materialized'
      const { error: riskErr } = await supabase
        .from('project_risks')
        .update({
          status: 'materialized',
          materialized_impact_summary: materializedImpact.trim()
        })
        .eq('id', materializingRisk.id);

      if (riskErr) throw riskErr;

      // 2. Si tiene tarea vinculada y se marcó bloquear, pausar/bloquear la tarea
      if (materializingRisk.task_id && blockLinkedTask) {
        await supabase
          .from('tasks')
          .update({
            is_blocked: true,
            block_reason: `Riesgo Materializado: ${materializingRisk.title}. Impacto: ${materializedImpact.trim()}`
          })
          .eq('id', materializingRisk.task_id);
      }

      showNotification('success', 'Riesgo marcado como Materializado y tarea vinculada bloqueada preventivamente.');
      setMaterializingRisk(null);
      setMaterializedImpact('');
      onRisksUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al materializar riesgo: ' + err.message);
    }
  };

  const handleResolveRisk = async (risk: ProjectRisk) => {
    if (!risk.id) return;
    try {
      await supabase.from('project_risks').update({ status: 'resolved' }).eq('id', risk.id);
      if (risk.task_id) {
        await supabase.from('tasks').update({ is_blocked: false, block_reason: null }).eq('id', risk.task_id);
      }
      showNotification('success', 'Riesgo solventado y tarea desbloqueada.');
      onRisksUpdated();
    } catch (err: any) {
      showNotification('error', 'Error: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
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
          <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '10px', color: '#ef4444' }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Matriz de Riesgos & Mitigación ({risks.length})
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Los riesgos de severidad Alta/Crítica marcan alertas visuales en las tareas y pueden bloquearlas al materializarse
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            onClick={handleOpenAdd}
            className="btn btn-primary"
            style={{ background: '#ef4444', borderColor: '#dc2626', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} /> Identificar Riesgo
          </button>
        )}
      </div>

      {/* Lista de Riesgos */}
      {risks.length === 0 ? (
        <div style={{ background: 'white', padding: '40px 20px', borderRadius: '14px', border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
          <ShieldAlert size={32} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
          <h4 style={{ margin: '0 0 4px', fontWeight: 700, color: '#1e293b' }}>Sin riesgos activos</h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>No se han identificado riesgos que comprometan la fecha fin o el alcance del proyecto.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {risks.map(risk => {
            const isCritical = risk.severity === 'critical';
            const isHigh = risk.severity === 'high';
            const isMaterialized = risk.status === 'materialized';
            const isResolved = risk.status === 'resolved';

            return (
              <div
                key={risk.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  borderLeft: `5px solid ${isMaterialized ? '#7f1d1d' : isCritical ? '#dc2626' : isHigh ? '#f59e0b' : '#3b82f6'}`,
                  borderTop: '1px solid #e2e8f0',
                  borderRight: '1px solid #e2e8f0',
                  borderBottom: '1px solid #e2e8f0',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: isMaterialized ? '#7f1d1d' : isCritical ? '#fee2e2' : isHigh ? '#fef3c7' : '#eff6ff',
                      color: isMaterialized ? '#ffffff' : isCritical ? '#b91c1c' : isHigh ? '#b45309' : '#1d4ed8'
                    }}>
                      {isMaterialized ? '🚨 MATERIALIZADO' : `Severidad: ${risk.severity}`}
                    </span>

                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      {risk.title}
                    </h4>

                    {risk.status === 'resolved' && (
                      <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                        ✓ Solventado
                      </span>
                    )}
                  </div>

                  {risk.description && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                      {risk.description}
                    </p>
                  )}

                  {/* Impacto / Plan de Mitigación */}
                  <div style={{ marginTop: '8px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.75rem', color: '#475569' }}>
                    {risk.mitigation_plan && (
                      <div><strong>Mitigación:</strong> {risk.mitigation_plan}</div>
                    )}
                    {risk.materialized_impact_summary && (
                      <div style={{ color: '#b91c1c' }}><strong>Impacto Documentado:</strong> {risk.materialized_impact_summary}</div>
                    )}
                  </div>
                </div>

                {/* Acciones de Riesgo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!isMaterialized && !isResolved && (
                    <button
                      onClick={() => {
                        setMaterializingRisk(risk);
                        setMaterializedImpact('');
                      }}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
                    >
                      <Lock size={12} /> Marcar Materializado
                    </button>
                  )}

                  {isMaterialized && (
                    <button
                      onClick={() => handleResolveRisk(risk)}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', color: '#16a34a', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                    >
                      <CheckCircle size={12} /> Solventar Riesgo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Registrar Riesgo */}
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
            width: '560px',
            maxWidth: '94%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
              Identificar Riesgo de Proyecto
            </h3>

            <form onSubmit={handleSaveRisk} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  TÍTULO DEL RIESGO *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej. Retraso en entrega de credenciales API..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    SEVERIDAD
                  </label>
                  <select
                    value={severity}
                    onChange={e => setSeverity(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta (Alerta Preventiva)</option>
                    <option value="critical">Crítica (Alerta Roja)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                    ENTREGABLE AFECTADO
                  </label>
                  <select
                    value={deliverableId}
                    onChange={e => setDeliverableId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Sin entregable específico --</option>
                    {deliverables.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.weight_pct}%)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  PLAN DE MITIGACIÓN PREVENTIVA
                </label>
                <textarea
                  rows={2}
                  value={mitigationPlan}
                  onChange={e => setMitigationPlan(e.target.value)}
                  placeholder="¿Qué acciones se tomarán para evitar que este riesgo ocurra?"
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
                  style={{ background: '#ef4444', borderColor: '#dc2626', fontSize: '0.85rem' }}
                >
                  {saving ? 'Guardando...' : 'Registrar Riesgo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Materializar Riesgo */}
      {materializingRisk && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '520px',
            maxWidth: '94%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b91c1c', marginBottom: '12px' }}>
              <ShieldAlert size={22} />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>
                Materializar Riesgo: {materializingRisk.title}
              </h3>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
              Al materializar este riesgo, el PM debe documentar de quién es la responsabilidad y el impacto general generado en el cronograma o alcance del proyecto.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  RESPONSABLE E IMPACTO GENERAL DEL PROYECTO *
                </label>
                <textarea
                  rows={3}
                  required
                  value={materializedImpact}
                  onChange={e => setMaterializedImpact(e.target.value)}
                  placeholder="Ej. El cliente demoró 5 días en dar acceso a la BD. Responsable: Cliente (Ing. Pedro). Impacto: Se recorre la fecha fin 5 días hábiles..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              {materializingRisk.task_id && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: '#1e293b' }}>
                  <input
                    type="checkbox"
                    checked={blockLinkedTask}
                    onChange={e => setBlockLinkedTask(e.target.checked)}
                  />
                  <strong>Pausar y bloquear la tarea vinculada hasta que sea solventado</strong>
                </label>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setMaterializingRisk(null)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMaterializeRisk}
                  className="btn btn-primary"
                  style={{ background: '#7f1d1d', borderColor: '#7f1d1d', fontSize: '0.85rem' }}
                >
                  Confirmar Materialización
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
