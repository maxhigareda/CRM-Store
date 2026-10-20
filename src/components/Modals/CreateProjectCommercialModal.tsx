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
  ChevronRight,
  Loader2
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

  // 1. Cargar datos iniciales
  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
    }
  }, [isOpen]);

  const fetchInitialData = async () => {
    try {
      const [clientsRes, ratesRes, profilesRes] = await Promise.all([
        supabase.from('clients').select('id, name, reference_name, email').order('reference_name'),
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

  // 2. Al cambiar de cliente, cargar festivos de su sede
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

  // 3. Recalcular fecha fin automáticamente
  useEffect(() => {
    if (startDate && durationWeeks > 0) {
      const workingDays = weeksToWorkingDays(durationWeeks);
      const computedEnd = calculateWorkingEndDate(startDate, workingDays, holidays);
      setCalculatedEndDate(computedEnd);
    }
  }, [startDate, durationWeeks, holidays]);

  // 4. Cálculos Financieros del Presupuesto
  const totalCommittedHours = committedResources.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0);
  const totalEstimatedCost = committedResources.reduce((acc, curr) => acc + ((Number(curr.hours) || 0) * (Number(curr.rate) || 0)), 0);
  const calculatedMarginMoney = quotedBudget > 0 ? (quotedBudget - totalEstimatedCost) : 0;
  const calculatedMarginPct = quotedBudget > 0 ? ((calculatedMarginMoney / quotedBudget) * 100) : 0;
  const totalPosAmount = pos.reduce((acc, curr) => acc + (Number(curr.po_amount) || 0), 0);
  const poMismatch = quotedBudget > 0 && totalPosAmount > 0 && Math.abs(totalPosAmount - quotedBudget) > 1.0;

  // Agregar recurso comprometido a la propuesta
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

  // Agregar Orden de Compra (PO)
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

  // Guardar Proyecto Completo
  const handleSubmitProject = async () => {
    if (!name.trim()) return showNotification('error', 'El nombre del proyecto es obligatorio');
    if (!clientId) return showNotification('error', 'Selecciona un cliente');
    if (!stakeholderEmail.trim()) return showNotification('error', 'El correo del stakeholder es obligatorio');
    if (quotedBudget <= 0) return showNotification('error', 'Ingresa el monto del presupuesto cotizado');

    setLoading(true);
    try {
      // 1. Insertar Proyecto
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

      // 2. Insertar POs vinculadas
      if (pos.length > 0) {
        const posToInsert = pos.map(p => ({
          ...p,
          project_id: projectData.id
        }));
        const { error: posErr } = await supabase.from('project_pos').insert(posToInsert);
        if (posErr) console.error('Error insertando POs:', posErr);
      }

      showNotification('success', `Proyecto "${name}" dado de alta exitosamente con margen estimado del ${calculatedMarginPct.toFixed(1)}%`);
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

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        width: '840px',
        maxWidth: '96%',
        maxHeight: '92vh',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        
        {/* Header Modal */}
        <div style={{
          padding: '20px 28px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
              Alta Comercial de Proyecto
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Control interno: Cotización, margen automático, stakeholder y cronograma con festivos
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Stepper Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
          <button
            onClick={() => setActiveStep(1)}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeStep === 1 ? '#f5f3ff' : 'transparent',
              borderBottom: activeStep === 1 ? '3px solid #8b5cf6' : 'none',
              color: activeStep === 1 ? '#7c3aed' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Building2 size={16} /> 1. Datos del Cliente & Alcance
          </button>
          <button
            onClick={() => setActiveStep(2)}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeStep === 2 ? '#f5f3ff' : 'transparent',
              borderBottom: activeStep === 2 ? '3px solid #8b5cf6' : 'none',
              color: activeStep === 2 ? '#7c3aed' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Calculator size={16} /> 2. Cotización & Margen Real
          </button>
          <button
            onClick={() => setActiveStep(3)}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeStep === 3 ? '#f5f3ff' : 'transparent',
              borderBottom: activeStep === 3 ? '3px solid #8b5cf6' : 'none',
              color: activeStep === 3 ? '#7c3aed' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <FileCheck size={16} /> 3. POs & Esquema de Cobro
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* ── STEP 1: Datos Generales y Cronograma ── */}
          {activeStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    NOMBRE DEL PROYECTO *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej. Implementación Data Lake Liverpool..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    CLIENTE / EMPRESA *
                  </label>
                  <select
                    required
                    value={clientId}
                    onChange={e => {
                      setClientId(e.target.value);
                      const sel = clients.find(c => c.id === e.target.value);
                      if (sel && sel.email) setStakeholderEmail(sel.email);
                      if (sel && sel.name) setClientContactName(sel.name);
                    }}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: 'white' }}
                  >
                    <option value="">-- Selecciona un Cliente --</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.reference_name || c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    CONTACTO PRINCIPAL
                  </label>
                  <input
                    type="text"
                    value={clientContactName}
                    onChange={e => setClientContactName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    STAKEHOLDER POR CORREO (CLIENTE) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="email"
                      required
                      value={stakeholderEmail}
                      onChange={e => setStakeholderEmail(e.target.value)}
                      placeholder="stakeholder@cliente.com"
                      style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    PROJECT MANAGER (PM) ASIGNADO
                  </label>
                  <select
                    value={pmId}
                    onChange={e => setPmId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: 'white' }}
                  >
                    <option value="">-- Selecciona un PM --</option>
                    {pms.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sección Cronograma con Días Hábiles */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6', fontWeight: 800, fontSize: '0.85rem' }}>
                  <Calendar size={18} /> CRONOGRAMA HÁBIL INTELIGENTE (SEDE CLIENTE)
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                      FECHA DE ARRANQUE (KICK-OFF)
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                      DURACIÓN (SEMANAS COTIZADAS)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={durationWeeks}
                      onChange={e => setDurationWeeks(Number(e.target.value))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                      FECHA FIN CALCULADA (HÁBILES)
                    </label>
                    <input
                      type="date"
                      disabled
                      value={calculatedEndDate}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✓ {weeksToWorkingDays(durationWeeks)} días hábiles de trabajo calculados.</span>
                  {holidays.length > 0 && (
                    <span style={{ color: '#8b5cf6', fontWeight: 600 }}>• Se omitieron {holidays.length} festivos de la sede del cliente.</span>
                  )}
                </div>
              </div>

              {/* Enlaces a Drive */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    LINK PROPUESTA / CONTRATO (GOOGLE DRIVE)
                  </label>
                  <input
                    type="url"
                    value={proposalUrl}
                    onChange={e => setProposalUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    CARPETA DEL PROYECTO (GOOGLE DRIVE)
                  </label>
                  <input
                    type="url"
                    value={googleDriveFolderUrl}
                    onChange={e => setGoogleDriveFolderUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Cotización y Margen Automático ── */}
          {activeStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Presupuesto Total y Margen Meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    MONTO TOTAL VENDIDO (COTIZACIÓN MXN) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="number"
                      required
                      min={0}
                      step={100}
                      value={quotedBudget || ''}
                      onChange={e => setQuotedBudget(Number(e.target.value))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 700 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    MARGEN META OBJETIVO (%)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Percent size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={targetMarginPct}
                      onChange={e => setTargetMarginPct(Number(e.target.value))}
                      style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '1rem', fontWeight: 700 }}
                    />
                  </div>
                </div>
              </div>

              {/* Tarjeta de Cálculo de Margen Automático */}
              <div style={{
                background: calculatedMarginPct >= targetMarginPct ? '#f0fdf4' : '#fff7ed',
                border: `1px solid ${calculatedMarginPct >= targetMarginPct ? '#bbf7d0' : '#fed7aa'}`,
                padding: '16px 20px',
                borderRadius: '14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>TOTAL HORAS COMPROMETIDAS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>{totalCommittedHours} hrs</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>COSTO ESTIMADO ROL</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#dc2626' }}>${totalEstimatedCost.toLocaleString('es-MX')}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>MARGEN ESTIMADO ($)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: calculatedMarginMoney >= 0 ? '#16a34a' : '#dc2626' }}>
                    ${calculatedMarginMoney.toLocaleString('es-MX')}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b' }}>% MARGEN CALCULADO</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: calculatedMarginPct >= targetMarginPct ? '#16a34a' : '#d97706' }}>
                    {calculatedMarginPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Desglose de Horas y Roles Comprometidos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>
                    HORAS COMPROMETIDAS POR RECURSO / ROL EN PROPUESTA:
                  </label>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Multiplicado por el tabulador de roles
                  </div>
                </div>

                {/* Botones rápidos para agregar rol */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  {costRates.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddResource(item)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={12} /> {item.role_name} (${item.hourly_rate_estimated}/h)
                    </button>
                  ))}
                </div>

                {/* Lista de Recursos Comprometidos */}
                {committedResources.length === 0 ? (
                  <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                    Agrega los roles y las horas cotizadas arriba para calcular el margen automático.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {committedResources.map((res, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 40px', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{res.role_name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Horas:</span>
                          <input
                            type="number"
                            min={1}
                            value={res.hours}
                            onChange={e => handleUpdateResourceHours(idx, Number(e.target.value))}
                            style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                          />
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
                          Subtotal: ${(res.hours * res.rate).toLocaleString('es-MX')}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveResource(idx)}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: POs y Esquema de Facturación ── */}
          {activeStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Esquema de Pagos */}
              <div style={{ background: '#f8fafc', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '8px' }}>
                  MODALIDAD DE PAGO DEL PROYECTO *
                </label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="payment_scheme"
                      checked={paymentScheme === 'por_entregables'}
                      onChange={() => setPaymentScheme('por_entregables')}
                    />
                    Por Entregables (Hitos de Facturación)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="payment_scheme"
                      checked={paymentScheme === 'exhibicion_unica'}
                      onChange={() => setPaymentScheme('exhibicion_unica')}
                    />
                    En una sola exhibición (100% al inicio / cierre)
                  </label>
                </div>
              </div>

              {/* Registro de Múltiples Órdenes de Compra (POs) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>
                    ÓRDENES DE COMPRA (PO) DEL CLIENTE:
                  </label>
                  <span style={{ fontSize: '0.75rem', color: poMismatch ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                    Total POs: ${totalPosAmount.toLocaleString('es-MX')} / Cotizado: ${quotedBudget.toLocaleString('es-MX')}
                  </span>
                </div>

                {/* Formulario para añadir PO */}
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '10px' }}>
                    <div>
                      <input
                        type="text"
                        placeholder="N° de PO (Ej. PO-4500918)"
                        value={newPoNumber}
                        onChange={e => setNewPoNumber(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        placeholder="Monto PO ($)"
                        value={newPoAmount || ''}
                        onChange={e => setNewPoAmount(Number(e.target.value))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <input
                        type="url"
                        placeholder="Link Documento PO (Drive)"
                        value={newPoDocUrl}
                        onChange={e => setNewPoDocUrl(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Justificación obligatoria si hay discrepancia */}
                  {quotedBudget > 0 && newPoAmount > 0 && (newPoAmount !== quotedBudget) && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b91c1c', fontWeight: 700, fontSize: '0.75rem', marginBottom: '4px' }}>
                        <ShieldAlert size={14} /> El monto de la PO (${newPoAmount.toLocaleString('es-MX')}) no coincide con la cotización (${quotedBudget.toLocaleString('es-MX')}).
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="Escribe la justificación para el equipo financiero *"
                        value={newPoJustification}
                        onChange={e => setNewPoJustification(e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '0.8rem' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={handleAddPo}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Plus size={14} /> Añadir PO a la lista
                    </button>
                  </div>
                </div>

                {/* Lista de POs añadidas */}
                {pos.length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pos.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                        <div>
                          <strong>{p.po_number}</strong> — ${p.po_amount.toLocaleString('es-MX')} {p.currency}
                          {p.is_mismatch_with_quote && (
                            <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>
                              Desviación justificada: {p.mismatch_justification}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPos(pos.filter((_, i) => i !== idx))}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 28px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            {activeStep > 1 && (
              <button
                type="button"
                onClick={() => setActiveStep((activeStep - 1) as any)}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
              >
                ← Anterior
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              Cancelar
            </button>

            {activeStep < 3 ? (
              <button
                type="button"
                onClick={() => setActiveStep((activeStep + 1) as any)}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Siguiente Paso <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmitProject}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', background: '#16a34a', borderColor: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <FileCheck size={16} />}
                Guardar y Dar de Alta Proyecto
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
