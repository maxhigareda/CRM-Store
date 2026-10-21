import { useState } from 'react';
import { 
  FileText,
  Folder, 
  ExternalLink, 
  Paperclip, 
  Plus, 
  Receipt, 
  Edit2, 
  Check, 
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import type { ProjectPO } from '../../types/projectControl';

interface ProjectDocumentsViewProps {
  projectId: string;
  project: any;
  pos: ProjectPO[];
  onDataUpdated?: () => void;
}

export default function ProjectDocumentsView({
  projectId,
  project,
  pos,
  onDataUpdated
}: ProjectDocumentsViewProps) {
  const { showNotification } = useNotification();
  const [editingDrive, setEditingDrive] = useState(false);
  const [driveUrl, setDriveUrl] = useState(project?.google_drive_folder_url || '');
  const [editingProposal, setEditingProposal] = useState(false);
  const [proposalUrl, setProposalUrl] = useState(project?.proposal_url || '');
  const [saving, setSaving] = useState(false);

  const handleSaveDriveUrl = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ google_drive_folder_url: driveUrl.trim() || null })
        .eq('id', projectId);

      if (error) throw error;
      showNotification('success', 'Enlace de Google Drive actualizado');
      setEditingDrive(false);
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProposalUrl = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ proposal_url: proposalUrl.trim() || null })
        .eq('id', projectId);

      if (error) throw error;
      showNotification('success', 'Enlace de propuesta comercial actualizado');
      setEditingProposal(false);
      if (onDataUpdated) onDataUpdated();
    } catch (err: any) {
      showNotification('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ background: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
          Documentación Centralizada del Proyecto
        </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
          Acceso rápido a carpetas compartidas, contratos, cotizaciones comerciales y órdenes de compra.
        </p>
      </div>

      {/* Grid of Main Documents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Card 1: Google Drive */}
        <div className="form-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Folder size={22} />
              </div>
              <button
                type="button"
                onClick={() => setEditingDrive(!editingDrive)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                title="Editar enlace"
              >
                <Edit2 size={16} />
              </button>
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Carpeta de Google Drive
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
              Repositorio de archivos, minutas, diagramas y entregables del cliente.
            </p>
          </div>

          <div style={{ marginTop: '16px' }}>
            {editingDrive ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  className="form-input"
                  style={{ flex: 1, height: '36px', borderRadius: '8px', fontSize: '0.8rem', padding: '0 10px' }}
                  placeholder="https://drive.google.com/..."
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveDriveUrl}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ padding: '0 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingDrive(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '0 8px', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : project?.google_drive_folder_url ? (
              <a
                href={project.google_drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', borderRadius: '10px', height: '38px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExternalLink size={15} /> Abrir Carpeta de Drive
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setEditingDrive(true)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', borderRadius: '10px', height: '38px', fontSize: '0.85rem', fontWeight: 700, border: '2px dashed #cbd5e1' }}
              >
                <Plus size={15} style={{ marginRight: '4px' }} /> Asociar Carpeta de Drive
              </button>
            )}
          </div>
        </div>

        {/* Card 2: Propuesta Comercial / Cotización */}
        <div className="form-card" style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={22} />
              </div>
              <button
                type="button"
                onClick={() => setEditingProposal(!editingProposal)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                title="Editar enlace"
              >
                <Edit2 size={16} />
              </button>
            </div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
              Propuesta Comercial Vendida
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
              PDF o documento con el alcance original cotizado y firmado por el cliente.
            </p>
          </div>

          <div style={{ marginTop: '16px' }}>
            {editingProposal ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="url"
                  className="form-input"
                  style={{ flex: 1, height: '36px', borderRadius: '8px', fontSize: '0.8rem', padding: '0 10px' }}
                  placeholder="https://..."
                  value={proposalUrl}
                  onChange={(e) => setProposalUrl(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleSaveProposalUrl}
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ padding: '0 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProposal(false)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '0 8px', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : project?.proposal_url ? (
              <a
                href={project.proposal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', borderRadius: '10px', height: '38px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc' }}
              >
                <ExternalLink size={15} /> Ver Propuesta Aceptada
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setEditingProposal(true)}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', borderRadius: '10px', height: '38px', fontSize: '0.85rem', fontWeight: 700, border: '2px dashed #cbd5e1' }}
              >
                <Plus size={15} style={{ marginRight: '4px' }} /> Adjuntar Enlace de Propuesta
              </button>
            )}
          </div>
        </div>
      </div>

      {/* POs Documents Section */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Receipt size={18} color="#059669" /> Órdenes de Compra (POs) del Proyecto
        </h3>

        {pos.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
            No hay Órdenes de Compra registradas. Puedes darlas de alta en la pestaña de Facturación o en Alta Comercial.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {pos.map((po) => (
              <div
                key={po.id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                    PO #{po.po_number}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 700, marginTop: '2px' }}>
                    ${Number(po.po_amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {po.currency}
                  </div>
                </div>

                {po.document_url ? (
                  <a
                    href={po.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: '#eff6ff', color: '#2563eb', padding: '6px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Paperclip size={13} /> Ver PDF
                  </a>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Sin archivo adjunto</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
