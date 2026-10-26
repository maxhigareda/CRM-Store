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
  Loader2,
  LayoutGrid,
  List,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import GanttChart from '../../components/Gantt/GanttChart';
import { useNotification } from '../../contexts/NotificationContext';
import CreateProjectCommercialModal from '../../components/Modals/CreateProjectCommercialModal';

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
  priority?: string;
}

const PHASE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

interface ProjectColumnConfig {
  id: string;
  label: string;
  visible: boolean;
}

const DEFAULT_PROJECT_COLUMNS: ProjectColumnConfig[] = [
  { id: 'name', label: 'Nombre', visible: true },
  { id: 'actions', label: 'Acciones', visible: true },
  { id: 'client', label: 'Cliente', visible: true },
  { id: 'proposal', label: 'Propuesta', visible: true },
  { id: 'status', label: 'Estado', visible: true },
  { id: 'priority', label: 'Prioridad', visible: true },
  { id: 'duration', label: 'Semanas', visible: true },
  { id: 'kickoff', label: 'Kick off', visible: true },
  { id: 'end', label: 'Finalización', visible: true },
];

export default function Projects() {
  const { showNotification } = useNotification();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCommercialModal, setShowCommercialModal] = useState(false);
  const [editingCommercialProject, setEditingCommercialProject] = useState<any | null>(null);
  const [showPhaseEditor, setShowPhaseEditor] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Columnas personalizables y reordenables
  const [tableColumns, setTableColumns] = useState<ProjectColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem('project_table_columns_config');
      if (saved) {
        const parsed: ProjectColumnConfig[] = JSON.parse(saved);
        // Asegurar que todas las columnas por defecto existen
        const ids = new Set(parsed.map(p => p.id));
        const missing = DEFAULT_PROJECT_COLUMNS.filter(d => !ids.has(d.id));
        return [...parsed, ...missing];
      }
    } catch (e) {
      console.warn('Error reading columns config:', e);
    }
    return DEFAULT_PROJECT_COLUMNS;
  });
  const [showColumnsModal, setShowColumnsModal] = useState(false);

  const saveColumnsConfig = (newCols: ProjectColumnConfig[]) => {
    setTableColumns(newCols);
    try {
      localStorage.setItem('project_table_columns_config', JSON.stringify(newCols));
    } catch (e) {
      console.warn(e);
    }
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tableColumns.length) return;
    const updated = [...tableColumns];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    saveColumnsConfig(updated);
  };

  const handleToggleColumn = (id: string) => {
    const updated = tableColumns.map(col => col.id === id ? { ...col, visible: !col.visible } : col);
    saveColumnsConfig(updated);
  };

  const handleResetColumns = () => {
    saveColumnsConfig(DEFAULT_PROJECT_COLUMNS);
    showNotification('info', 'Columnas restablecidas al orden predeterminado');
  };

  // Helper para verificar configuración inicial incompleta
  const isProjectIncomplete = (p: any) => {
    return !p.proposal_url || !p.quoted_budget || Number(p.quoted_budget) <= 0;
  };

  const handleEditCommercial = (project: any) => {
    setEditingCommercialProject(project);
    setShowCommercialModal(true);
  };
  
  // Form State
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState('todo');
  const [durationWeeks, setDurationWeeks] = useState(1);
  const [endDate, setEndDate] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [priority, setPriority] = useState('medium');
  const [clientContactName, setClientContactName] = useState('');
  const [phases, setPhases] = useState<Phase[]>([]);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Quick Inline Tag State
  const [newInlineTag, setNewInlineTag] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      const fetchPromise = Promise.all([
        supabase.from('projects').select('*, clients(name, reference_name)').order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
        supabase.from('tags').select('*').eq('type', 'project').order('name')
      ]);

      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error("La base de datos está tardando en responder (Timeout)")), 30000)
      );

      const [projRes, clientsRes, tagsRes] = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (projRes?.error) throw projRes.error;
      if (clientsRes?.error) throw clientsRes.error;
      if (tagsRes?.error) throw tagsRes.error;
        
      if (projRes?.data) setProjects(projRes.data);
      if (clientsRes?.data) setClients(clientsRes.data);
      if (tagsRes?.data) setAllTags(tagsRes.data);
    } catch (err: any) {
      console.error("Error en fetchData (Projects):", err);
      setError(err.message || "Error al cargar datos");
      showNotification('error', 'Error al cargar datos de proyectos: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
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
       setPriority(project.priority || 'medium');
       
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
       setPriority('medium');
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
      client_contact_name: clientContactName || null,
      priority
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

  const handleCreateInlineTag = async (tagName?: string) => {
    const nameToUse = (tagName || newInlineTag).trim();
    if (!nameToUse) return;
    try {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const { data, error } = await supabase.from('tags').insert([
        { name: nameToUse, color: randomColor, type: 'project' }
      ]).select().single();

      if (error) throw error;
      if (data) {
        setAllTags(prev => [...prev, data]);
        setSelectedTags(prev => [...prev, data.id]);
        setNewInlineTag('');
        setIsCreatingTag(false);
        showNotification('success', `Etiqueta #${data.name} creada y seleccionada`);
      }
    } catch (err: any) {
      showNotification('error', 'Error al crear etiqueta: ' + err.message);
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
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            Alta Rápida
          </button>
          <button className="btn btn-primary" onClick={() => setShowCommercialModal(true)} style={{ background: '#7c3aed', borderColor: '#6d28d9' }}>
            <Briefcase size={16} />
            Alta Comercial & PO
          </button>
        </div>
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

          {/* Selector de Vistas: Tabla vs Tarjetas y Botón de Columnas */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px', marginLeft: '6px' }}>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: viewMode === 'table' ? 'white' : 'transparent',
                color: viewMode === 'table' ? 'var(--primary-color)' : '#64748b',
                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
              title="Vista de Tabla"
            >
              <List size={15} /> Tabla
            </button>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: viewMode === 'cards' ? 'white' : 'transparent',
                color: viewMode === 'cards' ? 'var(--primary-color)' : '#64748b',
                boxShadow: viewMode === 'cards' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
              title="Vista de Tarjetas"
            >
              <LayoutGrid size={15} /> Tarjetas
            </button>
          </div>

          {/* Botón Personalizar Columnas */}
          <button
            onClick={() => setShowColumnsModal(true)}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', background: 'white' }}
            title="Personalizar orden y visibilidad de columnas"
          >
            <Settings2 size={15} /> Columnas
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {tableColumns.filter(c => c.visible).map(col => (
                  <th key={col.id} style={{ textAlign: col.id === 'actions' || col.id === 'proposal' || col.id === 'duration' ? 'center' : 'left' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColumns.filter(c => c.visible).length || 9} style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Cargando proyectos...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={tableColumns.filter(c => c.visible).length || 9} style={{ padding: '32px', textAlign: 'center' }}>
                    <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '12px' }}>
                      ⚠️ {error}
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => fetchData()}
                      style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      Reintentar
                    </button>
                  </td>
                </tr>
              ) : filteredProjects.length === 0 ? (
                <tr><td colSpan={tableColumns.filter(c => c.visible).length || 9} style={{ textAlign: 'center' }}>No se encontraron proyectos.</td></tr>
              ) : filteredProjects.map(p => {
                const projectTags = allTags.filter(t => (p.tag_ids || []).includes(t.id));
                const statusInfo = getStatusDisplay(p);
                const incomplete = isProjectIncomplete(p);
                const visibleCols = tableColumns.filter(c => c.visible);

                return (
                  <tr key={p.id}>
                    {visibleCols.map(col => {
                      if (col.id === 'name') {
                        return (
                          <td key={col.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <Link to={`/board/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ fontWeight: 700, color: '#4f46e5' }}>{p.name}</div>
                              </Link>
                              {incomplete && (
                                <span 
                                  onClick={(e) => { e.preventDefault(); handleEditCommercial(p); }}
                                  title="Configuración inicial incompleta: falta link de cotización o presupuesto. Haz clic para completar."
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#fff1f2',
                                    color: '#e11d48',
                                    border: '1px solid #fecdd3',
                                    borderRadius: '6px',
                                    padding: '2px 7px',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <AlertTriangle size={11} /> Incompleto
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {projectTags.map((tag) => (
                                <span key={tag.id} className="status-chip" style={{ backgroundColor: `${tag.color}15`, color: tag.color, padding: '2px 8px', fontSize: '10px' }}>
                                  #{tag.name}
                                </span>
                              ))}
                            </div>
                          </td>
                        );
                      }
                      if (col.id === 'actions') {
                        return (
                          <td key={col.id} style={{ textAlign: 'center' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 8px', borderRadius: '8px', background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }} 
                              onClick={() => handleEditCommercial(p)} 
                              title="Editar Configuración Inicial y Comercial (Cotización, Presupuesto, etc.)"
                            >
                              <Edit2 size={14} />
                            </button>
                          </td>
                        );
                      }
                      if (col.id === 'client') {
                        return <td key={col.id}>{p.clients?.reference_name || p.clients?.name || 'Sin asignar'}</td>;
                      }
                      if (col.id === 'proposal') {
                        return (
                          <td key={col.id} style={{ textAlign: 'center' }}>
                            {p.proposal_url ? (
                              <a href={p.proposal_url} target="_blank" rel="noopener noreferrer" title="Ver Propuesta" style={{ color: 'var(--primary-color)' }}>
                                <FileText size={18} />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEditCommercial(p)}
                                style={{ border: 'none', background: '#fff1f2', color: '#e11d48', fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                                title="Agregar cotización / propuesta"
                              >
                                + Cotización
                              </button>
                            )}
                          </td>
                        );
                      }
                      if (col.id === 'status') {
                        return (
                          <td key={col.id}>
                            <span className={`status-chip ${statusInfo.class}`}>
                              {statusInfo.label}
                            </span>
                          </td>
                        );
                      }
                      if (col.id === 'priority') {
                        return (
                          <td key={col.id}>
                            <span className="status-chip" style={{ 
                              backgroundColor: p.priority === 'urgent' ? '#fee2e2' : p.priority === 'high' ? '#ffedd5' : p.priority === 'low' ? '#dcfce7' : '#f1f5f9',
                              color: p.priority === 'urgent' ? '#991b1b' : p.priority === 'high' ? '#c2410c' : p.priority === 'low' ? '#166534' : '#475569'
                            }}>
                              {p.priority === 'urgent' ? '🔴 Urgente' : p.priority === 'high' ? '🟠 Alta' : p.priority === 'low' ? '🟢 Baja' : '🟡 Media'}
                            </span>
                          </td>
                        );
                      }
                      if (col.id === 'duration') {
                        return <td key={col.id} style={{ textAlign: 'center', fontWeight: 700 }}>{p.duration_weeks} sem</td>;
                      }
                      if (col.id === 'kickoff') {
                        return <td key={col.id}>{p.delivery_date ? new Date(p.delivery_date + 'T12:00:00').toLocaleDateString() : '-'}</td>;
                      }
                      if (col.id === 'end') {
                        return <td key={col.id} style={{ fontWeight: 600 }}>{p.end_date ? new Date(p.end_date + 'T12:00:00').toLocaleDateString() : '-'}</td>;
                      }
                      return <td key={col.id}>-</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Vista de Tarjetas / Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {loading ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 12px' }} />
              Cargando tarjetas de proyectos...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', background: 'white', padding: '40px', borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
              No se encontraron proyectos activos.
            </div>
          ) : (
            filteredProjects.map(p => {
              const projectTags = allTags.filter(t => (p.tag_ids || []).includes(t.id));
              const statusInfo = getStatusDisplay(p);
              const incomplete = isProjectIncomplete(p);

              return (
                <div 
                  key={p.id}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  <div>
                    {/* Header de la Tarjeta: Cliente + Alerta Incompleto + Botón Editar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {p.clients?.reference_name || p.clients?.name || 'Sin asignar'}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {incomplete && (
                          <span 
                            onClick={() => handleEditCommercial(p)}
                            title="Configuración inicial incompleta. Clic para editar."
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#fff1f2',
                              color: '#e11d48',
                              border: '1px solid #fecdd3',
                              borderRadius: '6px',
                              padding: '2px 6px',
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            <AlertTriangle size={10} /> Incompleto
                          </span>
                        )}
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 8px', borderRadius: '6px', background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }} 
                          onClick={() => handleEditCommercial(p)} 
                          title="Editar Configuración Inicial y Comercial"
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Nombre del Proyecto */}
                    <Link to={`/board/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.3 }}>
                        {p.name}
                      </h3>
                    </Link>

                    {/* Tags */}
                    {projectTags.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        {projectTags.map(tag => (
                          <span key={tag.id} style={{ backgroundColor: `${tag.color}15`, color: tag.color, padding: '2px 8px', fontSize: '10px', fontWeight: 700, borderRadius: '6px' }}>
                            #{tag.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Badges de Estado y Prioridad */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                      <span className={`status-chip ${statusInfo.class}`} style={{ margin: 0 }}>
                        {statusInfo.label}
                      </span>
                      <span className="status-chip" style={{ 
                        margin: 0,
                        backgroundColor: p.priority === 'urgent' ? '#fee2e2' : p.priority === 'high' ? '#ffedd5' : p.priority === 'low' ? '#dcfce7' : '#f1f5f9',
                        color: p.priority === 'urgent' ? '#991b1b' : p.priority === 'high' ? '#c2410c' : p.priority === 'low' ? '#166534' : '#475569'
                      }}>
                        {p.priority === 'urgent' ? '🔴 Urgente' : p.priority === 'high' ? '🟠 Alta' : p.priority === 'low' ? '🟢 Baja' : '🟡 Media'}
                      </span>
                    </div>

                    {/* Datos de Fechas y Semanas */}
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Duración:</span>
                        <strong>{p.duration_weeks} semanas</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Kick Off:</span>
                        <span>{p.delivery_date ? new Date(p.delivery_date + 'T12:00:00').toLocaleDateString() : '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Finalización:</span>
                        <strong style={{ color: '#0f172a' }}>{p.end_date ? new Date(p.end_date + 'T12:00:00').toLocaleDateString() : '-'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                    <Link 
                      to={`/board/${p.id}`} 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}
                    >
                      Abrir Tablero <ArrowRight size={14} />
                    </Link>
                    {p.proposal_url && (
                      <a 
                        href={p.proposal_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="btn btn-secondary" 
                        style={{ padding: '8px 12px', borderRadius: '8px' }}
                        title="Ver Propuesta"
                      >
                        <FileText size={15} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

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

                    <div className="form-group" style={{ marginBottom: '24px' }}>
                      <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>PRIORIDAD</label>
                      <select className="form-input" value={priority} onChange={e => setPriority(e.target.value)} style={{ padding: '12px', borderRadius: '14px', border: '2px solid #f1f5f9', fontWeight: 600 }}>
                        <option value="low">🟢 Baja</option>
                        <option value="medium">🟡 Media</option>
                        <option value="high">🟠 Alta</option>
                        <option value="urgent">🔴 Urgente</option>
                      </select>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em', margin: 0 }}>
                          ETIQUETAS (OPCIONAL)
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCreatingTag(!isCreatingTag)}
                          style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          {isCreatingTag ? '✕ Cancelar' : '+ Nueva etiqueta'}
                        </button>
                      </div>

                      {isCreatingTag && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ height: '36px', borderRadius: '8px', fontSize: '0.8rem', flex: 1, padding: '0 10px' }}
                            placeholder="Nombre de la etiqueta..."
                            value={newInlineTag}
                            onChange={e => setNewInlineTag(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateInlineTag(); } }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleCreateInlineTag()}
                            className="btn btn-primary"
                            style={{ padding: '0 14px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700 }}
                          >
                            Crear
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {allTags.length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
                              Aún no tienes etiquetas creadas. Puedes usar una sugerida o crear una nueva:
                            </p>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {['Desarrollo', 'Consultoría', 'Soporte', 'Estratégico'].map(sugg => (
                                <button
                                  key={sugg}
                                  type="button"
                                  onClick={() => handleCreateInlineTag(sugg)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '10px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    background: '#eff6ff',
                                    border: '1px dashed #3b82f6',
                                    color: '#2563eb',
                                    cursor: 'pointer'
                                  }}
                                >
                                  + #{sugg}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          allTags.map(tag => (
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
                          ))
                        )}
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

      {/* Modal de Personalización de Columnas */}
      {showColumnsModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '480px', borderRadius: '20px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '10px', borderRadius: '12px' }}>
                  <Settings2 size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Personalizar Columnas</h3>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Reordena y activa/desactiva columnas de la tabla</div>
                </div>
              </div>
              <button 
                type="button" 
                className="modal-close" 
                onClick={() => setShowColumnsModal(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '10px', padding: '8px', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
              {tableColumns.map((col, idx) => (
                <div 
                  key={col.id} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: col.visible ? '#f8fafc' : '#f1f5f9',
                    borderRadius: '12px',
                    border: `1px solid ${col.visible ? '#e2e8f0' : '#cbd5e1'}`,
                    opacity: col.visible ? 1 : 0.6
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>
                    <input 
                      type="checkbox" 
                      checked={col.visible} 
                      onChange={() => handleToggleColumn(col.id)} 
                      style={{ width: '16px', height: '16px', accentColor: '#7c3aed', cursor: 'pointer' }}
                    />
                    <span>{col.label}</span>
                  </label>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, 'up')}
                      style={{
                        background: idx === 0 ? 'transparent' : 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '4px 6px',
                        cursor: idx === 0 ? 'not-allowed' : 'pointer',
                        color: idx === 0 ? '#cbd5e1' : '#475569'
                      }}
                      title="Mover arriba"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={idx === tableColumns.length - 1}
                      onClick={() => handleMoveColumn(idx, 'down')}
                      style={{
                        background: idx === tableColumns.length - 1 ? 'transparent' : 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '4px 6px',
                        cursor: idx === tableColumns.length - 1 ? 'not-allowed' : 'pointer',
                        color: idx === tableColumns.length - 1 ? '#cbd5e1' : '#475569'
                      }}
                      title="Mover abajo"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetColumns}
                style={{ fontSize: '0.8rem', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} /> Predeterminado
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowColumnsModal(false)}
                style={{ padding: '8px 20px', borderRadius: '10px', background: '#7c3aed', borderColor: '#6d28d9' }}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alta y Edición Comercial con PO y Margen Automático */}
      <CreateProjectCommercialModal
        isOpen={showCommercialModal}
        editingProject={editingCommercialProject}
        onClose={() => {
          setShowCommercialModal(false);
          setEditingCommercialProject(null);
        }}
        onProjectCreated={(updatedProject) => {
          setProjects(prev => {
            const exists = prev.some(p => p.id === updatedProject.id);
            if (exists) {
              return prev.map(p => p.id === updatedProject.id ? { ...p, ...updatedProject } : p);
            }
            return [updatedProject, ...prev];
          });
        }}
      />
    </div>
  );
}
