import { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Plus, 
  DollarSign, 
  ArrowRightLeft, 
  Calendar,
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { calculateWorkingEndDate } from '../../utils/workdayCalculator';
import type { ProjectChangeRequest, Deliverable } from '../../types/projectControl';

interface ChangeRequestsManagerProps {
  projectId: string;
  project: any;
  deliverables: Deliverable[];
  onDataUpdated?: () => void;
}

export default function ChangeRequestsManager({
  projectId,
  project,
  deliverables,
  onDataUpdated
}: ChangeRequestsManagerProps) {
  const { profile } = useAuth();
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<ProjectChangeRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Form State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [requestedBy, setRequestedBy] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [scopeSummary, setScopeSummary] = useState<string>('');
  const [budgetImpact, setBudgetImpact] = useState<string>('0');
  const [timeImpactDays, setTimeImpactDays] = useState<string>('0');
  const [exchangedDeliverableId, setExchangedDeliverableId] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    fetchChangeRequests();
  }, [projectId]);

  const fetchChangeRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_change_requests')
        .select('*, approved_by_profile:profiles(id, full_name, email), exchanged_deliverable:project_deliverables(id, name)')
        .eq('project_id', projectId)
        .order('change_number', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err: any) {
      console.error('Error fetching change requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestedBy.trim() || !reason.trim()) {
      showNotification('error', 'Ingresa el solicitante y motivo del cambio.');
      return;
    }

    setSaving(true);
    try {
      const nextNumber = requests.length + 1;
      const budget = parseFloat(budgetImpact) || 0;
      const days = parseInt(timeImpactDays) || 0;

      const payload = {
        project_id: projectId,
        change_number: nextNumber,
        requested_by: requestedBy,
        reason,
        scope_change_summary: scopeSummary,
        budget_impact: budget,
        time_impact_days: days,
        exchanged_deliverable_id: exchangedDeliverableId || null,
        status: 'pending'
      };

      const { error } = await supabase.from('project_change_requests').insert([payload]);
      if (error) throw error;

      showNotification('success', `Adenda #${nextNumber} registrada en estado pendiente.`);
      setShowModal(false);
      resetForm();
      fetchChangeRequests();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al registrar cambio');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setRequestedBy('');
    setReason('');
    setScopeSummary('');
    setBudgetImpact('0');
    setTimeImpactDays('0');
    setExchangedDeliverableId('');
  };

  const handleApprove = async (req: ProjectChangeRequest) => {
    if (!window.confirm(`¿Aprobar Control de Cambios #${req.change_number}? Esto generará una nueva Línea Base y ajustará el presupuesto y cronograma.`)) {
      return;
    }

    try {
      const currentVersion = Number(project?.current_baseline_version || 1);
      const nextBaselineVersion = currentVersion + 1;

      // 1. Marcar request como aprobada
      const { error: reqErr } = await supabase
        .from('project_change_requests')
        .update({
          status: 'approved',
          approved_by: profile?.id,
          approved_at: new Date().toISOString(),
          new_baseline_version: nextBaselineVersion
        })
        .eq('id', req.id);

      if (reqErr) throw reqErr;

      // 2. Ajustar presupuesto del proyecto
      const currentBudget = Number(project?.quoted_budget || 0);
      const newBudget = currentBudget + Number(req.budget_impact || 0);

      // 3. Ajustar fecha de entrega proyectada si hay impacto en días
      let newProjectedEnd = project?.current_projected_end_date || project?.end_date;
      if (req.time_impact_days > 0 && newProjectedEnd) {
        // Cargar festivos del cliente si existen
        const { data: holidays } = await supabase
          .from('location_holidays')
          .select('holiday_date')
          .eq('client_id', project.client_id || '');

        const holidayDates = (holidays || []).map(h => h.holiday_date);
        newProjectedEnd = calculateWorkingEndDate(newProjectedEnd, req.time_impact_days, holidayDates);
      }

      await supabase
        .from('projects')
        .update({
          quoted_budget: newBudget,
          current_projected_end_date: newProjectedEnd,
          current_baseline_version: nextBaselineVersion
        })
        .eq('id', projectId);

      showNotification('success', `🎉 ¡Control de Cambios #${req.change_number} aprobado! Se generó la Línea Base ${nextBaselineVersion}.`);
      fetchChangeRequests();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al aprobar cambio');
    }
  };

  const handleReject = async (req: ProjectChangeRequest) => {
    if (!window.confirm(`¿Rechazar solicitud de cambio #${req.change_number}?`)) return;
    try {
      const { error } = await supabase
        .from('project_change_requests')
        .update({ status: 'rejected' })
        .eq('id', req.id);

      if (error) throw error;
      showNotification('info', `Solicitud #${req.change_number} rechazada.`);
      fetchChangeRequests();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  const totalBudgetImpact = requests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.budget_impact || 0), 0);

  const totalDaysImpact = requests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.time_impact_days || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Cards: Estado de Línea Base */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Versión de Plan</span>
            <GitBranch size={18} color="#7c3aed" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            Línea Base {project?.current_baseline_version || 1}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            Línea Base 1 original protegida e inmutable
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Impacto en Presupuesto</span>
            <DollarSign size={18} color={totalBudgetImpact >= 0 ? '#059669' : '#dc2626'} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalBudgetImpact >= 0 ? '#059669' : '#dc2626' }}>
            {totalBudgetImpact >= 0 ? '+' : ''}${totalBudgetImpact.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            Adicional aprobado por adendas
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Impacto en Plazo</span>
            <Calendar size={18} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            +{totalDaysImpact} días hábiles
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            Extensión de cronograma acordada
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
            Matriz de Control de Cambios (Adendas)
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
            Registro formal de variaciones de alcance, presupuesto, tiempo o intercambio de entregables.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
          style={{ padding: '10px 18px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> Registrar Solicitud de Cambio
        </button>
      </div>

      {/* Requests List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            Cargando solicitudes de cambio...
          </div>
        ) : requests.length === 0 ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            No hay solicitudes de cambio registradas. El proyecto se rige actualmente por la Línea Base 1 original.
          </div>
        ) : (
          requests.map((r) => {
            const isApproved = r.status === 'approved';
            const isRejected = r.status === 'rejected';

            return (
              <div
                key={r.id}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  border: isApproved ? '1px solid #bbf7d0' : isRejected ? '1px solid #fecaca' : '1px solid #e2e8f0',
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                      Adenda #{r.change_number}
                    </span>
                    {isApproved ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                        ✓ APROBADA (Línea Base {r.new_baseline_version})
                      </span>
                    ) : isRejected ? (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                        ✕ RECHAZADA
                      </span>
                    ) : (
                      <span style={{ background: '#fef3c7', color: '#b45309', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                        ⏳ PENDIENTE DE APROBACIÓN
                      </span>
                    )}

                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: Number(r.budget_impact) >= 0 ? '#15803d' : '#b91c1c' }}>
                      {Number(r.budget_impact) >= 0 ? '+' : ''}${Number(r.budget_impact).toLocaleString('es-MX')} MXN
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#2563eb' }}>
                      +{r.time_impact_days} días hábiles
                    </span>
                  </div>

                  <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>
                    {r.reason}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>
                      Solicitante: <strong>{r.requested_by}</strong>
                    </span>
                    {r.approved_by_profile && (
                      <span>
                        Aprobado por: <strong>{r.approved_by_profile.full_name}</strong>
                      </span>
                    )}
                    {r.exchanged_deliverable && (
                      <span style={{ color: '#7c3aed', fontWeight: 700 }}>
                        <ArrowRightLeft size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
                        Intercambiado por: {r.exchanged_deliverable.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Approval buttons */}
                {!isApproved && !isRejected && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleApprove(r)}
                      className="btn btn-primary"
                      style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, background: '#10b981' }}
                    >
                      Aprobar
                    </button>
                    <button
                      onClick={() => handleReject(r)}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal Registrar Solicitud */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '540px', width: '92%', borderRadius: '20px', background: 'white', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                Registrar Control de Cambios (Adenda)
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  SOLICITADO POR (CONTACTO DEL CLIENTE)
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                  placeholder="Ej. Juan Pérez (Director de TI)"
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  MOTIVO DEL CAMBIO / ALCANCE SOLICITADO
                </label>
                <textarea
                  className="form-input"
                  style={{ width: '100%', minHeight: '75px', borderRadius: '10px', fontSize: '0.85rem' }}
                  placeholder="Descripción detallada de la nueva solicitud o modificación acordada..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    IMPACTO EN PRESUPUESTO (MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 800 }}
                    placeholder="0.00"
                    value={budgetImpact}
                    onChange={(e) => setBudgetImpact(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    IMPACTO EN TIEMPO (DÍAS HÁBILES)
                  </label>
                  <input
                    type="number"
                    step="1"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 800 }}
                    placeholder="0"
                    value={timeImpactDays}
                    onChange={(e) => setTimeImpactDays(e.target.value)}
                  />
                </div>
              </div>

              {deliverables.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    ¿SE INTERCAMBIA POR ALGÚN ENTREGABLE EXISTENTE? (OPCIONAL)
                  </label>
                  <select
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                    value={exchangedDeliverableId}
                    onChange={(e) => setExchangedDeliverableId(e.target.value)}
                  >
                    <option value="">No hay intercambio (Alcance complementario)</option>
                    {deliverables.map((d) => (
                      <option key={d.id} value={d.id}>
                        Intercambiar por: {d.name} ({d.weight_pct}%)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '8px 20px', fontWeight: 700 }}>
                  {saving ? 'Guardando...' : 'Registrar Adenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
