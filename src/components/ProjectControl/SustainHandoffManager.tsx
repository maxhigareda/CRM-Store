import { useState, useEffect } from 'react';
import { 
  Rocket, 
  ShieldCheck, 
  CheckCircle2, 
  Save, 
  Lock, 
  Unlock, 
  ExternalLink,
  Plus,
  Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import type { SustainHandoff } from '../../types/projectControl';

interface SustainHandoffManagerProps {
  projectId: string;
  profiles: any[];
  onHandoffUpdated?: () => void;
}

export default function SustainHandoffManager({
  projectId,
  profiles,
  onHandoffUpdated
}: SustainHandoffManagerProps) {
  const { profile } = useAuth();
  const { showNotification } = useNotification();
  const isAdmin = profile?.role === 'admin';

  const [handoff, setHandoff] = useState<SustainHandoff | null>(null);
  const [_loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Form State
  const [supportContractUrl, setSupportContractUrl] = useState<string>('');
  const [supportQuoteUrl, setSupportQuoteUrl] = useState<string>('');
  const [supportScopeDescription, setSupportScopeDescription] = useState<string>('');
  const [monitoringAnalystId, setMonitoringAnalystId] = useState<string>('');
  const [dataEngChangesScope, setDataEngChangesScope] = useState<string>('');
  const [pbiChangesScope, setPbiChangesScope] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [supportedProducts, setSupportedProducts] = useState<string[]>([]);
  const [newProduct, setNewProduct] = useState<string>('');
  const [documentationUrls, setDocumentationUrls] = useState<{ title: string; url: string }[]>([]);
  const [newDocTitle, setNewDocTitle] = useState<string>('');
  const [newDocUrl, setNewDocUrl] = useState<string>('');
  const [acceptanceActUrl, setAcceptanceActUrl] = useState<string>('');

  // Exception Override State for Admins
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('');

  useEffect(() => {
    fetchHandoff();
  }, [projectId]);

  const fetchHandoff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_sustain_handoff')
        .select('*, monitoring_analyst:profiles(id, full_name, email), approved_by_profile:profiles(id, full_name, email)')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setHandoff(data);
        setSupportContractUrl(data.support_contract_url || '');
        setSupportQuoteUrl(data.support_quote_url || '');
        setSupportScopeDescription(data.support_scope_description || '');
        setMonitoringAnalystId(data.monitoring_analyst_id || '');
        setDataEngChangesScope(data.data_eng_changes_scope || '');
        setPbiChangesScope(data.pbi_changes_scope || '');
        setAdditionalNotes(data.additional_notes || '');
        setSupportedProducts(data.supported_products_census || []);
        setDocumentationUrls(data.documentation_urls || []);
        setAcceptanceActUrl(data.acceptance_act_url || '');
      }
    } catch (err: any) {
      console.error('Error fetching sustain handoff:', err);
    } finally {
      setLoading(false);
    }
  };

  // Checklist Validation
  const checklistItems = [
    { label: 'Contrato de soporte o SLA firmado', isDone: Boolean(supportContractUrl) },
    { label: 'Alcance detallado de soporte definido', isDone: Boolean(supportScopeDescription.trim().length > 10) },
    { label: 'Analista de monitoreo asignado', isDone: Boolean(monitoringAnalystId) },
    { label: 'Alcance de cambios Data Engineering', isDone: Boolean(dataEngChangesScope.trim().length > 5) },
    { label: 'Alcance de cambios Power BI / Dashboards', isDone: Boolean(pbiChangesScope.trim().length > 5) },
    { label: 'Censo de productos tecnológicos soportados', isDone: supportedProducts.length > 0 },
    { label: 'Documentación técnica y manuales de usuario', isDone: documentationUrls.length > 0 },
    { label: 'Acta formal de entrega y aceptación del cliente', isDone: Boolean(acceptanceActUrl) },
  ];

  const completedCount = checklistItems.filter(i => i.isDone).length;
  const progressPct = Math.round((completedCount / checklistItems.length) * 100);
  const isChecklistComplete = completedCount === checklistItems.length;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        support_contract_url: supportContractUrl,
        support_quote_url: supportQuoteUrl,
        support_scope_description: supportScopeDescription,
        monitoring_analyst_id: monitoringAnalystId || null,
        data_eng_changes_scope: dataEngChangesScope,
        pbi_changes_scope: pbiChangesScope,
        additional_notes: additionalNotes,
        supported_products_census: supportedProducts,
        documentation_urls: documentationUrls,
        acceptance_act_url: acceptanceActUrl
      };

      const { data, error } = await supabase
        .from('project_sustain_handoff')
        .upsert(payload, { onConflict: 'project_id' })
        .select()
        .single();

      if (error) throw error;
      setHandoff(data);
      showNotification('success', 'Borrador de pase a Sustain guardado.');
      if (onHandoffUpdated) onHandoffUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveHandoff = async () => {
    if (!isChecklistComplete && !isAdmin) {
      showNotification('error', 'El checklist está incompleto. Solo un Administrador puede autorizar con justificación.');
      return;
    }

    setSaving(true);
    try {
      // 1. Guardar handoff aprobado
      const payload = {
        project_id: projectId,
        is_completed: true,
        handoff_approved_by: profile?.id,
        handoff_approved_at: new Date().toISOString(),
        support_contract_url: supportContractUrl,
        support_quote_url: supportQuoteUrl,
        support_scope_description: supportScopeDescription,
        monitoring_analyst_id: monitoringAnalystId || null,
        data_eng_changes_scope: dataEngChangesScope,
        pbi_changes_scope: pbiChangesScope,
        additional_notes: additionalNotes,
        supported_products_census: supportedProducts,
        documentation_urls: documentationUrls,
        acceptance_act_url: acceptanceActUrl
      };

      await supabase
        .from('project_sustain_handoff')
        .upsert(payload, { onConflict: 'project_id' });

      // 2. Mover proyecto a fase 'sustain' y estado 'Finalizado'
      await supabase
        .from('projects')
        .update({
          stage: 'sustain',
          status: 'Finalizado'
        })
        .eq('id', projectId);

      showNotification('success', '🎉 ¡Proyecto transferido a Sustain exitosamente!');
      await fetchHandoff();
      if (onHandoffUpdated) onHandoffUpdated();
    } catch (err: any) {
      showNotification('error', err.message || 'Error al autorizar pase');
    } finally {
      setSaving(false);
    }
  };

  const handleAdminOverride = async () => {
    if (!overrideReason.trim()) {
      showNotification('error', 'Debes ingresar el motivo de excepción para autorizar el cierre.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        is_completed: true,
        handoff_approved_by: profile?.id,
        handoff_approved_at: new Date().toISOString(),
        additional_notes: `[AUTORIZACIÓN EXCEPCIONAL POR ADMIN]: ${overrideReason}\n\n${additionalNotes}`,
        support_contract_url: supportContractUrl,
        support_quote_url: supportQuoteUrl,
        support_scope_description: supportScopeDescription || 'Aprobado por excepción administrativa',
        monitoring_analyst_id: monitoringAnalystId || null,
        data_eng_changes_scope: dataEngChangesScope,
        pbi_changes_scope: pbiChangesScope,
        supported_products_census: supportedProducts,
        documentation_urls: documentationUrls,
        acceptance_act_url: acceptanceActUrl
      };

      await supabase
        .from('project_sustain_handoff')
        .upsert(payload, { onConflict: 'project_id' });

      await supabase
        .from('projects')
        .update({
          stage: 'sustain',
          status: 'Finalizado'
        })
        .eq('id', projectId);

      showNotification('success', 'Pase autorizado por excepción administrativa.');
      setShowOverrideModal(false);
      await fetchHandoff();
      if (onHandoffUpdated) onHandoffUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div 
        style={{ 
          background: handoff?.is_completed 
            ? 'linear-gradient(135deg, #065f46 0%, #047857 100%)' 
            : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
          color: 'white', 
          borderRadius: '20px', 
          padding: '24px 30px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', padding: '14px', borderRadius: '16px', display: 'flex' }}>
            <Rocket size={32} color="white" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>
                Pase a Sustain / Operaciones
              </h2>
              {handoff?.is_completed ? (
                <span style={{ background: '#34d399', color: '#064e3b', fontWeight: 800, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '8px' }}>
                  ✓ EN SUSTAIN (TRANSFERIDO)
                </span>
              ) : (
                <span style={{ background: '#f59e0b', color: '#78350f', fontWeight: 800, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '8px' }}>
                  EN PREPARACIÓN
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#94a3b8', maxWidth: '600px' }}>
              Acta digital y checklist obligatorio para transferir la custodia del proyecto al equipo de soporte continuo y monitoreo.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {handoff?.is_completed ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8rem', color: '#d1fae5' }}>Aprobado por:</div>
              <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                {handoff.approved_by_profile?.full_name || 'Administración'}
              </div>
            </div>
          ) : isChecklistComplete ? (
            <button
              onClick={handleApproveHandoff}
              disabled={saving}
              className="btn btn-primary"
              style={{
                background: '#10b981',
                padding: '12px 24px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
              }}
            >
              <ShieldCheck size={18} /> Autorizar Pase a Sustain
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="btn btn-secondary"
                style={{ padding: '10px 18px', borderRadius: '12px', fontWeight: 700, fontSize: '0.85rem', background: 'white', color: '#1e293b' }}
              >
                <Save size={16} style={{ marginRight: '6px' }} /> Guardar Borrador
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowOverrideModal(true)}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Unlock size={16} /> Forzar Cierre (Admin)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar & Gatekeeper */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '18px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isChecklistComplete ? <CheckCircle2 size={18} color="#16a34a" /> : <Lock size={18} color="#d97706" />}
            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
              {isChecklistComplete ? 'Checklist Completo: Habilitado para Sustain' : 'Requisitos Obligatorios para Cierre'}
            </span>
          </div>
          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: isChecklistComplete ? '#16a34a' : '#d97706' }}>
            {completedCount} de {checklistItems.length} requisitos ({progressPct}%)
          </span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: isChecklistComplete ? '#10b981' : '#f59e0b', transition: 'width 0.3s' }} />
        </div>

        {/* Quick Badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px', marginTop: '14px' }}>
          {checklistItems.map((item, idx) => (
            <div 
              key={idx}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontSize: '0.75rem', 
                color: item.isDone ? '#16a34a' : '#94a3b8',
                fontWeight: item.isDone ? 700 : 500 
              }}
            >
              {item.isDone ? <CheckCircle2 size={14} color="#16a34a" /> : <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '1.5px dashed #cbd5e1' }} />}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Form: Acta de Transferencia */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Columna Izquierda: Contratos y Alcance */}
        <div className="form-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            1. Contrato, Analista y Alcance Operativo
          </h3>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ENLACE AL CONTRATO DE SOPORTE / DRIVE
            </label>
            <input
              type="url"
              className="form-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
              placeholder="https://drive.google.com/..."
              value={supportContractUrl}
              onChange={(e) => setSupportContractUrl(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ANALISTA DE MONITOREO RESPONSABLE
            </label>
            <select
              className="form-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
              value={monitoringAnalystId}
              onChange={(e) => setMonitoringAnalystId(e.target.value)}
            >
              <option value="">Seleccionar analista de operaciones...</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              DESCRIPCIÓN GENERAL DEL ALCANCE DE SUSTAIN
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', minHeight: '80px', borderRadius: '10px', fontSize: '0.85rem' }}
              placeholder="Horario de atención, SLAs acordados, canales de comunicación y límites del soporte..."
              value={supportScopeDescription}
              onChange={(e) => setSupportScopeDescription(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ALCANCE DE CAMBIOS EN DATA ENGINEERING
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', minHeight: '65px', borderRadius: '10px', fontSize: '0.85rem' }}
              placeholder="Pipelines soportados, ventanas de carga, monitoreo de errores..."
              value={dataEngChangesScope}
              onChange={(e) => setDataEngChangesScope(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ALCANCE DE CAMBIOS EN POWER BI / DASHBOARDS
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', minHeight: '65px', borderRadius: '10px', fontSize: '0.85rem' }}
              placeholder="Tableros incluidos, ajustes de visuales, refresco programado..."
              value={pbiChangesScope}
              onChange={(e) => setPbiChangesScope(e.target.value)}
            />
          </div>
        </div>

        {/* Columna Derecha: Tecnologías, Documentación y Acta */}
        <div className="form-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
            2. Censo Tecnológico, Documentación y Aceptación
          </h3>

          {/* Censo de Productos */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              CENSO DE TECNOLOGÍAS Y PRODUCTOS SOPORTADOS
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                className="form-input"
                style={{ flex: 1, height: '38px', borderRadius: '8px', fontSize: '0.8rem' }}
                placeholder="Ej. BigQuery, Airflow, Power BI Pro, Cloud Functions..."
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newProduct.trim()) {
                      setSupportedProducts([...supportedProducts, newProduct.trim()]);
                      setNewProduct('');
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newProduct.trim()) {
                    setSupportedProducts([...supportedProducts, newProduct.trim()]);
                    setNewProduct('');
                  }
                }}
                className="btn btn-secondary"
                style={{ padding: '0 12px', borderRadius: '8px', fontSize: '0.8rem' }}
              >
                <Plus size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {supportedProducts.map((p, idx) => (
                <span
                  key={idx}
                  style={{ background: '#f1f5f9', color: '#1e293b', fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => setSupportedProducts(supportedProducts.filter((_, i) => i !== idx))}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Documentación URLs */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              MANUALES TÉCNICOS Y DOCUMENTACIÓN
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', marginBottom: '8px' }}>
              <input
                type="text"
                className="form-input"
                style={{ height: '36px', borderRadius: '8px', fontSize: '0.8rem' }}
                placeholder="Título del documento..."
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
              />
              <input
                type="url"
                className="form-input"
                style={{ height: '36px', borderRadius: '8px', fontSize: '0.8rem' }}
                placeholder="https://..."
                value={newDocUrl}
                onChange={(e) => setNewDocUrl(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  if (newDocTitle && newDocUrl) {
                    setDocumentationUrls([...documentationUrls, { title: newDocTitle, url: newDocUrl }]);
                    setNewDocTitle('');
                    setNewDocUrl('');
                  }
                }}
                className="btn btn-secondary"
                style={{ padding: '0 10px', borderRadius: '8px' }}
              >
                <Plus size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {documentationUrls.map((doc, idx) => (
                <div
                  key={idx}
                  style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}
                >
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ExternalLink size={12} /> {doc.title}
                  </a>
                  <button
                    type="button"
                    onClick={() => setDocumentationUrls(documentationUrls.filter((_, i) => i !== idx))}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Acta de Aceptación del Cliente */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              ACTA FORMAL DE ENTREGA Y ACEPTACIÓN DEL CLIENTE
            </label>
            <input
              type="url"
              className="form-input"
              style={{ width: '100%', height: '40px', borderRadius: '10px' }}
              placeholder="Enlace al PDF firmado por el cliente..."
              value={acceptanceActUrl}
              onChange={(e) => setAcceptanceActUrl(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              NOTAS Y ACUERDOS DE TRANSFERENCIA
            </label>
            <textarea
              className="form-input"
              style={{ width: '100%', minHeight: '70px', borderRadius: '10px', fontSize: '0.85rem' }}
              placeholder="Observaciones de entrega a operaciones..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="btn btn-secondary"
              style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem' }}
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Cierre por Excepción para Administradores */}
      {showOverrideModal && (
        <div className="modal-overlay" style={{ zIndex: 11000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%', borderRadius: '20px', background: 'white', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '12px' }}>
                <Unlock size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Autorización de Cierre por Excepción
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Solo para perfil Administrador
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
              El checklist de Sustain aún tiene requisitos incompletos ({completedCount} de {checklistItems.length}). Si autorizas el cierre forzado, quedará registrado tu nombre y la justificación formal.
            </p>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
                JUSTIFICACIÓN DEL ADMINISTRADOR (OBLIGATORIA)
              </label>
              <textarea
                className="form-input"
                style={{ width: '100%', minHeight: '80px', borderRadius: '10px', fontSize: '0.85rem' }}
                placeholder="Motivo por el cual se exime la entrega de los documentos faltantes..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAdminOverride}
                disabled={saving}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {saving ? 'Autorizando...' : 'Autorizar Cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
