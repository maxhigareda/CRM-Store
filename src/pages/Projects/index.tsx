import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Edit2, 
  Filter, 
  X, 
  ExternalLink, 
  FileText, 
  UploadCloud, 
  Calendar, 
  Trash2, 
  Paperclip, 
  Info,
  CalendarDays,
  Settings2,
  Briefcase,
  Loader2
} from 'lucide-react';
import GanttChart from '../../components/Gantt/GanttChart';
import { useNotification } from '../../contexts/NotificationContext';

interface Phase {
  id?: string;
  name: string;
  duration_weeks: number;
}

interface Project {
  id: string;
  name: string;
  client_id: string;
  clients?: { name: string; reference_name?: string };
  tag_ids: string[];
  delivery_date: string;
  status: string;
  duration_weeks: number;
  end_date: string;
  proposal_url?: string;
  client_contact_name?: string;
}

const PHASE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

export default function Projects() {
  const { showNotification } = useNotification();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPhaseEditor, setShowPhaseEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState('todo');
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [endDate, setEndDate] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [clientContactName, setClientContactName] = useState('');
  const [phases, setPhases] = useState<Phase[]>([]);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClient, setFilterClient] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-calculate end date
  useEffect(() => {
    if (deliveryDate && !isNaN(durationWeeks) && durationWeeks > 0) {
      const start = new Date(deliveryDate + 'T12:00:00');
      const end = new Date(start.getTime() + (durationWeeks * 7 * 24 * 60 * 60 * 1000));
      setEndDate(end.toISOString().split('T')[0]);
    }
  }, [deliveryDate, durationWeeks]);

  const fetchData = async () => {
    const [projRes, clientsRes, tagsRes] = await Promise.all([
      supabase.from('projects').select('*, clients(name, reference_name)').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
      supabase.from('tags').select('*').eq('type', 'project').order('name')
    ]);
      
    if (projRes.data) setProjects(projRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    if (tagsRes.data) setAllTags(tagsRes.data);
    
    setLoading(false);
  };

  const handleOpenModal = async (project?: Project) => {
    if (project) {
      setEditingId(project.id);
      setName(project.name);
      setClientId(project.client_id);
      setSelectedTags(project.tag_ids || []);
      setDeliveryDate(project.delivery_date || '');
      setStatus(project.status || 'todo');
      setDurationWeeks(project.duration_weeks || 1);
      setEndDate(project.end_date || '');
      setProposalUrl(project.proposal_url || '');
      setClientContactName(project.client_contact_name || '');
      
      const { data: phasesData } = await supabase
        .from('project_phases')
        .select('*')
        .eq('project_id', project.id)
        .order('order_index');
      setPhases(phasesData || []);
    } else {
      setEditingId(null);
      setName('');
      setClientId('');
      setSelectedTags([]);
      setDeliveryDate('');
      setStatus('todo');
      setDurationWeeks(1);
      setEndDate('');
      setProposalUrl('');
      setClientContactName('');
      setPhases([]);
    }
    setShowPhaseEditor(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Validación de campos obligatorios
    const selectedClient = clients.find(c => c.id === clientId);
    const clientNameStr = (selectedClient?.reference_name || selectedClient?.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const isHazu = clientNameStr.includes('hazu') || clientNameStr.includes('interno');

    if (!name.trim()) {
      showNotification('error', 'El nombre del proyecto es obligatorio');
      return;
    }

    if (!isHazu) {
      if (!clientId) {
        showNotification('error', 'Debes seleccionar un cliente para proyectos externos');
        return;
      }
      if (!deliveryDate) {
        showNotification('error', 'La fecha de Kick-off es obligatoria para proyectos externos');
        return;
      }
      if (!durationWeeks || durationWeeks <= 0) {
        showNotification('error', 'La duración debe ser al menos de 1 semana');
        return;
      }
      if (selectedTags.length === 0) {
        showNotification('error', 'Debes asignar al menos una etiqueta al proyecto');
        return;
      }
    }

    const projectData = {
      name,
      client_id: clientId || null,
      tag_ids: selectedTags,
      delivery_date: deliveryDate || null,
      status,
      duration_weeks: durationWeeks,
      end_date: endDate || null,
      proposal_url: proposalUrl || null,
      client_contact_name: clientContactName || null
    };

    let savedProjectId = editingId;

    try {
      if (editingId) {
        const { data, error } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', editingId)
          .select('*, clients(name, reference_name)');

        if (error) throw error;
        if (data) {
          setProjects(projects.map(p => p.id === editingId ? data[0] : p));
          showNotification('success', 'Proyecto actualizado correctamente');
        }
      } else {
        const { data, error } = await supabase
          .from('projects')
          .insert([projectData])
          .select('*, clients(name, reference_name)');
          
        if (error) throw error;
        if (data) {
          savedProjectId = data[0].id;
          setProjects([data[0], ...projects]);
          showNotification('success', 'Proyecto creado correctamente');
        }
      }

      if (savedProjectId) {
        await supabase.from('project_phases').delete().eq('project_id', savedProjectId);
        if (phases.length > 0) {
          const phasesToInsert = phases.map((p, index) => ({
            project_id: savedProjectId,
            name: p.name,
            duration_weeks: p.duration_weeks,
            order_index: index
          }));
          await supabase.from('project_phases').insert(phasesToInsert);
        }
      }
      setShowModal(false);
    } catch (err: any) {
      showNotification('error', 'Error al guardar el proyecto: ' + err.message);
    }
  };

  const addPhase = () => {
    setPhases([...phases, { name: '', duration_weeks: 1 }]);
  };

  const updatePhase = (index: number, field: keyof Phase, value: any) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
  };

  const removePhase = (index: number) => {
    setPhases(phases.filter((_, i) => i !== index));
  };

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter(id => id !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingProposal(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('https://n8n.myinfo.la/webhook/propuestas', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error al conectar con n8n');
      
      const data = await response.json();
      if (data && data.url) {
        setProposalUrl(data.url);
        showNotification('success', 'Propuesta subida correctamente');
      } else {
        throw new Error('No se recibió la URL esperada');
      }
    } catch (error: any) {
      showNotification('error', 'Error al subir propuesta: ' + error.message);
    } finally {
      setUploadingProposal(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusDisplay = (p: Project) => {
    if (p.status === 'Finalizado' || p.status === 'Terminado') return { label: 'Finalizado', class: 'status-project-done' };
    if (p.status === 'Validado') return { label: 'Validado', class: 'status-project-approved' };
    if (p.status === 'Stand by') return { label: 'Stand by', class: 'status-project-pending' };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = p.end_date ? new Date(p.end_date) : null;

    if (end && today > end) {
      return { label: 'Retraso', class: 'status-project-delayed' };
    }
    
    if (p.status === 'todo' || p.status === 'Pendiente') return { label: 'Pendiente', class: 'status-project-pending' };
    
    return { label: 'A tiempo', class: 'status-project-ontime' };
  };

  const filteredProjects = projects.filter(p => {
    const statusInfo = getStatusDisplay(p);
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         p.clients?.reference_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = true;
    if (filterStatus) {
      if (filterStatus === 'todo') matchesStatus = statusInfo.label === 'Pendiente';
      else if (filterStatus === 'in_progress') matchesStatus = statusInfo.label === 'A tiempo';
      else if (filterStatus === 'delayed') matchesStatus = statusInfo.label === 'Retraso';
      else matchesStatus = p.status === filterStatus;
    }

    const matchesClient = filterClient ? p.client_id === filterClient : true;
    return matchesSearch && matchesStatus && matchesClient;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Proyectos Activos</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={16} />
          Agregar Proyecto
        </button>
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: 'white', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o cliente..." 
            className="form-input"
            style={{ paddingLeft: '36px', marginBottom: 0 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Filter size={18} color="var(--text-muted)" />
          <select className="form-input" style={{ width: '180px', marginBottom: 0 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="todo">Pendiente</option>
            <option value="in_progress">A tiempo</option>
            <option value="delayed">Retraso</option>
            <option value="Finalizado">Finalizado</option>
            <option value="Validado">Validado</option>
            <option value="Stand by">Stand by</option>
          </select>
          
          <select className="form-input" style={{ width: '180px', marginBottom: 0 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
            <option value="">Todos los clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.reference_name || c.name}</option>
            ))}
          </select>
          
          {(searchQuery || filterStatus || filterClient) && (
            <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setFilterStatus(''); setFilterClient(''); }} style={{ padding: '8px' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th style={{ textAlign: 'center' }}>Acciones</th>
              <th>Cliente</th>
              <th>Propuesta</th>
              <th>Estado</th>
              <th>Semanas</th>
              <th>Kick off</th>
              <th>Finalización</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>Cargando...</td></tr>
            ) : filteredProjects.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>No se encontraron proyectos.</td></tr>
            ) : filteredProjects.map(p => {
              const projectTags = allTags.filter(t => (p.tag_ids || []).includes(t.id));
              const statusInfo = getStatusDisplay(p);
              
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/board/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ fontWeight: 600, color: '#6366f1' }}>{p.name}</div>
                    </Link>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {projectTags.map((tag) => (
                        <span key={tag.id} className="status-chip" style={{ backgroundColor: `${tag.color}15`, color: tag.color, padding: '2px 8px', fontSize: '10px' }}>
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => handleOpenModal(p)} title="Editar Proyecto">
                      <Edit2 size={14} />
                    </button>
                  </td>
                  <td>{p.clients?.reference_name || p.clients?.name || 'Sin asignar'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {p.proposal_url ? (
                      <a href={p.proposal_url} target="_blank" rel="noopener noreferrer" title="Ver Propuesta" style={{ color: 'var(--primary-color)' }}>
                        <FileText size={18} />
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-chip ${statusInfo.class}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{p.duration_weeks}</td>
                  <td>{p.delivery_date ? new Date(p.delivery_date + 'T12:00:00').toLocaleDateString() : '-'}</td>
                  <td style={{ fontWeight: 500 }}>{p.end_date ? new Date(p.end_date + 'T12:00:00').toLocaleDateString() : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Main Project Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content wide">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ background: 'var(--primary-color)', color: 'white', padding: '12px', borderRadius: '16px' }}>
                  <Briefcase size={28} />
                </div>
                <div>
                  <h2 className="modal-title" style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
                    {editingId ? 'Gestión de Proyecto' : 'Configurar Proyecto'}
                  </h2>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Configura los tiempos, entregables y etapas</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button type="button" className="btn btn-secondary" style={{ padding: '12px 28px', borderRadius: '14px' }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="button" className="btn btn-primary" style={{ padding: '12px 40px', borderRadius: '14px', boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)' }} onClick={handleSubmit}>
                  {editingId ? 'Guardar Cambios' : 'Crear Proyecto'}
                </button>
                <div style={{ width: '1px', height: '32px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                <button type="button" className="modal-close" style={{ background: '#f1f5f9', padding: '8px', borderRadius: '12px', cursor: 'pointer' }} onClick={() => setShowModal(false)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ background: '#fcfdfe' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '32px', minHeight: '100%' }}>
                
                {/* Left Column: Essential Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                    <div className="card-title" style={{ color: '#1e293b', marginBottom: '24px' }}>
                      <div style={{ background: '#eff6ff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                        <Info size={16} style={{ color: '#3b82f6' }} />
                      </div>
                      <span style={{ fontSize: '0.9rem' }}>Detalles del Proyecto</span>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>NOMBRE DEL PROYECTO</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        placeholder="Nombre comercial..."
                        style={{ fontSize: '1.25rem', fontWeight: 700, padding: '14px 18px', borderRadius: '14px', border: '2px solid #f1f5f9', marginTop: '4px' }} 
                        required 
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>CLIENTE</label>
                      <select 
                        className="form-input" 
                        value={clientId} 
                        onChange={e => { setClientId(e.target.value); setClientContactName(''); }} 
                        style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                        required
                      >
                        <option value="">Seleccionar cliente...</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.reference_name || c.name}</option>
                        ))}
                      </select>
                    </div>

                    {clientId && (
                      <div className="form-group" style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>ENCARGADO (CONTACTO)</label>
                        <select 
                          className="form-input" 
                          value={clientContactName} 
                          onChange={e => setClientContactName(e.target.value)} 
                          style={{ padding: '14px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}
                        >
                          <option value="">Seleccionar encargado...</option>
                          {(() => {
                            const selectedClient = clients.find(c => c.id === clientId);
                            if (!selectedClient) return null;
                            const contacts = [
                              { name: selectedClient.name, email: selectedClient.email },
                              ...(selectedClient.contacts || [])
                            ];
                            return contacts.map((contact: any, idx: number) => (
                              <option key={idx} value={contact.name}>{contact.name} {contact.email ? `(${contact.email})` : ''}</option>
                            ));
                          })()}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>KICK OFF</label>
                        <input type="date" className="form-input" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={{ padding: '12px', borderRadius: '14px', border: '2px solid #f1f5f9' }} required={!clients.find(c => c.id === clientId)?.name?.toLowerCase().includes('hazu') && !clients.find(c => c.id === clientId)?.name?.toLowerCase().includes('hazú')} />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>SEMANAS</label>
                        <input 
                          type="number" 
                          min="1" 
                          className="form-input" 
                          value={durationWeeks} 
                          onChange={e => setDurationWeeks(parseInt(e.target.value) || 0)} 
                          style={{ padding: '12px', borderRadius: '14px', border: '2px solid #f1f5f9' }} 
                          required={!clients.find(c => c.id === clientId)?.name?.toLowerCase().includes('hazu') && !clients.find(c => c.id === clientId)?.name?.toLowerCase().includes('hazú')} 
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '24px' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>ESTADO</label>
                      <select className="form-input" value={status} onChange={e => setStatus(e.target.value)} style={{ padding: '12px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}>
                        <option value="todo">⚪ Pendiente</option>
                        <option value="Finalizado">🔵 Finalizado</option>
                        <option value="Validado">🟢 Validado</option>
                        <option value="Stand by">🟡 Stand by</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>ETIQUETAS</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {allTags.map(tag => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.id)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '12px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: selectedTags.includes(tag.id) ? `2px solid ${tag.color}` : '2px solid #f1f5f9',
                              backgroundColor: selectedTags.includes(tag.id) ? `${tag.color}15` : 'white',
                              color: selectedTags.includes(tag.id) ? tag.color : '#64748b',
                              transition: 'all 0.2s'
                            }}
                          >
                            #{tag.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-card" style={{ border: '2px solid #e2e8f0', background: 'white' }}>
                    <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ background: '#fff7ed', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' }}>
                          <Paperclip size={16} style={{ color: '#f97316' }} />
                        </div>
                        <span style={{ fontSize: '0.9rem' }}>Recursos Externos</span>
                      </div>
                      {proposalUrl && (
                        <button
                          type="button"
                          onClick={() => window.open(proposalUrl, '_blank')}
                          style={{
                            background: '#eff6ff',
                            border: 'none',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '6px',
                            borderRadius: '8px',
                            transition: 'all 0.2s'
                          }}
                          className="hover-scale"
                          title="Abrir Propuesta en nueva pestaña"
                        >
                          <ExternalLink size={16} />
                        </button>
                      )}
                    </div>
                    <div className="form-group">
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <FileText size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: '#94a3b8' }} />
                          <input 
                            type="url" 
                            placeholder="URL de Propuesta / Link..." 
                            className="form-input" 
                            style={{ paddingLeft: '42px', fontSize: '0.9rem', borderRadius: '12px' }}
                            value={proposalUrl} 
                            onChange={e => setProposalUrl(e.target.value)} 
                          />
                        </div>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          style={{ display: 'none' }} 
                          onChange={handleFileUpload} 
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                        />
                        <button 
                          type="button" 
                          className="btn btn-secondary" 
                          style={{ padding: '0 16px', background: '#f8fafc', borderRadius: '12px' }} 
                          title="Anexar Archivo"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingProposal}
                        >
                          {uploadingProposal ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Dynamic Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="form-card" style={{ flex: 1, border: '2px solid #e2e8f0', background: 'white', display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title" style={{ justifyContent: 'space-between', marginBottom: '32px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: '#f0fdf4', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CalendarDays size={20} style={{ color: '#16a34a' }} />
                        </div>
                        <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Planificación Temporal</span>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => setShowPhaseEditor(!showPhaseEditor)}
                        style={{ 
                          border: '2px solid var(--primary-color)', 
                          color: 'var(--primary-color)', 
                          fontWeight: 800,
                          borderRadius: '12px',
                          padding: '10px 20px'
                        }}
                      >
                        {showPhaseEditor ? <Calendar size={18} /> : <Settings2 size={18} />}
                        {showPhaseEditor ? 'Ver Cronograma' : 'Configurar Etapas'}
                      </button>
                    </div>

                    <div style={{ flex: 1, position: 'relative' }}>
                      {showPhaseEditor ? (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h4 style={{ fontWeight: 800, color: '#475569', fontSize: '0.9rem', letterSpacing: '0.02em' }}>EDICIÓN DE ETAPAS</h4>
                            <button type="button" className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '0.8rem', borderRadius: '10px' }} onClick={addPhase}>
                              <Plus size={16} /> Nueva Etapa
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {phases.map((phase, index) => (
                              <div key={index} style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '18px', background: '#f8fafc', borderRadius: '18px', border: '2px solid #f1f5f9', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: PHASE_COLORS[index % PHASE_COLORS.length] }}></div>
                                <input 
                                  type="text" 
                                  placeholder="Nombre de la etapa (ej: Diseño UI)..." 
                                  className="form-input" 
                                  style={{ flex: 3, marginBottom: 0, border: 'none', background: 'transparent', fontWeight: 700, fontSize: '1.1rem', color: '#1e293b' }}
                                  value={phase.name}
                                  onChange={e => updatePhase(index, 'name', e.target.value)}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '6px 16px', borderRadius: '12px', border: '2px solid #e2e8f0' }}>
                                  <input 
                                    type="number" 
                                    min="1" 
                                    className="form-input" 
                                    style={{ width: '60px', marginBottom: 0, border: 'none', textAlign: 'center', fontWeight: 800, fontSize: '1rem' }}
                                    value={phase.duration_weeks}
                                    onChange={e => updatePhase(index, 'duration_weeks', parseInt(e.target.value) || 0)}
                                  />
                                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 800 }}>W</span>
                                </div>
                                <button type="button" style={{ color: '#ef4444', padding: '10px', borderRadius: '10px', border: 'none', background: '#fee2e2', cursor: 'pointer' }} onClick={() => removePhase(index)}>
                                  <Trash2 size={20} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                          {deliveryDate ? (
                            <GanttChart 
                              kickOffDate={deliveryDate}
                              totalWeeks={durationWeeks}
                              phases={phases}
                            />
                          ) : (
                            <div style={{ padding: '100px 40px', textAlign: 'center', background: '#f8fafc', borderRadius: '24px', border: '3px dashed #e2e8f0' }}>
                              <Calendar size={64} style={{ color: '#cbd5e1', margin: '0 auto 20px' }} />
                              <h3 style={{ color: '#64748b', fontWeight: 700, fontSize: '1.25rem' }}>Cronograma no disponible</h3>
                              <p style={{ color: '#94a3b8', fontSize: '1rem', marginTop: '8px' }}>Por favor, establece una fecha de Kick Off para generar la línea de tiempo.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
