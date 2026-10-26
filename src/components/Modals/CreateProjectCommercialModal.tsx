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
import type { ProjectPO } from '../../types/projectControl';

interface CreateProjectCommercialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (newProject: any) => void;
  editingProject?: any | null;
}

// Catálogo de roles tabulador con tarifas promedio
const DEFAULT_TABULADOR_ROLES = [
  { role_name: 'Project / Product Manager', seniority: 'Medium (3-5)', hourly_rate: 632.00 },
  { role_name: 'BI Visualization Developer', seniority: 'Medium (3-5)', hourly_rate: 491.60 },
  { role_name: 'Data Engineer', seniority: 'Medium (3-5)', hourly_rate: 589.80 },
  { role_name: 'Data Scientist', seniority: 'Medium (3-5)', hourly_rate: 618.00 },
  { role_name: 'Solution Architect', seniority: 'Medium (3-5)', hourly_rate: 632.00 },
  { role_name: 'BI Data Architect', seniority: 'Medium (3-5)', hourly_rate: 632.00 },
  { role_name: 'Data / Operations Analyst', seniority: 'Medium (3-5)', hourly_rate: 421.20 },
  { role_name: 'Business Analyst', seniority: 'Medium (3-5)', hourly_rate: 516.09 },
  { role_name: 'Low Code Developer', seniority: 'Medium (3-5)', hourly_rate: 442.25 },
  { role_name: 'Power App / Streamlit Developer', seniority: 'Medium (3-5)', hourly_rate: 516.00 },
  { role_name: 'Azure Developer', seniority: 'Medium (3-5)', hourly_rate: 491.60 }
];

interface DynamicCommittedRoleRow {
  id: string;
  role_name: string;
  seniority: string;
  hours: number;
  hourly_rate: number;
}

