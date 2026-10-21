import { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  Calendar, 
  DollarSign, 
  Percent, 
  FileCheck, 
  Plus, 
  Trash2, 
  Mail, 
  Calculator,
  ShieldAlert,
  Loader2,
  Briefcase,
  Info,
  FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { calculateWorkingEndDate, weeksToWorkingDays } from '../../utils/workdayCalculator';
import type { ProjectPO, CostRateItem, CommittedResource } from '../../types/projectControl';

interface CreateProjectCommercialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (newProject: any) => void;
}

export default function CreateProjectCommercialModal({
  isOpen,
  onClose,
  onProjectCreated
}: CreateProjectCommercialModalProps) {
  const { showNotification } = useNotification();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  // Catálogos cargados
  const [clients, setClients] = useState<any[]>([]);
  const [costRates, setCostRates] = useState<CostRateItem[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [pms, setPms] = useState<any[]>([]);

  // Campos Básicos / Comerciales
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientContactName, setClientContactName] = useState('');
  const [stakeholderEmail, setStakeholderEmail] = useState('');
  const [pmId, setPmId] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState('');

  // Cronograma y Días Hábiles
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [durationWeeks, setDurationWeeks] = useState<number>(4);
  const [calculatedEndDate, setCalculatedEndDate] = useState<string>('');

  // Presupuesto, Costos y Margen
  const [quotedBudget, setQuotedBudget] = useState<number>(0);
  const [targetMarginPct, setTargetMarginPct] = useState<number>(35);
  const [committedResources, setCommittedResources] = useState<CommittedResource[]>([]);
  
  // Esquema de Pagos
  const [paymentScheme, setPaymentScheme] = useState<'exhibicion_unica' | 'por_entregables'>('por_entregables');

  // Órdenes de Compra (POs)
  const [pos, setPos] = useState<ProjectPO[]>([]);
  const [newPoNumber, setNewPoNumber] = useState('');
  const [newPoAmount, setNewPoAmount] = useState<number>(0);
  const [newPoDocUrl, setNewPoDocUrl] = useState('');
  const [newPoJustification, setNewPoJustification] = useState('');

  // Cargar catálogos
  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
    }
  }, [isOpen]);

  const fetchInitialData = async () => {
    try {
      const [clientsRes, ratesRes, profilesRes] = await Promise.all([
        supabase.from('clients').select('id, name, reference_name, email, contacts').order('reference_name'),
        supabase.from('cost_rates_catalog').select('*').order('role_name'),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'admin').order('full_name')
      ]);

      if (clientsRes.data) setClients(clientsRes.data);
      if (ratesRes.data) setCostRates(ratesRes.data);
      if (profilesRes.data) setPms(profilesRes.data);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al cargar catálogos comerciales');
    }
  };

  // Cargar festivos del cliente
  useEffect(() => {
    if (!clientId) {
      setHolidays([]);
      return;
    }
    const fetchClientHolidays = async () => {
      const { data } = await supabase
        .from('location_holidays')
        .select('holiday_date')
        .eq('client_id', clientId);
      if (data) {
        setHolidays(data.map(h => h.holiday_date));
      }
    };
    fetchClientHolidays();
  }, [clientId]);

  // Recalcular fecha fin automáticamente
  useEffect(() => {
    if (startDate && durationWeeks > 0) {
      const workingDays = weeksToWorkingDays(durationWeeks);
      const computedEnd = calculateWorkingEndDate(startDate, workingDays, holidays);
      setCalculatedEndDate(computedEnd);
    }
  }, [startDate, durationWeeks, holidays]);

  // Cálculos de Margen y Costos
  const totalCommittedHours = committedResources.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
  const totalEstimatedCost = committedResources.reduce((acc, curr) => acc + ((Number(curr.hours) || 0) * (Number(curr.rate) || 0)), 0);
  const calculatedMarginMoney = quotedBudget > 0 ? (quotedBudget - totalEstimatedCost) : 0;
  const calculatedMarginPct = quotedBudget > 0 ? ((calculatedMarginMoney / quotedBudget) * 100) : 0;
  const totalPosAmount = pos.reduce((acc, curr) => acc + (Number(curr.po_amount) || 0), 0);
  const poMismatch = quotedBudget > 0 && totalPosAmount > 0 && Math.abs(totalPosAmount - quotedBudget) > 1.0;

  const handleAddResource = (rateItem: CostRateItem) => {
    setCommittedResources(prev => [
      ...prev,
      {
        role_id: rateItem.id,
        role_name: `${rateItem.role_name} (${rateItem.seniority})`,
        hours: 40,
        rate: rateItem.hourly_rate_estimated
      }
    ]);
  };

  const handleUpdateResourceHours = (index: number, hours: number) => {
    setCommittedResources(prev => {
      const copy = [...prev];
      copy[index].hours = hours;
      return copy;
    });
  };

  const handleRemoveResource = (index: number) => {
    setCommittedResources(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddPo = () => {
    if (!newPoNumber.trim() || newPoAmount <= 0) {
      showNotification('error', 'Ingresa un número de PO y un monto válido.');
      return;
    }
    const isMismatch = quotedBudget > 0 && (newPoAmount !== quotedBudget);
    if (isMismatch && !newPoJustification.trim()) {
      showNotification('error', 'El monto de la PO no coincide con la cotización. Debes justificar la razón.');
      return;
    }

    setPos(prev => [
      ...prev,
      {
        po_number: newPoNumber.trim(),
        po_amount: newPoAmount,
        currency: 'MXN',
        document_url: newPoDocUrl.trim() || undefined,
        is_mismatch_with_quote: isMismatch,
        mismatch_justification: isMismatch ? newPoJustification.trim() : undefined
      }
    ]);

    setNewPoNumber('');
    setNewPoAmount(0);
    setNewPoDocUrl('');
    setNewPoJustification('');
  };

  const handleSubmitProject = async () => {
    if (!name.trim()) return showNotification('error', 'El nombre del proyecto es obligatorio');
    if (!clientId) return showNotification('error', 'Selecciona un cliente');
    if (!stakeholderEmail.trim()) return showNotification('error', 'El correo del stakeholder es obligatorio');
    if (quotedBudget <= 0) return showNotification('error', 'Ingresa el monto del presupuesto cotizado');

    setLoading(true);
    try {
      const { data: projectData, error: projErr } = await supabase
        .from('projects')
        .insert([{
          name: name.trim(),
          client_id: clientId,
          client_contact_name: clientContactName.trim() || null,
          stakeholder_email: stakeholderEmail.trim().toLowerCase(),
          pm_id: pmId || null,
          proposal_url: proposalUrl.trim() || null,
          google_drive_folder_url: googleDriveFolderUrl.trim() || null,
          delivery_date: startDate,
          duration_weeks: durationWeeks,
          end_date: calculatedEndDate,
          baseline_start_date: startDate,
          baseline_end_date: calculatedEndDate,
          current_projected_end_date: calculatedEndDate,
          quoted_budget: quotedBudget,
          quoted_hours: totalCommittedHours,
          estimated_cost: totalEstimatedCost,
          target_margin_pct: targetMarginPct,
          payment_scheme: paymentScheme,
          status: 'todo',
          stage: 'arranque',
          current_baseline_version: 1
        }])
        .select(`*, clients(name, reference_name)`)
        .single();

      if (projErr) throw projErr;

      if (pos.length > 0) {
        const posToInsert = pos.map(p => ({
          ...p,
          project_id: projectData.id
        }));
        await supabase.from('project_pos').insert(posToInsert);
      }

      showNotification('success', `Proyecto "${name}" dado de alta con margen proyectado del ${calculatedMarginPct.toFixed(1)}%`);
      onProjectCreated(projectData);
      onClose();
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al crear proyecto: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedClientObj = clients.find(c => c.id === clientId);

  return (
    <div className="modal-overlay">
      <div className="modal-content wide">
        
        {/* Header con el mismo Look and Feel de Alta Rápida */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: '#7c3aed', color: 'white', padding: '12px', borderRadius: '16px' }}>
              <Briefcase size={28} />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
                Alta Comercial & Control Interno
              </h2>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Configuración completa de cotización, margen proyectado, stakeholder y POs
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ padding: '12px 24px', borderRadius: '14px' }} 
              onClick={onClose}
            >
              Cancelar
            </button>
            <button 
              type="button" 
              disabled={loading}
              className="btn btn-primary" 
              style={{ 
                padding: '12px 32px', 
                borderRadius: '14px', 
                background: '#7c3aed',
                borderColor: '#6d28d9',
                boxShadow: '0 10px 15px -3px rgba(124, 58, 237, 0.3)' 
              }} 
              onClick={handleSubmitProject}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <FileCheck size={18} />}
              <span>Dar de Alta Proyecto</span>
            </button>
            <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', margin: '0 8px' }}></div>
            <button 
              type="button" 
              className="modal-close" 
              style={{ background: '#f1f5f9', padding: '8px', borderRadius: '12px', cursor: 'pointer' }} 
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Barra de Pasos / Secciones */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: '#f8fafc', padding: '0 32px' }}>
          <button
            onClick={() => setActiveStep(1)}
            style={{
              padding: '14px 24px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeStep === 1 ? '3px solid #7c3aed' : '3px solid transparent',
              color: activeStep === 1 ? '#7c3aed' : '#64748b',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Building2 size={18} /> 1. Cliente & Cronograma Hábil
          </button>
          <button
            onClick={() => setActiveStep(2)}
            style={{
              padding: '14px 24px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeStep === 2 ? '3px solid #7c3aed' : '3px solid transparent',
              color: activeStep === 2 ? '#7c3aed' : '#64748b',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Calculator size={18} /> 2. Cotización & Margen Real
          </button>
          <button
            onClick={() => setActiveStep(3)}
            style={{
              padding: '14px 24px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeStep === 3 ? '3px solid #7c3aed' : '3px solid transparent',
              color: activeStep === 3 ? '#7c3aed' : '#64748b',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FileCheck size={18} /> 3. Órdenes de Compra (POs) & Modalidad
          </button>
        </div>

        {/* Body con Grid Amplio (420px panel izquierdo + 1fr panel derecho) */}
        <div className="modal-body" style={{ background: '#fcfdfe' }}>
          
          {/* ── PASO 1: CLIENTE, STAKEHOLDER Y CRONOGRAMA ── */}
          {activeStep === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '32px' }}>
              
              {/* Columna Izquierda: Datos del Proyecto & Cliente */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '24px' }}>
                    <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                      <Info size={16} style={{ color: '#3b82f6' }} />
                    </div>
                    <span style={{ fontSize: '0.9rem' }}>Información Principal</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>NOMBRE DEL PROYECTO *</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      placeholder="Nombre comercial del proyecto..."
                      style={{ fontSize: '1.2rem', fontWeight: 700, padding: '14px 18px', borderRadius: '14px', border: '2px solid #f1f5f9', marginTop: '4px' }} 
                      required 
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>CLIENTE / RAZÓN SOCIAL *</label>
                    <select 
                      className="form-input" 
                      value={clientId} 
                      onChange={e => {
                        setClientId(e.target.value);
                        const sel = clients.find(c => c.id === e.target.value);
                        if (sel && sel.email) setStakeholderEmail(sel.email);
                        if (sel && sel.name) setClientContactName(sel.name);
                      }} 
                      style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                      required
                    >
                      <option value="">Seleccionar cliente...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.reference_name || c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>ENCARGADO / CONTACTO PRINCIPAL</label>
                    <select 
                      className="form-input" 
                      value={clientContactName} 
                      onChange={e => setClientContactName(e.target.value)} 
                      style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                    >
                      <option value="">Seleccionar encargado...</option>
                      {selectedClientObj?.name && (
                        <option value={selectedClientObj.name}>{selectedClientObj.name} (Principal)</option>
                      )}
                      {(selectedClientObj?.contacts || []).map((ct: any, i: number) => (
                        <option key={i} value={ct.name}>{ct.name} ({ct.email})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>STAKEHOLDER POR CORREO (CLIENTE) *</label>
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="email" 
                        required
                        className="form-input" 
                        value={stakeholderEmail} 
                        onChange={e => setStakeholderEmail(e.target.value)} 
                        placeholder="stakeholder@cliente.com"
                        style={{ paddingLeft: '40px', paddingRight: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>PROJECT MANAGER (PM) RESPONSABLE</label>
                    <select 
                      className="form-input" 
                      value={pmId} 
                      onChange={e => setPmId(e.target.value)} 
                      style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                    >
                      <option value="">Seleccionar PM asignado...</option>
                      {pms.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Cronograma Hábil Inteligente */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '24px' }}>
                    <div style={{ background: '#f5f3ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                      <Calendar size={16} style={{ color: '#7c3aed' }} />
                    </div>
                    <span style={{ fontSize: '0.9rem' }}>Cronograma de Ejecución (Días Hábiles & Festivos)</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>FECHA DE KICK OFF (INICIO)</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={startDate} 
                        onChange={e => setStartDate(e.target.value)} 
                        style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>TIEMPO COTIZADO (SEMANAS)</label>
                      <input 
                        type="number" 
                        min={1} 
                        className="form-input" 
                        value={durationWeeks} 
                        onChange={e => setDurationWeeks(Number(e.target.value))} 
                        style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  {/* Resumen Visual del Cálculo de Días */}
                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Fecha de Cierre Calculada (Línea Base 1):</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c3aed' }}>{calculatedEndDate || 'Calculando...'}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                      <div>⚡ <strong>{weeksToWorkingDays(durationWeeks)}</strong> días hábiles netos de trabajo.</div>
                      <div>🏖️ <strong>{holidays.length}</strong> festivos de sede cliente descontados.</div>
                    </div>
                  </div>

                  {/* Enlaces Google Drive */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>LINK DE PROPUESTA (GOOGLE DRIVE)</label>
                      <input 
                        type="url" 
                        className="form-input" 
                        value={proposalUrl} 
                        onChange={e => setProposalUrl(e.target.value)} 
                        placeholder="https://drive.google.com/..." 
                        style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9' }}
                      />
                    </div>

                    <div className="form-group">
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>CARPETA DEL PROYECTO (DRIVE)</label>
                      <input 
                        type="url" 
                        className="form-input" 
                        value={googleDriveFolderUrl} 
                        onChange={e => setGoogleDriveFolderUrl(e.target.value)} 
                        placeholder="https://drive.google.com/drive/folders/..." 
                        style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 2: COTIZACIÓN Y CÁLCULO DE MARGEN AUTOMÁTICO ── */}
          {activeStep === 2 && (
            <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '32px' }}>
              
              {/* Presupuesto y Margen Meta */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '24px' }}>
                    <div style={{ background: '#ecfdf5', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                      <DollarSign size={16} style={{ color: '#10b981' }} />
                    </div>
                    <span style={{ fontSize: '0.9rem' }}>Venta y Margen Objetivo</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>MONTO TOTAL VENDIDO (COTIZACIÓN MXN) *</label>
                    <div style={{ position: 'relative' }}>
                      <DollarSign size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="number" 
                        required
                        min={0}
                        step={500}
                        className="form-input" 
                        value={quotedBudget || ''} 
                        onChange={e => setQuotedBudget(Number(e.target.value))} 
                        placeholder="0.00"
                        style={{ fontSize: '1.25rem', fontWeight: 800, paddingLeft: '40px', borderRadius: '14px', border: '2px solid #f1f5f9' }} 
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>MARGEN META ESPERADO (%)</label>
                    <div style={{ position: 'relative' }}>
                      <Percent size={18} color="#94a3b8" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="number" 
                        min={0}
                        max={100}
                        className="form-input" 
                        value={targetMarginPct} 
                        onChange={e => setTargetMarginPct(Number(e.target.value))} 
                        style={{ fontSize: '1.25rem', fontWeight: 800, paddingLeft: '40px', borderRadius: '14px', border: '2px solid #f1f5f9' }} 
                      />
                    </div>
                  </div>

                  {/* Semáforo de Rentabilidad Proyectada */}
                  <div style={{
                    padding: '20px',
                    borderRadius: '16px',
                    background: calculatedMarginPct >= targetMarginPct ? '#f0fdf4' : '#fff7ed',
                    border: `2px solid ${calculatedMarginPct >= targetMarginPct ? '#bbf7d0' : '#fed7aa'}`
                  }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>PROYECCIÓN EN TIEMPO REAL</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700 }}>Margen Neto ($):</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: calculatedMarginMoney >= 0 ? '#15803d' : '#b91c1c' }}>
                        ${calculatedMarginMoney.toLocaleString('es-MX')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 700 }}>Margen Porcentual (%):</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: calculatedMarginPct >= targetMarginPct ? '#15803d' : '#c2410c' }}>
                        {calculatedMarginPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desglose de Horas y Roles Comprometidos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ background: '#f5f3ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                        <Calculator size={16} style={{ color: '#7c3aed' }} />
                      </div>
                      <span style={{ fontSize: '0.9rem' }}>Horas Comprometidas en la Propuesta por Rol</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700 }}>Total: {totalCommittedHours} hrs</span>
                  </div>

                  {/* Botones de roles para agregar con un clic */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {costRates.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleAddResource(item)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plus size={12} color="#7c3aed" /> {item.role_name} (${item.hourly_rate_estimated}/h)
                      </button>
                    ))}
                  </div>

                  {/* Tabla de Horas Cotizadas */}
                  {committedResources.length === 0 ? (
                    <div style={{ padding: '32px', background: '#f8fafc', borderRadius: '14px', border: '2px dashed #cbd5e1', textAlign: 'center', color: '#94a3b8' }}>
                      Agrega los roles comprometidos arriba para calcular el costo y margen automático.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {committedResources.map((res, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 1fr 40px', gap: '12px', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{res.role_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input 
                              type="number"
                              min={1}
                              value={res.hours}
                              onChange={e => handleUpdateResourceHours(idx, Number(e.target.value))}
                              style={{ width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 700 }}
                            />
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>hrs</span>
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#334155', textAlign: 'right' }}>
                            ${(res.hours * res.rate).toLocaleString('es-MX')}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveResource(idx)}
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── PASO 3: POs Y ESQUEMA DE FACTURACIÓN ── */}
          {activeStep === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: '32px' }}>
              
              {/* Modalidad de Cobro */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '20px' }}>
                    <div style={{ background: '#f5f3ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                      <FileText size={16} style={{ color: '#7c3aed' }} />
                    </div>
                    <span style={{ fontSize: '0.9rem' }}>Modalidad de Cobro</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <label style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: `2px solid ${paymentScheme === 'por_entregables' ? '#7c3aed' : '#e2e8f0'}`,
                      background: paymentScheme === 'por_entregables' ? '#f5f3ff' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input 
                        type="radio"
                        name="scheme"
                        checked={paymentScheme === 'por_entregables'}
                        onChange={() => setPaymentScheme('por_entregables')}
                      />
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>Facturación por Entregables</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Cada factura se detona al aprobar un paquete de trabajo</div>
                      </div>
                    </label>

                    <label style={{
                      padding: '16px',
                      borderRadius: '12px',
                      border: `2px solid ${paymentScheme === 'exhibicion_unica' ? '#7c3aed' : '#e2e8f0'}`,
                      background: paymentScheme === 'exhibicion_unica' ? '#f5f3ff' : 'white',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input 
                        type="radio"
                        name="scheme"
                        checked={paymentScheme === 'exhibicion_unica'}
                        onChange={() => setPaymentScheme('exhibicion_unica')}
                      />
                      <div>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>Una Sola Exhibición</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>100% de la cotización facturada al inicio o entrega final</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Registro de Múltiples Órdenes de Compra (POs) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                        <FileCheck size={16} style={{ color: '#3b82f6' }} />
                      </div>
                      <span style={{ fontSize: '0.9rem' }}>Órdenes de Compra (POs) del Cliente</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: poMismatch ? '#dc2626' : '#16a34a' }}>
                      Total POs: ${totalPosAmount.toLocaleString('es-MX')} / Cotizado: ${quotedBudget.toLocaleString('es-MX')}
                    </span>
                  </div>

                  {/* Formulario Nueva PO */}
                  <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>NÚMERO DE PO</label>
                        <input 
                          type="text" 
                          placeholder="Ej. PO-980122" 
                          className="form-input" 
                          value={newPoNumber} 
                          onChange={e => setNewPoNumber(e.target.value)} 
                          style={{ padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>MONTO DE LA PO ($)</label>
                        <input 
                          type="number" 
                          placeholder="0.00" 
                          className="form-input" 
                          value={newPoAmount || ''} 
                          onChange={e => setNewPoAmount(Number(e.target.value))} 
                          style={{ padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>DOCUMENTO DRIVE (OPCIONAL)</label>
                        <input 
                          type="url" 
                          placeholder="https://drive..." 
                          className="form-input" 
                          value={newPoDocUrl} 
                          onChange={e => setNewPoDocUrl(e.target.value)} 
                          style={{ padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>

                    {/* Validación de discrepancia con justificación obligatoria */}
                    {quotedBudget > 0 && newPoAmount > 0 && (newPoAmount !== quotedBudget) && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontWeight: 800, fontSize: '0.75rem', marginBottom: '6px' }}>
                          <ShieldAlert size={14} /> Discrepancia: El monto de la PO no coincide con la cotización vendida.
                        </div>
                        <input 
                          type="text"
                          required
                          placeholder="Justificación obligatoria para el equipo de finanzas *"
                          value={newPoJustification}
                          onChange={e => setNewPoJustification(e.target.value)}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '0.85rem' }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        type="button" 
                        onClick={handleAddPo}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '8px 16px', borderRadius: '10px' }}
                      >
                        <Plus size={14} /> Registrar PO
                      </button>
                    </div>
                  </div>

                  {/* Listado de POs */}
                  {pos.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      {pos.map((p, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                          <div>
                            <strong style={{ fontSize: '0.95rem' }}>{p.po_number}</strong> — <span style={{ color: '#15803d', fontWeight: 800 }}>${p.po_amount.toLocaleString('es-MX')} {p.currency}</span>
                            {p.is_mismatch_with_quote && (
                              <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: '6px' }}>
                                Justificación: {p.mismatch_justification}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setPos(pos.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '6px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
