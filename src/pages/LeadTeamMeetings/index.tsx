import React, { useState, useEffect } from 'react';
import {
  Calendar, ClipboardList, CheckCircle2, AlertCircle, Trash2,
  Loader2, Plus, FileText, Sparkles, Settings, ArrowRight,
  ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmModal } from '../../components/Modals';

interface Meeting {
  id: string;
  title: string;
  date: string;
  transcript: string | null;
  summary: {
    decisiones?: string[];
    tareas?: ExtractedTask[];
  } | null;
  created_at: string;
}

interface ExtractedTask {
  title: string;
  description: string;
  role: string; // Puesto
  project_name: string | null;
  // Local states for UI editing before saving
  selectedProjectId?: string;
  selectedAssigneeId?: string;
  status?: 'pending' | 'saved' | 'error';
}

export default function LeadTeamMeetings() {
  const { showNotification } = useNotification();

  // ── States ──
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [collaborators, setCollaborators] = useState<{ id: string; full_name: string; email: string; area_id: string | null }[]>([]);
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals / Form
  const [showFormModal, setShowFormModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('crm_gemini_api_key') || '');

  // Active / Selected Meeting Details
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load Initial Data
  useEffect(() => {
    fetchMeetings();
    fetchMetadata();
  }, []);

  const fetchMeetings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('lead_team_meetings')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      showNotification('error', 'Error al cargar reuniones: ' + error.message);
    } else {
      setMeetings(data || []);
      if (data && data.length > 0 && !selectedMeeting) {
        setSelectedMeeting(data[0]);
      }
    }
    setLoading(false);
  };

  const fetchMetadata = async () => {
    const [projRes, collRes, areaRes] = await Promise.all([
      supabase.from('projects').select('id, name'),
      supabase.from('profiles').select('id, full_name, email, area_id'),
      supabase.from('areas').select('id, name')
    ]);

    if (projRes.data) setProjects(projRes.data);
    if (collRes.data) setCollaborators(collRes.data);
    if (areaRes.data) setAreas(areaRes.data);
  };

  // Sync state when selected meeting changes
  useEffect(() => {
    if (selectedMeeting && selectedMeeting.summary && selectedMeeting.summary.tareas) {
      // Map extracted tasks with pre-selected projects and assignees based on metadata
      const mapped = (selectedMeeting.summary.tareas || []).map(task => {
        // Find project by name match
        const project = projects.find(p => 
          p.name.toLowerCase().includes((task.project_name || '').toLowerCase()) ||
          (task.project_name || '').toLowerCase().includes(p.name.toLowerCase())
        );
        
        // Find area matching the assigned role
        const area = areas.find(a => a.name.toLowerCase() === task.role.toLowerCase());
        
        // Pre-select collaborator from that area
        const assignee = collaborators.find(c => c.area_id === area?.id);

        return {
          ...task,
          selectedProjectId: project?.id || '',
          selectedAssigneeId: assignee?.id || '',
          status: task.status || 'pending' as const
        };
      });
      setExtractedTasks(mapped);
    } else {
      setExtractedTasks([]);
    }
    setShowTranscript(false);
  }, [selectedMeeting, projects, collaborators, areas]);

  const handleSaveConfig = () => {
    localStorage.setItem('crm_gemini_api_key', geminiKey);
    showNotification('success', 'Clave de Gemini guardada correctamente.');
    setShowConfigModal(false);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('lead_team_meetings')
      .insert({ title, date, transcript, summary: {} })
      .select()
      .single();

    setSaving(false);
    if (error) {
      showNotification('error', 'Error al guardar la reunión: ' + error.message);
      return;
    }

    showNotification('success', 'Reunión guardada correctamente.');
    setShowFormModal(false);
    setTitle('');
    setTranscript('');
    setMeetings(prev => [data, ...prev]);
    setSelectedMeeting(data);
  };

  const handleDeleteMeeting = async () => {
    if (!confirmDelete) return;
    setDeleting(true);

    const { error } = await supabase
      .from('lead_team_meetings')
      .delete()
      .eq('id', confirmDelete.id);

    setDeleting(false);
    if (error) {
      showNotification('error', 'Error al eliminar reunión: ' + error.message);
    } else {
      showNotification('success', 'Reunión eliminada correctamente.');
      setMeetings(prev => prev.filter(m => m.id !== confirmDelete.id));
      if (selectedMeeting?.id === confirmDelete.id) {
        setSelectedMeeting(null);
      }
      setConfirmDelete(null);
    }
  };

  // ── Gemini Integration ──
  const handleAnalyzeTranscript = async () => {
    if (!selectedMeeting || !selectedMeeting.transcript) return;
    const apiKey = localStorage.getItem('crm_gemini_api_key');
    if (!apiKey) {
      setShowConfigModal(true);
      return;
    }

    setAnalyzing(true);
    try {
      const projectListStr = projects.map(p => `"${p.name}"`).join(', ');
      const prompt = `Analiza la siguiente transcripción de una reunión de equipo ("Lead Team").
Identifica:
1. Decisiones principales tomadas (en forma de lista de strings).
2. Tareas acordadas. Para cada tarea, debes extraer:
   - Título de la tarea (corto, descriptivo).
   - Descripción detallada (qué se acordó).
   - Puesto responsable. Debe ser EXACTAMENTE uno de estos 7 puestos: "CEO", "Office Manager", "Development Manager", "BI Manager", "Business Manager", "PMP", "Low Code Manager".
   - Proyecto relacionado. Intenta deducir a cuál de estos proyectos reales se refiere la tarea (usa EXACTAMENTE uno de la lista: [${projectListStr}]). Si no se menciona o no corresponde a ningún proyecto de la lista, usa null.

Devuelve el resultado final en formato JSON estructurado, sin bloques de código markdown, sin \`\`\`json ni texto explicativo adicional. El formato JSON exacto debe ser:
{
  "decisiones": ["decisión 1", "decisión 2"],
  "tareas": [
    {
      "title": "título",
      "description": "descripción",
      "role": "puesto",
      "project_name": "nombre del proyecto o null"
    }
  ]
}

Aquí está la transcripción de la junta:
"${selectedMeeting.transcript}"`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        }
      );

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const errMsg = errBody?.error?.message || response.statusText || `Código de respuesta ${response.status}`;
        throw new Error(errMsg);
      }

      const resData = await response.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No se recibió análisis de Gemini');
      }

      // Parse JSON from Gemini
      const parsed = JSON.parse(text.trim());
      
      // Update Database
      const { error } = await supabase
        .from('lead_team_meetings')
        .update({ summary: parsed })
        .eq('id', selectedMeeting.id);

      if (error) throw error;

      // Update State
      const updatedMeeting = { ...selectedMeeting, summary: parsed };
      setSelectedMeeting(updatedMeeting);
      setMeetings(prev => prev.map(m => m.id === selectedMeeting.id ? updatedMeeting : m));
      showNotification('success', 'Transcripción analizada con éxito.');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al procesar la transcripción: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Sync to projects/tasks table ──
  const handleSyncTask = async (index: number) => {
    const task = extractedTasks[index];
    if (!task.selectedProjectId) {
      showNotification('info', 'Debes seleccionar un proyecto para sincronizar la tarea.');
      return;
    }

    // Update status to loading
    setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, status: 'saved' as const } : t));

    const payload = {
      project_id: task.selectedProjectId,
      title: task.title,
      description: `${task.description}\n\n[Asignado a: ${task.role} en Junta Lead Team]`,
      status: 'todo',
      priority: 'medium',
      assigned_to: task.selectedAssigneeId || null
    };

    const { error } = await supabase.from('tasks').insert(payload);

    if (error) {
      showNotification('error', `Error al crear tarea "${task.title}": ` + error.message);
      setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, status: 'error' as const } : t));
    } else {
      showNotification('success', `Tarea "${task.title}" agregada al proyecto.`);
      
      // Update persistent summary state in meeting
      if (selectedMeeting && selectedMeeting.summary) {
        const updatedTareas = [...(selectedMeeting.summary.tareas || [])];
        updatedTareas[index] = { ...updatedTareas[index], status: 'saved' };
        const updatedSummary = { ...selectedMeeting.summary, tareas: updatedTareas };
        
        await supabase
          .from('lead_team_meetings')
          .update({ summary: updatedSummary })
          .eq('id', selectedMeeting.id);

        setMeetings(prev => prev.map(m => m.id === selectedMeeting.id ? { ...m, summary: updatedSummary } : m));
      }
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <ClipboardList size={24} color="var(--primary-color)" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Juntas Lead Team</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Gestión, minutas y extracción de tareas de tus sesiones del equipo de liderazgo</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowConfigModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Settings size={16} />
            Configurar IA
          </button>
          <button
            onClick={() => setShowFormModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            Nueva Reunión
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left Side: Meetings List */}
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', fontSize: '0.9rem' }}>
            Historial de Sesiones ({meetings.length})
          </div>
          <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '32px 16px', display: 'flex', justifyContent: 'center' }}>
                <Loader2 className="animate-spin" size={24} color="#64748b" />
              </div>
            ) : meetings.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                No hay reuniones registradas.
              </div>
            ) : (
              meetings.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedMeeting(m)}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: selectedMeeting?.id === m.id ? '#f0f9ff' : 'transparent',
                    borderLeft: selectedMeeting?.id === m.id ? '4px solid var(--primary-color)' : '4px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem', marginBottom: '4px' }}>{m.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} />
                      {m.date}
                    </div>
                    {m.summary && m.summary.tareas && (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '999px', fontWeight: 600 }}>
                        Analizada
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Meeting Details & Action Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {selectedMeeting ? (
            <>
              {/* Summary / Header Info */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>{selectedMeeting.title}</h2>
                  <div style={{ display: 'flex', gap: '16px', color: '#64748b', fontSize: '0.85rem' }}>
                    <span>Fecha: <strong>{selectedMeeting.date}</strong></span>
                    <span>Creado: <strong>{new Date(selectedMeeting.created_at).toLocaleDateString('es-MX')}</strong></span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setConfirmDelete(selectedMeeting)}
                    className="btn btn-secondary"
                    style={{ border: '1px solid #fca5a5', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                  <button
                    onClick={handleAnalyzeTranscript}
                    disabled={analyzing || !selectedMeeting.transcript}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {selectedMeeting.summary && selectedMeeting.summary.tareas ? 'Re-analizar Minuta' : 'Analizar Minuta'}
                  </button>
                </div>
              </div>

              {/* Action Items Box */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tareas del Lead Team sugeridas</span>
                  {selectedMeeting.summary && selectedMeeting.summary.tareas && (
                    <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1e40af', padding: '4px 10px', borderRadius: '999px' }}>
                      {extractedTasks.length} Tareas encontradas
                    </span>
                  )}
                </div>

                <div style={{ padding: '20px' }}>
                  {!selectedMeeting.summary || !selectedMeeting.summary.tareas ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                      <AlertTriangle size={32} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#334155' }}>Esta reunión no ha sido analizada por Gemini</p>
                      <p style={{ margin: '4px 0 16px 0', fontSize: '0.85rem' }}>Haz clic en el botón de arriba para extraer automáticamente las decisiones y tareas de la transcripción.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {extractedTasks.map((task, index) => (
                        <div
                          key={index}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '16px',
                            background: '#f8fafc',
                            display: 'grid',
                            gridTemplateColumns: '1fr 300px',
                            gap: '16px',
                            alignItems: 'center'
                          }}
                        >
                          {/* Task Info */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{task.title}</span>
                              <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: '999px' }}>
                                {task.role}
                              </span>
                            </div>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.825rem', lineHeight: 1.4 }}>{task.description}</p>
                          </div>

                          {/* Database assignment fields */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Proyecto Asignado</label>
                              <select
                                value={task.selectedProjectId}
                                onChange={(e) => setExtractedTasks(prev => prev.map((t, i) => i === index ? { ...t, selectedProjectId: e.target.value } : t))}
                                style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }}
                                disabled={task.status === 'saved'}
                              >
                                <option value="">Selecciona proyecto...</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Responsable (Colaborador)</label>
                              <select
                                value={task.selectedAssigneeId}
                                onChange={(e) => setExtractedTasks(prev => prev.map((t, i) => i === index ? { ...t, selectedAssigneeId: e.target.value } : t))}
                                style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white' }}
                                disabled={task.status === 'saved'}
                              >
                                <option value="">Selecciona responsable...</option>
                                {collaborators.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.full_name} ({c.email})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <button
                              onClick={() => handleSyncTask(index)}
                              disabled={task.status === 'saved' || !task.selectedProjectId}
                              className={`btn ${task.status === 'saved' ? 'btn-secondary' : 'btn-primary'}`}
                              style={{
                                marginTop: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                padding: '6px 12px'
                              }}
                            >
                              {task.status === 'saved' ? (
                                <><CheckCircle2 size={14} color="#16a34a" /> Agregado</>
                              ) : (
                                <><ArrowRight size={14} /> Sincronizar Tarea</>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Decisions Box */}
              {selectedMeeting.summary && selectedMeeting.summary.decisiones && selectedMeeting.summary.decisiones.length > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', margin: '0 0 16px 0', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                    Acuerdos y Decisiones Clave
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedMeeting.summary.decisiones.map((dec, i) => (
                      <li key={i} style={{ color: '#475569', fontSize: '0.85rem', lineHeight: 1.4 }}>{dec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transcript Box */}
              {selectedMeeting.transcript && (
                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#334155',
                      fontSize: '0.9rem'
                    }}
                  >
                    <span>Ver transcripción original</span>
                    {showTranscript ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {showTranscript && (
                    <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <pre style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        fontSize: '0.825rem',
                        color: '#475569',
                        lineHeight: 1.5,
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {selectedMeeting.transcript}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '80px 20px', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              <FileText size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
              <h3 style={{ margin: 0, color: '#334155', fontWeight: 600 }}>Selecciona una junta</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>Elige una reunión del historial de la izquierda o carga una nueva minuta.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nueva Reunión */}
      {showFormModal && (
        <div className="modal-overlay" onClick={() => setShowFormModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">Registrar Nueva Reunión</h3>
              <button className="modal-close" onClick={() => setShowFormModal(false)}>×</button>
            </div>

            <form onSubmit={handleSaveMeeting} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Título de la Reunión</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Junta Directiva Lead Team 24 de Agosto"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Fecha</label>
                  <input
                    type="date"
                    className="form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label>Transcripción o Minuta Escrita</label>
                  <textarea
                    className="form-input"
                    rows={8}
                    placeholder="Pega aquí la transcripción de voz, notas tomadas o resumen escrito de la sesión de Google Meet / Calendar..."
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    style={{ flex: 1, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div className="modal-actions" style={{ padding: '20px 32px', borderTop: '1px solid #e2e8f0', background: '#fcfdfe' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowFormModal(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : 'Registrar y Continuar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Configuración Clave Gemini */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Configuración de Inteligencia Artificial</h3>
              <button className="modal-close" onClick={() => setShowConfigModal(false)}>×</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: '12px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309', lineHeight: 1.4 }}>
                  Para procesar la transcripción y extraer tareas requerimos una clave de la API de Google Gemini. Tu clave se almacena localmente y de forma segura en tu navegador.
                </p>
              </div>

              <div className="form-group">
                <label>Gemini API Key</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Puedes conseguir una clave gratuita en Google AI Studio.
                </span>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfigModal(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveConfig}>Guardar Clave</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación Borrado */}
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Eliminar junta"
        message={confirmDelete ? `¿Seguro que deseas eliminar la junta "${confirmDelete.title}" y todos sus análisis asociados? Esta acción no se puede deshacer.` : ''}
        confirmText={deleting ? 'Eliminando...' : 'Sí, eliminar'}
        isDestructive={true}
        onConfirm={handleDeleteMeeting}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