export default function CreateProjectCommercialModal({
  isOpen,
  onClose,
  onProjectCreated,
  editingProject
}: CreateProjectCommercialModalProps) {
  const { showNotification } = useNotification();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);

  // Catálogos cargados
  const [clients, setClients] = useState<any[]>([]);
  const [tabuladorRoles, setTabuladorRoles] = useState(DEFAULT_TABULADOR_ROLES);
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

  // Presupuesto, Costos y Margen Dinámico
  const [quotedBudget, setQuotedBudget] = useState<number>(0);
  const [targetMarginPct, setTargetMarginPct] = useState<number>(35);
  
  // Líneas dinámicas de roles del tabulador (por defecto al menos 1 línea visible, configurado SOLO EN HORAS)
  const [committedRoleRows, setCommittedRoleRows] = useState<DynamicCommittedRoleRow[]>([
    {
      id: 'row-1',
      role_name: 'Project / Product Manager',
      seniority: 'Medium (3-5)',
      hours: 80,
      hourly_rate: 632.00
    }
  ]);
  
  // Esquema de Pagos
  const [paymentScheme, setPaymentScheme] = useState<'exhibicion_unica' | 'por_entregables'>('por_entregables');

  // Órdenes de Compra (POs)
  const [pos, setPos] = useState<ProjectPO[]>([]);
  const [newPoNumber, setNewPoNumber] = useState('');
  const [newPoAmount, setNewPoAmount] = useState<number>(0);
  const [newPoDocUrl, setNewPoDocUrl] = useState('');
  const [newPoJustification, setNewPoJustification] = useState('');

  // Cargar catálogos y precargar si es edición
  useEffect(() => {
    if (isOpen) {
      fetchInitialData();
      if (editingProject) {
        setName(editingProject.name || '');
        setClientId(editingProject.client_id || '');
        setClientContactName(editingProject.client_contact_name || '');
        setStakeholderEmail(editingProject.stakeholder_email || '');
        setPmId(editingProject.pm_id || '');
        setProposalUrl(editingProject.proposal_url || '');
        setGoogleDriveFolderUrl(editingProject.google_drive_folder_url || '');
        setStartDate(editingProject.delivery_date || editingProject.baseline_start_date || new Date().toISOString().split('T')[0]);
        setDurationWeeks(editingProject.duration_weeks || 4);
        setQuotedBudget(Number(editingProject.quoted_budget) || 0);
        setTargetMarginPct(editingProject.target_margin_pct ?? 35);
        setPaymentScheme(editingProject.payment_scheme || 'por_entregables');

        if (editingProject.committed_roles_breakdown && Array.isArray(editingProject.committed_roles_breakdown) && editingProject.committed_roles_breakdown.length > 0) {
          setCommittedRoleRows(editingProject.committed_roles_breakdown.map((r: any, idx: number) => ({
            id: r.id || `row-${idx}`,
            role_name: r.role_name || 'Project / Product Manager',
            seniority: r.seniority || 'Medium (3-5)',
            hours: Number(r.hours || (r.weeks ? r.weeks * 40 : 80)),
            hourly_rate: Number(r.hourly_rate) || 632.00
          })));
        } else if (editingProject.quoted_hours > 0) {
          setCommittedRoleRows([{
            id: 'row-1',
            role_name: 'Project / Product Manager',
            seniority: 'Medium (3-5)',
            hours: Number(editingProject.quoted_hours),
            hourly_rate: 632.00
          }]);
        }
      } else {
        setName('');
        setClientId('');
        setClientContactName('');
        setStakeholderEmail('');
        setPmId('');
        setProposalUrl('');
        setGoogleDriveFolderUrl('');
        setStartDate(new Date().toISOString().split('T')[0]);
        setDurationWeeks(4);
        setQuotedBudget(0);
        setTargetMarginPct(35);
        setCommittedRoleRows([
          {
            id: 'row-1',
            role_name: 'Project / Product Manager',
            seniority: 'Medium (3-5)',
            hours: 80,
            hourly_rate: 632.00
          }
        ]);
        setPos([]);
      }
    }
  }, [isOpen, editingProject]);

  const fetchInitialData = async () => {
    try {
      const [clientsRes, profilesRes, tabRes] = await Promise.all([
        supabase.from('clients').select('id, name, reference_name, email, contacts').order('reference_name'),
        supabase.from('profiles').select('id, full_name, email').eq('role', 'admin').order('full_name'),
        supabase.from('tabulador').select('*')
      ]);

      if (clientsRes.data) setClients(clientsRes.data);
      if (profilesRes.data) setPms(profilesRes.data);

      if (tabRes.data && tabRes.data.length > 0) {
        // Promediar tarifas reales por rol del tabulador
        const roleMap: Record<string, { totalRate: number; count: number; seniority: string }> = {};
        tabRes.data.forEach((t: any) => {
          if (t.rol && t.costo_hora_mxn) {
            if (!roleMap[t.rol]) roleMap[t.rol] = { totalRate: 0, count: 0, seniority: t.seniority || 'Mid' };
            roleMap[t.rol].totalRate += Number(t.costo_hora_mxn);
            roleMap[t.rol].count += 1;
          }
        });
        const dynamicParsed = Object.entries(roleMap).map(([role, info]) => ({
          role_name: role,
          seniority: info.seniority,
          hourly_rate: Number((info.totalRate / info.count).toFixed(2))
        }));
        if (dynamicParsed.length > 0) setTabuladorRoles(dynamicParsed);
      }
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

  // Cálculos de Margen y Costos usando roles dinámicos del tabulador (SOLO HORAS)
  const totalCommittedHours = committedRoleRows.reduce((acc, curr) => acc + Number(curr.hours || 0), 0);
  const totalEstimatedCost = committedRoleRows.reduce((acc, curr) => acc + (Number(curr.hours || 0) * (Number(curr.hourly_rate) || 0)), 0);
  const calculatedMarginMoney = quotedBudget > 0 ? (quotedBudget - totalEstimatedCost) : 0;
  const calculatedMarginPct = quotedBudget > 0 ? ((calculatedMarginMoney / quotedBudget) * 100) : 0;
  const totalPosAmount = pos.reduce((acc, curr) => acc + (Number(curr.po_amount) || 0), 0);
  const poMismatch = quotedBudget > 0 && totalPosAmount > 0 && Math.abs(totalPosAmount - quotedBudget) > 1.0;

  // Manejo dinámico de roles en la propuesta (SOLO HORAS)
  const handleAddRoleRow = () => {
    setCommittedRoleRows(prev => [
      ...prev,
      {
        id: 'row-' + Date.now(),
        role_name: tabuladorRoles[0]?.role_name || 'Data Engineer',
        seniority: tabuladorRoles[0]?.seniority || 'Medium (3-5)',
        hours: 80,
        hourly_rate: tabuladorRoles[0]?.hourly_rate || 589.80
      }
    ]);
  };

  const handleUpdateRoleRow = (id: string, updates: Partial<DynamicCommittedRoleRow>) => {
    setCommittedRoleRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...updates };
      if (updates.role_name && updates.role_name !== r.role_name) {
        const found = tabuladorRoles.find(t => t.role_name === updates.role_name);
        if (found) {
          updated.hourly_rate = found.hourly_rate;
          updated.seniority = found.seniority;
        }
      }
      return updated;
    }));
  };

  const handleRemoveRoleRow = (id: string) => {
    if (committedRoleRows.length <= 1) {
      showNotification('info', 'Debe mantenerse al menos 1 rol en la propuesta.');
      return;
    }
    setCommittedRoleRows(prev => prev.filter(r => r.id !== id));
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

  // Creación o Actualización Resiliente de Proyecto (Sin Bloqueos por Columnas Faltantes)
  const handleSubmitProject = async () => {
    if (!name.trim()) return showNotification('error', 'El nombre del proyecto es obligatorio');
    if (!clientId) return showNotification('error', 'Selecciona un cliente');
    if (!stakeholderEmail.trim()) return showNotification('error', 'El correo del stakeholder es obligatorio');
    if (quotedBudget <= 0) return showNotification('error', 'Ingresa el monto del presupuesto cotizado');

    setLoading(true);
    try {
      const fullPayload: Record<string, any> = {
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
        committed_roles_breakdown: committedRoleRows
      };

      if (!editingProject) {
        fullPayload.status = 'todo';
        fullPayload.stage = 'arranque';
        fullPayload.current_baseline_version = 1;
      }

      let projectData: any = null;
      let currentPayload = { ...fullPayload };

      if (editingProject?.id) {
        // Modo Actualización
        for (let attempt = 0; attempt < 6; attempt++) {
          const { data, error: projErr } = await supabase
            .from('projects')
            .update(currentPayload)
            .eq('id', editingProject.id)
            .select(`*, clients(name, reference_name)`)
            .single();

          if (!projErr) {
            projectData = data;
            break;
          }

          const missingColMatch = projErr.message.match(/Could not find the '([^']+)' column/i) ||
                                  projErr.message.match(/column "?([^"\s]+)"? of relation "?projects"? does not exist/i);
          if (missingColMatch && missingColMatch[1] && missingColMatch[1] in currentPayload) {
            const colToRemove = missingColMatch[1];
            console.warn(`Omitiendo columna no existente en BD al actualizar: ${colToRemove}`);
            delete currentPayload[colToRemove];
            continue;
          }

          throw projErr;
        }

        showNotification('success', `Proyecto "${name}" actualizado con éxito`);
        onProjectCreated(projectData || { id: editingProject.id, ...currentPayload });
        onClose();
        return;
      }

      // Modo Creación
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error: projErr } = await supabase
          .from('projects')
          .insert([currentPayload])
          .select(`*, clients(name, reference_name)`)
          .single();

        if (!projErr) {
          projectData = data;
          break;
        }

        // Si el error indica columna inexistente (e.g. Could not find the 'baseline_start_date' column)
        const missingColMatch = projErr.message.match(/Could not find the '([^']+)' column/i) ||
                                projErr.message.match(/column "?([^"\s]+)"? of relation "?projects"? does not exist/i);
        if (missingColMatch && missingColMatch[1] && missingColMatch[1] in currentPayload) {
          const colToRemove = missingColMatch[1];
          console.warn(`Omitiendo columna no existente en BD projects: ${colToRemove}`);
          delete currentPayload[colToRemove];
          continue;
        }

        // Si es otro error no recuperable, lanzarlo
        throw projErr;
      }

      if (!projectData) {
        throw new Error('No se pudo confirmar la creación del proyecto.');
      }

      if (pos.length > 0) {
        try {
          const posToInsert = pos.map(p => ({
            ...p,
            project_id: projectData.id
          }));
          await supabase.from('project_pos').insert(posToInsert);
        } catch (poErr) {
          console.warn('Advertencia al insertar POs:', poErr);
        }
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
                {editingProject ? 'Editar Proyecto & Control Interno' : 'Alta Comercial & Control Interno'}
              </h2>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {editingProject ? 'Modifica cotización, presupuesto, links y configuración inicial' : 'Configuración completa de cotización, margen proyectado, stakeholder y POs'}
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
              <span>{editingProject ? 'Guardar Cambios' : 'Dar de Alta Proyecto'}</span>
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
                    {selectedClientObj?.location_country && (
                      <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '8px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>📍 Ubicación: <strong>{selectedClientObj.location_country}</strong> ({selectedClientObj.timezone || 'GMT-6'})</span>
                        <span style={{ color: '#047857', fontWeight: 700 }}>🏖️ Calendario festivos activo</span>
                      </div>
                    )}
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

              {/* Desglose Dinámico de Horas y Roles del Tabulador */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                  <div className="card-title" style={{ color: '#1e293b', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ background: '#f5f3ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                        <Calculator size={16} style={{ color: '#7c3aed' }} />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Horas Comprometidas por Rol (Tabulador)</span>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Costo estimado cruzado con promedio de posiciones reales</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.85rem', color: '#7c3aed', fontWeight: 800 }}>Total: {totalCommittedHours} hrs</span>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Costo: ${totalEstimatedCost.toLocaleString('es-MX')}</div>
                    </div>
                  </div>

                  {/* Lista Dinámica de Roles (Configuración SOLO EN HORAS, sin corte de texto) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    {committedRoleRows.map((row, idx) => {
                      const rowHours = Number(row.hours || 0);
                      const rowCost = rowHours * Number(row.hourly_rate || 0);

                      return (
                        <div 
                          key={row.id} 
                          style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'minmax(220px, 1.8fr) 140px 130px 40px', 
                            gap: '14px', 
                            alignItems: 'center', 
                            background: '#f8fafc', 
                            padding: '12px 16px', 
                            borderRadius: '12px', 
                            border: '1px solid #e2e8f0' 
                          }}
                        >
                          {/* 1. Selector de Rol del Tabulador (Texto amplio y visible) */}
                          <div>
                            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              ROL #{idx + 1} (TABULADOR)
                            </label>
                            <select
                              className="form-input"
                              value={row.role_name}
                              onChange={e => handleUpdateRoleRow(row.id, { role_name: e.target.value })}
                              style={{ 
                                width: '100%', 
                                height: '42px', 
                                padding: '0 12px', 
                                borderRadius: '10px', 
                                fontSize: '0.85rem', 
                                fontWeight: 700, 
                                marginBottom: 0,
                                boxSizing: 'border-box',
                                lineHeight: 'normal'
                              }}
                            >
                              {tabuladorRoles.map(tr => (
                                <option key={tr.role_name} value={tr.role_name}>
                                  {tr.role_name} (${tr.hourly_rate.toFixed(2)}/h)
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 2. Tiempo Asignado: SOLO HORAS HABILITADO */}
                          <div>
                            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              HORAS ASIGNADAS
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input 
                                type="number"
                                min={1}
                                step={1}
                                value={row.hours}
                                onChange={e => handleUpdateRoleRow(row.id, { hours: Number(e.target.value) })}
                                style={{ 
                                  width: '100%', 
                                  height: '42px', 
                                  padding: '0 32px 0 12px', 
                                  borderRadius: '10px', 
                                  border: '1px solid #cbd5e1', 
                                  fontSize: '0.9rem', 
                                  fontWeight: 800, 
                                  textAlign: 'center',
                                  boxSizing: 'border-box'
                                }}
                              />
                              <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>
                                hrs
                              </span>
                            </div>
                          </div>

                          {/* 3. Costo Total de la Línea */}
                          <div>
                            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '4px', textAlign: 'right' }}>
                              COSTO TOTAL
                            </label>
                            <div style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontWeight: 800, fontSize: '0.95rem', color: '#334155' }}>
                              ${rowCost.toLocaleString('es-MX')}
                            </div>
                          </div>

                          {/* 4. Botón Eliminar Fila */}
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveRoleRow(row.id)}
                              style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '6px' }}
                              title="Eliminar rol de la cotización"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Botón para Agregar Dinámicamente Más Roles */}
                  <button
                    type="button"
                    onClick={handleAddRoleRow}
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      border: '2px dashed #cbd5e1',
                      background: '#f8fafc',
                      color: 'var(--primary-color)'
                    }}
                  >
                    <Plus size={15} /> + Agregar Otro Rol a la Cotización
                  </button>
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
