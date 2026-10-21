import { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Receipt, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Search, 
  X, 
  BellRing, 
  Link as LinkIcon, 
  Trash2, 
  Check
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { PaymentMilestone, FacturaItem, Deliverable, ProjectPO } from '../../types/projectControl';

interface MilestonesInvoicingManagerProps {
  projectId: string;
  project: any;
  deliverables: Deliverable[];
  pos: ProjectPO[];
  onDataUpdated?: () => void;
}

export default function MilestonesInvoicingManager({
  projectId,
  project,
  deliverables,
  pos,
  onDataUpdated
}: MilestonesInvoicingManagerProps) {
  const { showNotification } = useNotification();
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Modal para crear/editar Hito
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingMilestone, setEditingMilestone] = useState<PaymentMilestone | null>(null);
  const [name, setName] = useState<string>('');
  const [percentage, setPercentage] = useState<string>('30');
  const [amount, setAmount] = useState<string>('');
  const [triggerCondition, setTriggerCondition] = useState<'contra_entrega' | 'anticipo' | 'fecha_fija'>('contra_entrega');
  const [deliverableId, setDeliverableId] = useState<string>('');
  const [poId, setPoId] = useState<string>('');
  const [estimatedInvoiceDate, setEstimatedInvoiceDate] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // Modal para asociar Factura existente
  const [showInvoiceModal, setShowInvoiceModal] = useState<boolean>(false);
  const [selectedMilestoneForInvoice, setSelectedMilestoneForInvoice] = useState<PaymentMilestone | null>(null);
  const [invoices, setInvoices] = useState<FacturaItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  const [invoiceQuery, setInvoiceQuery] = useState<string>('');
  const [savingInvoiceLink, setSavingInvoiceLink] = useState<boolean>(false);

  useEffect(() => {
    fetchMilestones();
  }, [projectId]);

  const fetchMilestones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_payment_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMilestones(data || []);
    } catch (err: any) {
      console.error('Error fetching milestones:', err);
      showNotification('error', 'Error al cargar hitos de cobranza');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingMilestone(null);
    setName('');
    setPercentage('30');
    const quoted = Number(project?.quoted_budget || 0);
    setAmount((quoted * 0.3).toFixed(2));
    setTriggerCondition('contra_entrega');
    setDeliverableId(deliverables[0]?.id || '');
    setPoId(pos[0]?.id || '');
    setEstimatedInvoiceDate(new Date().toISOString().split('T')[0]);
    setShowModal(true);
  };

  const handlePercentageChange = (pct: string) => {
    setPercentage(pct);
    const p = parseFloat(pct) || 0;
    const quoted = Number(project?.quoted_budget || 0);
    if (quoted > 0) {
      setAmount(((quoted * p) / 100).toFixed(2));
    }
  };

  const handleSaveMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseFloat(percentage);
    const amt = parseFloat(amount);

    if (!name.trim()) {
      showNotification('error', 'Ingresa un nombre para el hito.');
      return;
    }
    if (!amt || amt <= 0) {
      showNotification('error', 'Ingresa un monto válido.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<PaymentMilestone> = {
        project_id: projectId,
        name,
        percentage: p || 0,
        amount: amt,
        trigger_condition: triggerCondition,
        deliverable_id: deliverableId || undefined,
        po_id: poId || undefined,
        estimated_invoice_date: estimatedInvoiceDate || undefined,
        status: editingMilestone ? editingMilestone.status : 'pending'
      };

      if (editingMilestone?.id) {
        const { error } = await supabase
          .from('project_payment_milestones')
          .update(payload)
          .eq('id', editingMilestone.id);
        if (error) throw error;
        showNotification('success', 'Hito de cobro actualizado.');
      } else {
        const { error } = await supabase
          .from('project_payment_milestones')
          .insert([payload]);
        if (error) throw error;
        showNotification('success', 'Hito de cobro creado.');
      }

      setShowModal(false);
      fetchMilestones();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al guardar hito');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este hito de facturación?')) return;
    try {
      const { error } = await supabase.from('project_payment_milestones').delete().eq('id', id);
      if (error) throw error;
      showNotification('success', 'Hito eliminado.');
      fetchMilestones();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Cargar facturas de tipo EMITIDA para vincular
  const handleOpenInvoiceModal = async (m: PaymentMilestone) => {
    setSelectedMilestoneForInvoice(m);
    setShowInvoiceModal(true);
    setLoadingInvoices(true);
    setInvoiceQuery('');
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('id, cfdi_uuid, serie, folio, receptor, rfc_receptor, fecha, total, moneda, tipo_factura')
        .eq('tipo_factura', 'EMITIDA')
        .order('fecha', { ascending: false })
        .limit(30);

      if (error) throw error;
      setInvoices(data || []);
    } catch (err: any) {
      console.error('Error fetching invoices:', err);
      showNotification('error', 'No se pudieron consultar las facturas');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleLinkInvoice = async (invoice: FacturaItem) => {
    if (!selectedMilestoneForInvoice?.id) return;
    setSavingInvoiceLink(true);
    try {
      const { error } = await supabase
        .from('project_payment_milestones')
        .update({
          factura_id: invoice.id,
          sat_uuid: invoice.cfdi_uuid ? String(invoice.cfdi_uuid) : undefined,
          status: 'invoiced'
        })
        .eq('id', selectedMilestoneForInvoice.id);

      if (error) throw error;

      showNotification('success', `Factura ${invoice.serie || ''}${invoice.folio || invoice.id} vinculada con éxito.`);
      setShowInvoiceModal(false);
      fetchMilestones();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al vincular factura');
    } finally {
      setSavingInvoiceLink(false);
    }
  };

  const handleUnlinkInvoice = async (milestoneId: string) => {
    if (!window.confirm('¿Desvincular factura de este hito?')) return;
    try {
      const { error } = await supabase
        .from('project_payment_milestones')
        .update({
          factura_id: null,
          sat_uuid: null,
          status: 'pending'
        })
        .eq('id', milestoneId);

      if (error) throw error;
      showNotification('success', 'Factura desvinculada.');
      fetchMilestones();
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    }
  };

  // Cuadre Financiero
  const quotedBudget = Number(project?.quoted_budget || 0);
  const totalInvoiced = milestones
    .filter((m) => m.status === 'invoiced' || m.status === 'paid' || m.factura_id)
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);
  const pendingToInvoice = Math.max(0, quotedBudget - totalInvoiced);
  const isBudgetBalanced = quotedBudget > 0 && Math.abs(quotedBudget - totalInvoiced) < 1;

  // Detección de Hitos con Alertas de Facturación (Nota del usuario: cuando se cumpla un hito, alerta para solicitar facturación)
  const billingAlerts = milestones.filter((m) => {
    if (m.factura_id || m.status === 'invoiced' || m.status === 'paid') return false;
    if (m.trigger_condition === 'contra_entrega' && m.deliverable_id) {
      const deliv = deliverables.find((d) => d.id === m.deliverable_id);
      return deliv?.status === 'accepted';
    }
    if (m.estimated_invoice_date) {
      const due = new Date(m.estimated_invoice_date + 'T23:59:59');
      return new Date() >= due;
    }
    return false;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Cards: Cuadre Financiero de Facturas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Presupuesto Cotizado</span>
            <DollarSign size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            ${quotedBudget.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            {pos.length} Órdenes de Compra registradas
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Facturado</span>
            <Receipt size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669' }}>
            ${totalInvoiced.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            {milestones.filter((m) => m.factura_id).length} de {milestones.length} hitos facturados
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: isBudgetBalanced ? '#f0fdf4' : '#fffbeb', border: isBudgetBalanced ? '1px solid #bbf7d0' : '1px solid #fef3c7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isBudgetBalanced ? '#15803d' : '#b45309', textTransform: 'uppercase' }}>Cuadre al Cierre</span>
            {isBudgetBalanced ? <CheckCircle2 size={18} color="#16a34a" /> : <AlertTriangle size={18} color="#d97706" />}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: isBudgetBalanced ? '#15803d' : '#b45309' }}>
            {isBudgetBalanced ? '100% Cuadrado' : `$${pendingToInvoice.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
          </div>
          <div style={{ fontSize: '0.75rem', color: isBudgetBalanced ? '#16a34a' : '#b45309', marginTop: '2px' }}>
            {isBudgetBalanced ? 'Facturas = Presupuesto aprobado' : 'Pendiente de emisión por Finanzas'}
          </div>
        </div>
      </div>

      {/* Alertas Automáticas de Solicitud de Facturación */}
      {billingAlerts.length > 0 && (
        <div style={{ background: '#eff6ff', border: '2px solid #bfdbfe', borderRadius: '16px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1d4ed8' }}>
            <BellRing size={20} color="#2563eb" className="animate-bounce" />
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
              ¡Atención! {billingAlerts.length} {billingAlerts.length === 1 ? 'hito cumplido requiere' : 'hitos cumplidos requieren'} solicitar facturación a Finanzas
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {billingAlerts.map((alert) => (
              <div 
                key={alert.id}
                style={{ 
                  background: 'white', 
                  padding: '10px 14px', 
                  borderRadius: '10px', 
                  border: '1px solid #dbeafe', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between' 
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                    {alert.name} ({alert.percentage}%)
                  </span>
                  <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px' }}>
                    ${Number(alert.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Condición: {alert.trigger_condition === 'contra_entrega' ? 'Entregable completado' : 'Fecha programada'}
                  </span>
                </div>
                <button
                  onClick={() => handleOpenInvoiceModal(alert)}
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Receipt size={14} /> Asociar Factura Emitida
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
            Esquema de Pagos e Hitos de Cobro
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
            Programa las fechas de facturación y asocia los folios fiscales del SAT.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="btn btn-primary"
          style={{ padding: '10px 18px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> Nuevo Hito de Cobro
        </button>
      </div>

      {/* Milestones List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            Cargando hitos de facturación...
          </div>
        ) : milestones.length === 0 ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            No se han configurado hitos de cobro para este proyecto. Haz clic en "Nuevo Hito de Cobro".
          </div>
        ) : (
          milestones.map((m) => {
            const linkedDeliv = deliverables.find((d) => d.id === m.deliverable_id);
            const linkedPO = pos.find((p) => p.id === m.po_id);
            const isInvoiced = !!m.factura_id || m.status === 'invoiced' || m.status === 'paid';

            return (
              <div
                key={m.id}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  border: isInvoiced ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
              >
                {/* Info */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      background: isInvoiced ? '#dcfce7' : '#eff6ff',
                      color: isInvoiced ? '#15803d' : '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Receipt size={22} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                        {m.name}
                      </span>
                      <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                        {m.percentage}%
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#15803d' }}>
                        ${Number(m.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                      {linkedPO && (
                        <span>
                          PO: <strong>{linkedPO.po_number}</strong>
                        </span>
                      )}
                      {linkedDeliv && (
                        <span>
                          Entregable: <strong>{linkedDeliv.name}</strong> ({linkedDeliv.status})
                        </span>
                      )}
                      {m.estimated_invoice_date && (
                        <span>
                          Fecha est.: <strong>{m.estimated_invoice_date}</strong>
                        </span>
                      )}
                      <span>
                        Condición: <strong>{m.trigger_condition}</strong>
                      </span>
                    </div>

                    {/* Status Badge & SAT Info */}
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isInvoiced ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={14} /> FACTURADO (ID #{m.factura_id})
                          </span>
                          {m.sat_uuid && (
                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                              UUID SAT: {m.sat_uuid.substring(0, 18)}...
                            </span>
                          )}
                          <button
                            onClick={() => handleUnlinkInvoice(m.id!)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            Desvincular
                          </button>
                        </div>
                      ) : (
                        <span style={{ background: '#fffbeb', color: '#b45309', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: '6px' }}>
                          ⏳ Pendiente de emisión
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {!isInvoiced && (
                    <button
                      onClick={() => handleOpenInvoiceModal(m)}
                      className="btn btn-secondary"
                      style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <LinkIcon size={14} /> Asociar Factura
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteMilestone(m.id!)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                    title="Eliminar hito"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Crear / Editar Hito */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '92%', borderRadius: '20px', background: 'white', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                {editingMilestone ? 'Editar Hito de Cobro' : 'Nuevo Hito de Cobro'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveMilestone} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  NOMBRE DEL HITO
                </label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                  placeholder="Ej. Anticipo 30% o Contra-entrega Fase 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    PORCENTAJE (%)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="100"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 700 }}
                    value={percentage}
                    onChange={(e) => handlePercentageChange(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    MONTO (MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px', fontWeight: 800, color: '#0f172a' }}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    CONDICIÓN DE DISPARO
                  </label>
                  <select
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                    value={triggerCondition}
                    onChange={(e) => setTriggerCondition(e.target.value as any)}
                  >
                    <option value="contra_entrega">Contra Entrega de Entregable</option>
                    <option value="anticipo">Anticipo Comercial</option>
                    <option value="fecha_fija">Fecha Calendario Fija</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    FECHA ESTIMADA DE FACTURACIÓN
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                    value={estimatedInvoiceDate}
                    onChange={(e) => setEstimatedInvoiceDate(e.target.value)}
                  />
                </div>
              </div>

              {triggerCondition === 'contra_entrega' && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    ENTREGABLE CONDICIONANTE
                  </label>
                  <select
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                    value={deliverableId}
                    onChange={(e) => setDeliverableId(e.target.value)}
                  >
                    <option value="">Seleccionar entregable...</option>
                    {deliverables.map((d) => (
                      <option key={d.id} value={d.id}>
                        📦 {d.name} ({d.weight_pct}% - {d.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {pos.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    ORDEN DE COMPRA (PO) ASOCIADA
                  </label>
                  <select
                    className="form-input"
                    style={{ width: '100%', height: '40px', borderRadius: '10px' }}
                    value={poId}
                    onChange={(e) => setPoId(e.target.value)}
                  >
                    <option value="">Sin PO específica</option>
                    {pos.map((p) => (
                      <option key={p.id} value={p.id}>
                        PO #{p.po_number} (${Number(p.po_amount).toLocaleString('es-MX')} {p.currency})
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
                  {saving ? 'Guardando...' : 'Guardar Hito'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Vincular Factura Existente de Finanzas */}
      {showInvoiceModal && (
        <div className="modal-overlay" style={{ zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '92%', borderRadius: '20px', background: 'white', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                  Vincular Factura de Finanzas
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Asocia una factura emitida para el hito: <strong>{selectedMilestoneForInvoice?.name}</strong> (${Number(selectedMilestoneForInvoice?.amount).toLocaleString('es-MX')} MXN)
                </p>
              </div>
              <button onClick={() => setShowInvoiceModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', paddingLeft: '36px', height: '40px', borderRadius: '10px' }}
                placeholder="Buscar por cliente, folio o RFC..."
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
              />
            </div>

            {/* Invoices List */}
            <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {loadingInvoices ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Consultando facturas emitidas...</p>
              ) : invoices.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>No hay facturas emitidas disponibles.</p>
              ) : (
                invoices
                  .filter((inv) => {
                    const q = invoiceQuery.toLowerCase();
                    return (
                      (inv.receptor || '').toLowerCase().includes(q) ||
                      (inv.folio || '').toLowerCase().includes(q) ||
                      (inv.rfc_receptor || '').toLowerCase().includes(q)
                    );
                  })
                  .map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                            Folio: {inv.serie || ''}{inv.folio || `ID-${inv.id}`}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>• {inv.fecha}</span>
                          <span style={{ background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px' }}>
                            ${Number(inv.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {inv.moneda || 'MXN'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                          Receptor: <strong>{inv.receptor || 'Cliente general'}</strong> ({inv.rfc_receptor || 'Sin RFC'})
                        </div>
                      </div>

                      <button
                        onClick={() => handleLinkInvoice(inv)}
                        disabled={savingInvoiceLink}
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}
                      >
                        Vincular
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
