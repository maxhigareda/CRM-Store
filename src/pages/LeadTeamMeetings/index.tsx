import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, CheckCircle2, AlertCircle, Trash2,
  Loader2, Plus, FileText, Sparkles, Settings,
  ChevronDown, ChevronUp, AlertTriangle, Users, 
  Layers, Check, HelpCircle, Network
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
  status?: 'pending' | 'saved' | 'error';
}

interface LeadTeamTask {
  id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  role: string;
  project_id: string | null;
  status: string; // 'En Cola' | 'En Curso' | 'Completada'
  model: string | null;
  due_time: string | null;
  created_at: string;
}

const ROLES = [
  'Office Manager',
  'Development Manager',
  'BI Manager',
  'Business Manager',
  'PMP',
  'Low Code Manager'
];

const ROLE_FOCUS: Record<string, string> = {
  'CEO': 'Capa de Mando - Visión estratégica y dirección ejecutiva global.',
  'Office Manager': 'Capa de Operación - Agenda, compras y recursos generales.',
  'Development Manager': 'Sistema de Desarrollo - Administración técnica, código y arquitectura.',
  'BI Manager': 'Capa de Datos - Reportería, analítica y tableros BI.',
  'Business Manager': 'Operación Comercial - Facturación, cuentas por cobrar/pagar y contratos.',
  'PMP': 'Gestión de Proyectos - Control de tiempos, metodologías y entregas.',
  'Low Code Manager': 'Soluciones Internas - Automatizaciones y herramientas ágiles.'
};

declare const google: any;

export default function LeadTeamMeetings() {
  const { showNotification } = useNotification();

  // ── States ──
  const [activeTab, setActiveTab] = useState<'equipo' | 'tareas' | 'boveda' | 'juntas'>('equipo');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leadTeamTasks, setLeadTeamTasks] = useState<LeadTeamTask[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Role Filter in Tareas Tab
  const [activeRoleFilter, setActiveRoleFilter] = useState<string>('TODOS');

  // Modals / Form
  const [showFormModal, setShowFormModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('crm_gemini_api_key') || '');
  const [geminiModel, setGeminiModel] = useState(localStorage.getItem('crm_gemini_model') || 'gemini-1.5-flash');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Google Drive Integration States
  const [googleClientId, setGoogleClientId] = useState(localStorage.getItem('crm_google_client_id') || '');
  const [googleFolderId, setGoogleFolderId] = useState(localStorage.getItem('crm_google_folder_id') || '1tq57ZYomJ2dCRAlT8KhumARk3-TDYTac');
  const [syncingDrive, setSyncingDrive] = useState(false);

  // Active / Selected Meeting Details (Pestaña Juntas)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Meeting | null>(null);

  // Calendar-based selection for Analítica de Juntas (limited to last 3 months: current month + 2 past months)
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  // Diagnostics State
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [runningDiag, setRunningDiag] = useState(false);

  // Bóveda de Conocimiento Selected Node Details
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: 'meeting' | 'decision' | 'task' | 'project';
    label: string;
    description?: string;
    metadata?: Record<string, any>;
  } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Load Initial Data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [meetingsRes, tasksRes, projectsRes] = await Promise.all([
        supabase.from('lead_team_meetings').select('*').order('date', { ascending: false }),
        supabase.from('lead_team_tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name')
      ]);

      if (meetingsRes.error) throw meetingsRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (projectsRes.error) throw projectsRes.error;

      setMeetings(meetingsRes.data || []);
      setLeadTeamTasks(tasksRes.data || []);
      setProjects(projectsRes.data || []);

      if (meetingsRes.data && meetingsRes.data.length > 0 && !selectedMeeting) {
        setSelectedMeeting(meetingsRes.data[0]);
      }
    } catch (err: any) {
      showNotification('error', 'Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sync state when selected meeting changes (Analítica tab)
  useEffect(() => {
    if (selectedMeeting && selectedMeeting.summary && selectedMeeting.summary.tareas) {
      const mapped = (selectedMeeting.summary.tareas || []).map(task => {
        // Find project by name match
        const project = projects.find(p => 
          p.name.toLowerCase().includes((task.project_name || '').toLowerCase()) ||
          (task.project_name || '').toLowerCase().includes(p.name.toLowerCase())
        );

        return {
          ...task,
          selectedProjectId: project?.id || '',
          status: task.status || 'pending' as const
        };
      });
      setExtractedTasks(mapped);
    } else {
      setExtractedTasks([]);
    }
    setShowTranscript(false);

    // Sync calendar month/day when a meeting is selected
    if (selectedMeeting && selectedMeeting.date) {
      const parts = selectedMeeting.date.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // 0-indexed
        const day = parseInt(parts[2], 10);
        
        setCurrentCalendarMonth(new Date(year, month, 1));
        setSelectedCalendarDay(day);
      }
    }
  }, [selectedMeeting, projects]);

  const fetchAvailableModels = async (key: string) => {
    if (!key) return;
    setLoadingModels(true);
    setModelLoadError(null);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const errMsg = errBody?.error?.message || response.statusText || `Código ${response.status}`;
        throw new Error(errMsg);
      }
      const data = await response.json();
      const list = (data.models || [])
        .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => m.name.replace('models/', ''));
      setAvailableModels(list);
      
      if (list.length > 0 && !list.includes(geminiModel)) {
        setGeminiModel(list[0]);
      }
    } catch (err: any) {
      console.error(err);
      setModelLoadError(err.message);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (showConfigModal && geminiKey) {
      fetchAvailableModels(geminiKey);
    }
  }, [showConfigModal]);

  const handleSaveConfig = () => {
    localStorage.setItem('crm_gemini_api_key', geminiKey);
    localStorage.setItem('crm_gemini_model', geminiModel);
    localStorage.setItem('crm_google_client_id', googleClientId);
    localStorage.setItem('crm_google_folder_id', googleFolderId);
    showNotification('success', 'Configuración guardada correctamente.');
    setShowConfigModal(false);
  };

  const handleSyncGoogleDrive = () => {
    if (!googleClientId) {
      showNotification('error', 'Por favor ingresa tu Google Client ID en la configuración (icono de engrane).');
      setShowConfigModal(true);
      return;
    }

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      showNotification('error', 'El servicio de Google Identity aún no se ha cargado. Reintenta en unos segundos.');
      return;
    }

    setSyncingDrive(true);

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: async (response: any) => {
        if (response.error) {
          showNotification('error', 'Error en autenticación de Google: ' + response.error);
          setSyncingDrive(false);
          return;
        }

        const accessToken = response.access_token;
        try {
          showNotification('info', 'Consultando carpeta de Google Drive...');

          // Query items inside the folder (with Shared Drives support)
          console.log('[Google Drive] Buscando en carpeta:', googleFolderId);
          const query = encodeURIComponent(`'${googleFolderId}' in parents and trashed = false`);
          const driveRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );

          if (!driveRes.ok) {
            const errData = await driveRes.json();
            console.error('[Google Drive] Error al listar carpeta:', errData);
            throw new Error(errData.error?.message || 'Error al listar archivos de Google Drive');
          }

          const driveData = await driveRes.json();
          const items = driveData.files || [];
          console.log('[Google Drive] Elementos encontrados en la carpeta:', items);

          if (items.length === 0) {
            showNotification('info', 'No se encontraron archivos en la carpeta de Google Drive configurada.');
            setSyncingDrive(false);
            return;
          }

          let syncedCount = 0;

          for (const item of items) {
            // If it's a subfolder (e.g. Meet_-_yhj-pgfn-ujd - 25-8-2026)
            if (item.mimeType === 'application/vnd.google-apps.folder') {
              const subQuery = encodeURIComponent(`'${item.id}' in parents and trashed = false`);
              const subRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${subQuery}&fields=files(id,name,mimeType)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );

              if (subRes.ok) {
                const subData = await subRes.json();
                const subFiles = subData.files || [];
                console.log(`[Google Drive] Archivos en subcarpeta "${item.name}":`, subFiles);

                // Look for Transcripcion or Minuta file
                const transFile = subFiles.find((f: any) => f.name.toLowerCase().includes('transcrip')) ||
                                  subFiles.find((f: any) => f.name.toLowerCase().includes('minuta')) ||
                                  subFiles.find((f: any) => f.name.endsWith('.md'));

                if (transFile) {
                  // Download content
                  const fileContentRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${transFile.id}?alt=media&supportsAllDrives=true`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                  );

                  if (fileContentRes.ok) {
                    const transcriptContent = await fileContentRes.text();
                    
                    // Parse date and title from item name or file name
                    const parseTarget = item.name + ' ' + transFile.name;
                    const clean = parseTarget.replace(/\.md$/i, '').replace(/\.txt$/i, '');
                    
                    // Date
                    const dateMatch = clean.match(/(\d{1,2})[-_./](\d{1,2})[-_./](\d{4})/);
                    let mDate = new Date().toISOString().slice(0, 10);
                    if (dateMatch) {
                      const d = dateMatch[1].padStart(2, '0');
                      const m = dateMatch[2].padStart(2, '0');
                      const y = dateMatch[3];
                      mDate = `${y}-${m}-${d}`;
                    }

                    // Title
                    const sessionMatch = clean.match(/Meet_-_([a-zA-Z0-9-]+)/i) || 
                                         clean.match(/Meet_-([a-zA-Z0-9-]+)/i) || 
                                         clean.match(/([a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4})/);
                    let mTitle = `Meet - ${item.name}`;
                    if (sessionMatch) {
                      mTitle = `Meet - ${sessionMatch[1]}`;
                    }

                    // Check if already in Supabase
                    const { data: existing } = await supabase
                      .from('lead_team_meetings')
                      .select('id')
                      .eq('title', mTitle)
                      .eq('date', mDate)
                      .limit(1);

                    if (!existing || existing.length === 0) {
                      const { error: insertErr } = await supabase
                        .from('lead_team_meetings')
                        .insert({
                          title: mTitle,
                          date: mDate,
                          transcript: transcriptContent,
                          summary: {}
                        });

                      if (!insertErr) {
                        syncedCount++;
                      }
                    }
                  }
                }
              }
            } else if (item.name.endsWith('.md') || item.name.endsWith('.txt')) {
              // Direct markdown file in root folder
              const fileContentRes = await fetch(
                `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );

              if (fileContentRes.ok) {
                const transcriptContent = await fileContentRes.text();
                const clean = item.name.replace(/\.md$/i, '').replace(/\.txt$/i, '');
                
                const dateMatch = clean.match(/(\d{1,2})[-_./](\d{1,2})[-_./](\d{4})/);
                let mDate = new Date().toISOString().slice(0, 10);
                if (dateMatch) {
                  const d = dateMatch[1].padStart(2, '0');
                  const m = dateMatch[2].padStart(2, '0');
                  const y = dateMatch[3];
                  mDate = `${y}-${m}-${d}`;
                }

                const sessionMatch = clean.match(/Meet_-_([a-zA-Z0-9-]+)/i) || 
                                     clean.match(/Meet_-([a-zA-Z0-9-]+)/i) || 
                                     clean.match(/([a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4})/);
                let mTitle = clean;
                if (sessionMatch) {
                  mTitle = `Meet - ${sessionMatch[1]}`;
                }

                const { data: existing } = await supabase
                  .from('lead_team_meetings')
                  .select('id')
                  .eq('title', mTitle)
                  .eq('date', mDate)
                  .limit(1);

                if (!existing || existing.length === 0) {
                  const { error: insertErr } = await supabase
                    .from('lead_team_meetings')
                    .insert({
                      title: mTitle,
                      date: mDate,
                      transcript: transcriptContent,
                      summary: {}
                    });

                  if (!insertErr) {
                    syncedCount++;
                  }
                }
              }
            }
          }

          showNotification('success', `¡Sincronización completada! ${syncedCount} nuevas reuniones importadas de Google Drive.`);
          await fetchInitialData();
        } catch (err: any) {
          showNotification('error', 'Error al sincronizar Google Drive: ' + err.message);
        } finally {
          setSyncingDrive(false);
        }
      }
    });

    tokenClient.requestAccessToken({ prompt: 'consent' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Helper to parse filename
    const clean = file.name.replace(/\.md$/i, '').replace(/\.txt$/i, '');
    
    // Extract date (dd-mm-yyyy or similar, allowing hyphens, underscores, dots, or slashes)
    const dateMatch = clean.match(/(\d{1,2})[-_./](\d{1,2})[-_./](\d{4})/);
    if (dateMatch) {
      const d = dateMatch[1].padStart(2, '0');
      const m = dateMatch[2].padStart(2, '0');
      const y = dateMatch[3];
      setDate(`${y}-${m}-${d}`);
    }

    // Extract session code (case-insensitive, allowing alphanumeric and dashes)
    const sessionMatch = clean.match(/Meet_-_([a-zA-Z0-9-]+)/i) || 
                         clean.match(/Meet_-([a-zA-Z0-9-]+)/i) || 
                         clean.match(/([a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4}-[a-zA-Z0-9]{3,4})/);
    if (sessionMatch) {
      setTitle(`Meet - ${sessionMatch[1]}`);
    } else {
      // Use clean filename as fallback title, removing prefixes
      const fallbackTitle = clean.replace(/^(Minuta|Transcripcion)_Meet_-?_/i, 'Meet - ');
      setTitle(fallbackTitle);
    }

    // Read content
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setTranscript(text);
        showNotification('success', `Archivo "${file.name}" cargado y campos autocompletados.`);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    setSaving(true);

    try {
      const { data, error } = await supabase
        .from('lead_team_meetings')
        .insert({ title, date, transcript, summary: {} })
        .select()
        .single();

      if (error) throw error;

      showNotification('success', 'Reunión guardada correctamente.');
      setShowFormModal(false);
      setTitle('');
      setTranscript('');
      setMeetings(prev => [data, ...prev]);
      setSelectedMeeting(data);
      setActiveTab('juntas');
    } catch (err: any) {
      showNotification('error', 'Error al guardar reunión: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const runDatabaseDiagnostics = async () => {
    setRunningDiag(true);
    setDiagResult(null);
    const logs: string[] = [];
    try {
      logs.push(`Iniciando diagnóstico en ${new Date().toLocaleString('es-MX')}...`);
      
      const { data: { session }, error: authErr } = await supabase.auth.getSession();
      if (authErr) {
        logs.push(`[ERROR AUTH] Al obtener sesión: ${authErr.message}`);
      } else {
        logs.push(`Sesión activa: ${session ? 'SÍ' : 'NO'}`);
        if (session) {
          logs.push(`Usuario: ${session.user.email} (ID: ${session.user.id}, Rol: ${session.user.role})`);
        }
      }

      logs.push('Consultando tabla "lead_team_meetings"...');
      const meetingsTest = await supabase.from('lead_team_meetings').select('id, title, date, created_at');
      if (meetingsTest.error) {
        logs.push(`[ERROR MEETING SELECT] ${meetingsTest.error.code} - ${meetingsTest.error.message}`);
      } else {
        logs.push(`[ÉXITO] Tabla "lead_team_meetings" consultada. Registros encontrados: ${meetingsTest.data.length}`);
        meetingsTest.data.forEach((m: any, idx: number) => {
          logs.push(`  ${idx + 1}. ID: ${m.id} | Título: "${m.title}" | Fecha: ${m.date} | Creada: ${m.created_at}`);
        });
      }

      logs.push('Consultando tabla "lead_team_tasks"...');
      const tasksTest = await supabase.from('lead_team_tasks').select('id, title, status');
      if (tasksTest.error) {
        logs.push(`[ERROR TASK SELECT] ${tasksTest.error.code} - ${tasksTest.error.message}`);
      } else {
        logs.push(`[ÉXITO] Tabla "lead_team_tasks" consultada. Registros encontrados: ${tasksTest.data.length}`);
      }

      logs.push('Consultando tabla general "projects"...');
      const projectsTest = await supabase.from('projects').select('id, name').limit(3);
      if (projectsTest.error) {
        logs.push(`[ERROR PROJECTS SELECT] ${projectsTest.error.code} - ${projectsTest.error.message}`);
      } else {
        logs.push(`[ÉXITO] Tabla "projects" consultada. Registros encontrados: ${projectsTest.data.length}`);
      }

    } catch (err: any) {
      logs.push(`[ERROR GENERAL] ${err.message}`);
    } finally {
      setDiagResult(logs.join('\n'));
      setRunningDiag(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('lead_team_meetings')
        .delete()
        .eq('id', confirmDelete.id);

      if (error) throw error;

      showNotification('success', 'Reunión eliminada correctamente.');
      setMeetings(prev => prev.filter(m => m.id !== confirmDelete.id));
      if (selectedMeeting?.id === confirmDelete.id) {
        setSelectedMeeting(null);
      }
      setConfirmDelete(null);
      // Refresh tasks in case CASCADE wasn't setup or we want to stay in sync
      const { data: updatedTasks } = await supabase.from('lead_team_tasks').select('*').order('created_at', { ascending: false });
      if (updatedTasks) setLeadTeamTasks(updatedTasks);
    } catch (err: any) {
      showNotification('error', 'Error al eliminar reunión: ' + err.message);
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
2. Tareas de alto nivel acordadas para los líderes. Para cada tarea, debes extraer:
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
        `https://generativelanguage.googleapis.com/v1/models/${geminiModel}:generateContent?key=${apiKey}`,
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

      const parsed = JSON.parse(text.trim());
      
      const { error } = await supabase
        .from('lead_team_meetings')
        .update({ summary: parsed })
        .eq('id', selectedMeeting.id);

      if (error) throw error;

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

  // ── Save/Import Suggested Task to Lead Team Tasks Queue ──
  const handleImportSuggestedTask = async (index: number) => {
    const task = extractedTasks[index];
    
    // Set status to loading
    setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, status: 'pending' as const } : t));

    try {
      const payload = {
        meeting_id: selectedMeeting?.id || null,
        title: task.title,
        description: task.description,
        role: task.role,
        project_id: task.selectedProjectId || null,
        status: 'En Cola',
        model: geminiModel,
        due_time: '09:00:00'
      };

      const { data, error } = await supabase
        .from('lead_team_tasks')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      showNotification('success', `Tarea "${task.title}" importada a la cola.`);
      
      // Update local task state
      setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, status: 'saved' as const } : t));
      setLeadTeamTasks(prev => [data, ...prev]);

      // Update persistent status in meeting summary
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
    } catch (err: any) {
      showNotification('error', `Error al importar tarea: ` + err.message);
      setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, status: 'error' as const } : t));
    }
  };

  const handleImportAllSuggestedTasks = async () => {
    const unsavedIndices = extractedTasks
      .map((t, idx) => t.status !== 'saved' ? idx : -1)
      .filter(idx => idx !== -1);

    if (unsavedIndices.length === 0) {
      showNotification('info', 'No hay nuevas tareas sugeridas para importar.');
      return;
    }

    showNotification('info', `Importando ${unsavedIndices.length} tareas...`);
    for (const idx of unsavedIndices) {
      await handleImportSuggestedTask(idx);
    }
  };

  // ── Update Task Status Directly ──
  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('lead_team_tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) throw error;

      showNotification('success', 'Estado de tarea actualizado.');
      setLeadTeamTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (err: any) {
      showNotification('error', 'Error al actualizar estado: ' + err.message);
    }
  };

  // ── Update Task Project Directly ──
  const handleUpdateTaskProject = async (taskId: string, newProjectId: string | null) => {
    try {
      const { error } = await supabase
        .from('lead_team_tasks')
        .update({ project_id: newProjectId })
        .eq('id', taskId);

      if (error) throw error;

      showNotification('success', 'Proyecto vinculado actualizado.');
      setLeadTeamTasks(prev => prev.map(t => t.id === taskId ? { ...t, project_id: newProjectId } : t));
    } catch (err: any) {
      showNotification('error', 'Error al vincular proyecto: ' + err.message);
    }
  };

  // ── Delete Task Directly ──
  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('lead_team_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      showNotification('success', 'Tarea eliminada de la cola.');
      setLeadTeamTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      showNotification('error', 'Error al eliminar tarea: ' + err.message);
    }
  };

  // ── Calendar Helpers for Juntas Selection ──
  const calendarLimits = useMemo(() => {
    const today = new Date();
    const maxMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const minMonth = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return { minMonth, maxMonth };
  }, []);

  const handlePrevMonth = () => {
    setCurrentCalendarMonth(prev => {
      const nextDate = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
      if (nextDate.getTime() >= calendarLimits.minMonth.getTime()) {
        setSelectedCalendarDay(null);
        return nextDate;
      }
      return prev;
    });
  };

  const handleNextMonth = () => {
    setCurrentCalendarMonth(prev => {
      const nextDate = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
      if (nextDate.getTime() <= calendarLimits.maxMonth.getTime()) {
        setSelectedCalendarDay(null);
        return nextDate;
      }
      return prev;
    });
  };

  const calendarDays = useMemo(() => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const cells: Array<{ type: 'empty' | 'day'; dayNum?: number; dateStr?: string }> = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ type: 'empty' });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({ type: 'day', dayNum: i, dateStr });
    }
    return cells;
  }, [currentCalendarMonth]);

  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach(m => {
      if (m.date) {
        if (!map[m.date]) map[m.date] = [];
        map[m.date].push(m);
      }
    });
    return map;
  }, [meetings]);

  const selectedDateStr = useMemo(() => {
    if (selectedCalendarDay === null) return null;
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedCalendarDay).padStart(2, '0')}`;
  }, [currentCalendarMonth, selectedCalendarDay]);

  const selectedDayMeetings = useMemo(() => {
    if (!selectedDateStr) return [];
    return meetingsByDate[selectedDateStr] || [];
  }, [selectedDateStr, meetingsByDate]);

  // ── Computed Statistics for Capa de Mando (CEO) ──
  const teamStats = useMemo(() => {
    const completedTasks = leadTeamTasks.filter(t => t.status === 'Completada').length;
    const activeTasks = leadTeamTasks.filter(t => t.status === 'En Curso').length;
    const queuedTasks = leadTeamTasks.filter(t => t.status === 'En Cola').length;

    // Calculate database memory/total records roughly for high-level CEO view
    const databaseMemory = meetings.length + leadTeamTasks.length + projects.length + 7;

    return {
      decisiones: completedTasks,
      memoria: databaseMemory,
      repartidas: activeTasks + queuedTasks
    };
  }, [meetings, leadTeamTasks, projects]);

  // ── Active Tasks per Role calculation ──
  const roleWorkload = useMemo(() => {
    const workload: Record<string, { queue: number; inProgress: number; completed: number; total: number }> = {};
    
    ['CEO', ...ROLES].forEach(r => {
      workload[r] = { queue: 0, inProgress: 0, completed: 0, total: 0 };
    });

    leadTeamTasks.forEach(t => {
      const role = t.role;
      if (workload[role]) {
        workload[role].total += 1;
        if (t.status === 'En Cola') workload[role].queue += 1;
        else if (t.status === 'En Curso') workload[role].inProgress += 1;
        else if (t.status === 'Completada') workload[role].completed += 1;
      }
    });

    return workload;
  }, [leadTeamTasks]);

  // ── Filtered Tasks for Tab 2 ──
  const filteredTasks = useMemo(() => {
    if (activeRoleFilter === 'TODOS') return leadTeamTasks;
    return leadTeamTasks.filter(t => t.role.toUpperCase() === activeRoleFilter.toUpperCase());
  }, [leadTeamTasks, activeRoleFilter]);

  // ── Dynamic Node Graph Data for Bóveda de Conocimiento ──
  const graphData = useMemo(() => {
    const nodes: Array<{ id: string; type: 'meeting' | 'decision' | 'task' | 'project'; label: string; x: number; y: number; originalObj: any }> = [];
    const links: Array<{ source: string; target: string; id: string }> = [];

    // Limit to last 4 meetings to keep the graph readable and clean
    const recentMeetings = meetings.slice(0, 4);
    const recentMeetingsIds = new Set(recentMeetings.map(m => m.id));

    // Filter tasks related to these meetings
    const relatedTasks = leadTeamTasks.filter(t => t.meeting_id && recentMeetingsIds.has(t.meeting_id)).slice(0, 8);

    // Extract projects linked to these tasks
    const projectIds = new Set<string>();
    relatedTasks.forEach(t => {
      if (t.project_id) projectIds.add(t.project_id);
    });
    const relatedProjects = projects.filter(p => projectIds.has(p.id));

    // Get decisions from recent meetings
    const relatedDecisions: Array<{ id: string; title: string; meetingId: string }> = [];
    recentMeetings.forEach(m => {
      if (m.summary?.decisiones) {
        m.summary.decisiones.slice(0, 2).forEach((d, idx) => {
          relatedDecisions.push({
            id: `dec-${m.id}-${idx}`,
            title: d,
            meetingId: m.id
          });
        });
      }
    });

    // Helper for vertical alignment coordinates
    const getLayoutY = (index: number, total: number) => {
      if (total <= 1) return 220;
      return 60 + index * (320 / (total - 1));
    };

    // 1. Column: Meetings (X = 100)
    recentMeetings.forEach((m, idx) => {
      nodes.push({
        id: m.id,
        type: 'meeting',
        label: m.title,
        x: 80,
        y: getLayoutY(idx, recentMeetings.length),
        originalObj: m
      });
    });

    // 2. Column: Decisions (X = 300)
    relatedDecisions.forEach((d, idx) => {
      nodes.push({
        id: d.id,
        type: 'decision',
        label: d.title,
        x: 280,
        y: getLayoutY(idx, relatedDecisions.length),
        originalObj: d
      });
      // Link: Meeting -> Decision
      links.push({
        id: `link-${d.meetingId}-${d.id}`,
        source: d.meetingId,
        target: d.id
      });
    });

    // 3. Column: Tasks (X = 480)
    relatedTasks.forEach((t, idx) => {
      nodes.push({
        id: t.id,
        type: 'task',
        label: `${t.role}: ${t.title}`,
        x: 480,
        y: getLayoutY(idx, relatedTasks.length),
        originalObj: t
      });
      // Link: Meeting -> Task
      if (t.meeting_id) {
        links.push({
          id: `link-${t.meeting_id}-${t.id}`,
          source: t.meeting_id,
          target: t.id
        });
      }
    });

    // 4. Column: Projects (X = 680)
    relatedProjects.forEach((p, idx) => {
      nodes.push({
        id: p.id,
        type: 'project',
        label: p.name,
        x: 680,
        y: getLayoutY(idx, relatedProjects.length),
        originalObj: p
      });
      // Link: Task -> Project
      relatedTasks.forEach(t => {
        if (t.project_id === p.id) {
          links.push({
            id: `link-${t.id}-${p.id}`,
            source: t.id,
            target: p.id
          });
        }
      });
    });

    return { nodes, links };
  }, [meetings, leadTeamTasks, projects]);

  const handleNodeClick = (node: any) => {
    if (node.type === 'meeting') {
      setSelectedNode({
        id: node.id,
        type: 'meeting',
        label: node.originalObj.title,
        description: `Transcripción o resumen de la junta del ${node.originalObj.date}.`,
        metadata: {
          'Fecha': node.originalObj.date,
          'Decisiones tomadas': node.originalObj.summary?.decisiones?.length || 0,
          'Tareas sugeridas': node.originalObj.summary?.tareas?.length || 0
        }
      });
    } else if (node.type === 'decision') {
      setSelectedNode({
        id: node.id,
        type: 'decision',
        label: node.label,
        description: 'Acuerdo o decisión estratégica definida durante la sesión de dirección.',
        metadata: {}
      });
    } else if (node.type === 'task') {
      const project = projects.find(p => p.id === node.originalObj.project_id);
      setSelectedNode({
        id: node.id,
        type: 'task',
        label: node.originalObj.title,
        description: node.originalObj.description || 'Sin descripción detallada.',
        metadata: {
          'Líder Responsable': node.originalObj.role,
          'Estado': node.originalObj.status,
          'Proyecto': project ? project.name : 'No vinculado',
          'Fecha de Asignación': new Date(node.originalObj.created_at).toLocaleDateString('es-MX')
        }
      });
    } else if (node.type === 'project') {
      const projectTasks = leadTeamTasks.filter(t => t.project_id === node.id);
      setSelectedNode({
        id: node.id,
        type: 'project',
        label: node.label,
        description: 'Proyecto estratégico de la empresa vinculado a las directrices del Lead Team.',
        metadata: {
          'Tareas de dirección activas': projectTasks.filter(t => t.status !== 'Completada').length,
          'Tareas de dirección completadas': projectTasks.filter(t => t.status === 'Completada').length
        }
      });
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      
      {/* ── Main Dashboard Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Users size={24} color="var(--primary-color)" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Juntas Lead Team</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Módulo gerencial de dirección ejecutiva y control de acuerdos estratégicos</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSyncGoogleDrive}
            disabled={syncingDrive}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}
          >
            {syncingDrive ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Sincronizar Google Drive
          </button>
          <button
            onClick={() => setShowConfigModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Settings size={16} />
            Configuración
          </button>
          <button
            onClick={() => setShowFormModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            Nueva Junta
          </button>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '8px', paddingBottom: '2px' }}>
        <button
          onClick={() => setActiveTab('equipo')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'equipo' ? 'var(--primary-color)' : '#64748b',
            borderBottom: activeTab === 'equipo' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Users size={16} />
          Equipo
        </button>
        <button
          onClick={() => setActiveTab('tareas')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'tareas' ? 'var(--primary-color)' : '#64748b',
            borderBottom: activeTab === 'tareas' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <ClipboardList size={16} />
          Cola de Trabajo
        </button>
        <button
          onClick={() => setActiveTab('boveda')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'boveda' ? 'var(--primary-color)' : '#64748b',
            borderBottom: activeTab === 'boveda' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Network size={16} />
          Bóveda de Conocimiento
        </button>
        <button
          onClick={() => setActiveTab('juntas')}
          style={{
            padding: '10px 16px',
            fontWeight: 600,
            fontSize: '0.9rem',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'juntas' ? 'var(--primary-color)' : '#64748b',
            borderBottom: activeTab === 'juntas' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileText size={16} />
          Analítica de Juntas
        </button>
      </div>

      {/* ── Tab Content ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px' }}>
          <Loader2 className="animate-spin" size={32} color="var(--primary-color)" />
        </div>
      ) : (
        <>
          {/* TAB 1: EQUIPO (CENTRO DE MANDO) */}
          {activeTab === 'equipo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* CEO Card (Capa de Mando) */}
              <div style={{
                background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                borderRadius: '16px',
                padding: '24px',
                color: 'white',
                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.15), 0 2px 4px -1px rgba(59, 130, 246, 0.1)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.15)', padding: '8px', borderRadius: '10px' }}>
                      <Layers size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>CEO</h3>
                      <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{ROLE_FOCUS['CEO']}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: '99px', fontWeight: 600 }}>
                    CAPA DE MANDO
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.08)', padding: '16px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '4px' }}>Decisiones Clave</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{teamStats.decisiones}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', padding: '16px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '4px' }}>Memoria del Sistema</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{teamStats.memoria}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', padding: '16px', borderRadius: '12px' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '4px' }}>Tareas Repartidas</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{teamStats.repartidas}</div>
                  </div>
                </div>
              </div>

              {/* Specialist grid */}
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155', marginBottom: '16px' }}>Estructura de Dirección Gerencial</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                  {ROLES.map(role => {
                    const stats = roleWorkload[role] || { queue: 0, inProgress: 0, completed: 0, total: 0 };
                    const hasInProgress = stats.inProgress > 0;
                    const hasQueue = stats.queue > 0;
                    
                    let statusLabel = 'LIBRE';
                    let statusColor = '#64748b';
                    let statusBg = '#f1f5f9';
                    let isPulse = false;

                    if (hasInProgress) {
                      statusLabel = 'TRABAJANDO';
                      statusColor = '#16a34a';
                      statusBg = '#dcfce7';
                      isPulse = true;
                    } else if (hasQueue) {
                      statusLabel = 'EN ESPERA';
                      statusColor = '#d97706';
                      statusBg = '#fef3c7';
                    }

                    // Get some active task titles
                    const activeTasks = leadTeamTasks
                      .filter(t => t.role === role && t.status !== 'Completada')
                      .slice(0, 2);

                    return (
                      <div
                        key={role}
                        style={{
                          background: 'white',
                          borderRadius: '14px',
                          border: '1px solid #e2e8f0',
                          padding: '20px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div>
                            <h4 style={{ margin: '0 0 2px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{role}</h4>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', minHeight: '32px' }}>{ROLE_FOCUS[role]}</span>
                          </div>
                          <span
                            className={isPulse ? 'animate-pulse' : ''}
                            style={{
                              fontSize: '0.7rem',
                              background: statusBg,
                              color: statusColor,
                              padding: '4px 10px',
                              borderRadius: '99px',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {statusLabel}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Cola</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>{stats.queue}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>En Curso</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>{stats.inProgress}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Hechas</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569' }}>{stats.completed}</div>
                          </div>
                        </div>

                        <div style={{ flexGrow: 1 }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Enfoque Activo:</div>
                          {activeTasks.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>Sin tareas activas asignadas.</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {activeTasks.map(t => (
                                <div key={t.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px dashed #e2e8f0' }}>
                                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.status === 'En Curso' ? '#16a34a' : '#d97706' }} />
                                  <span style={{ fontSize: '0.75rem', color: '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '240px' }} title={t.title}>
                                    {t.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TAREAS (COLA DE TRABAJO GERENCIAL) */}
          {activeTab === 'tareas' && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              
              {/* Role Filters */}
              <div style={{ display: 'flex', gap: '8px', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', background: '#fafafa' }}>
                {['TODOS', 'CEO', ...ROLES].map(role => (
                  <button
                    key={role}
                    onClick={() => setActiveRoleFilter(role)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: activeRoleFilter === role ? 'var(--primary-color)' : '#e2e8f0',
                      background: activeRoleFilter === role ? '#eff6ff' : 'white',
                      color: activeRoleFilter === role ? 'var(--primary-color)' : '#475569',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {role}
                  </button>
                ))}
              </div>

              {/* Tasks Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                      <th style={{ padding: '12px 20px', width: '90px' }}>HORA</th>
                      <th style={{ padding: '12px 20px', width: '160px' }}>GERENTE</th>
                      <th style={{ padding: '12px 20px', width: '130px' }}>ESTADO</th>
                      <th style={{ padding: '12px 20px' }}>TAREA</th>
                      <th style={{ padding: '12px 20px', width: '220px' }}>PROYECTO VINCULADO</th>
                      <th style={{ padding: '12px 20px', width: '140px' }}>MODELO</th>
                      <th style={{ padding: '12px 20px', width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          No hay tareas en esta cola para el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map(task => (
                        <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 20px', color: '#64748b', fontWeight: 500 }}>
                            {task.due_time ? task.due_time.substring(0, 5) : '09:00'}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{
                              background: task.role === 'CEO' ? '#eff6ff' : '#f1f5f9',
                              color: task.role === 'CEO' ? 'var(--primary-color)' : '#334155',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem'
                            }}>
                              {task.role}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <select
                              value={task.status}
                              onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                outline: 'none',
                                background: task.status === 'Completada' ? '#dcfce7' : task.status === 'En Curso' ? '#eff6ff' : 'white',
                                color: task.status === 'Completada' ? '#15803d' : task.status === 'En Curso' ? '#1d4ed8' : '#334155',
                                fontWeight: 600
                              }}
                            >
                              <option value="En Cola">En Cola</option>
                              <option value="En Curso">En Curso</option>
                              <option value="Completada">Completada</option>
                            </select>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>{task.title}</div>
                            {task.description && (
                              <div style={{ color: '#64748b', fontSize: '0.75rem', lineHeight: '1.25' }}>{task.description}</div>
                            )}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <select
                              value={task.project_id || ''}
                              onChange={(e) => handleUpdateTaskProject(task.id, e.target.value || null)}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.8rem',
                                outline: 'none',
                                background: task.project_id ? '#fff' : '#f8fafc',
                                color: task.project_id ? '#0f172a' : '#64748b'
                              }}
                            >
                              <option value="">-- Sin Proyecto --</option>
                              {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ padding: '16px 20px', color: '#64748b' }}>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                              {task.model || 'manual'}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                              title="Eliminar tarea"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: BÓVEDA DE CONOCIMIENTO (MAPA DE CONEXIONES) */}
          {activeTab === 'boveda' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
              
              {/* Node Graph Display */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#334155' }}>Mapa de Conexiones del Lead Team</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Muestra cómo interactúan las minutas, acuerdos, tareas gerenciales y proyectos reales.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.7rem', color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }} /> Junta
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} /> Acuerdo
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }} /> Tarea Liderazgo
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#eab308' }} /> Proyecto
                    </div>
                  </div>
                </div>

                {graphData.nodes.length === 0 ? (
                  <div style={{ height: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                    <HelpCircle size={32} style={{ marginBottom: '8px' }} />
                    <span>No hay suficientes datos registrados para generar el mapa.</span>
                  </div>
                ) : (
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: '8px', background: '#fafafa', position: 'relative', overflow: 'hidden' }}>
                    <svg width="100%" height="450px" style={{ minWidth: '760px' }}>
                      {/* Define Arrow Markers */}
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="#cbd5e1" />
                        </marker>
                        <marker id="arrow-selected" viewBox="0 0 10 10" refX="15" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary-color)" />
                        </marker>
                      </defs>

                      {/* Render links */}
                      {graphData.links.map(link => {
                        const sourceNode = graphData.nodes.find(n => n.id === link.source);
                        const targetNode = graphData.nodes.find(n => n.id === link.target);
                        if (!sourceNode || !targetNode) return null;

                        const isHighlighted = 
                          hoveredNodeId === link.source || hoveredNodeId === link.target ||
                          selectedNode?.id === link.source || selectedNode?.id === link.target;

                        return (
                          <line
                            key={link.id}
                            x1={sourceNode.x}
                            y1={sourceNode.y}
                            x2={targetNode.x}
                            y2={targetNode.y}
                            stroke={isHighlighted ? 'var(--primary-color)' : '#cbd5e1'}
                            strokeWidth={isHighlighted ? 2.5 : 1.5}
                            markerEnd={isHighlighted ? 'url(#arrow-selected)' : 'url(#arrow)'}
                            strokeDasharray={sourceNode.type === 'meeting' && targetNode.type === 'decision' ? '4 2' : '0'}
                            style={{ transition: 'all 0.15s ease' }}
                          />
                        );
                      })}

                      {/* Render nodes */}
                      {graphData.nodes.map(node => {
                        const isSelected = selectedNode?.id === node.id;
                        const isHovered = hoveredNodeId === node.id;

                        let color = '#3b82f6'; // meeting
                        if (node.type === 'decision') color = '#10b981';
                        else if (node.type === 'task') color = '#8b5cf6';
                        else if (node.type === 'project') color = '#eab308';

                        return (
                          <g
                            key={node.id}
                            onMouseEnter={() => setHoveredNodeId(node.id)}
                            onMouseLeave={() => setHoveredNodeId(null)}
                            onClick={() => handleNodeClick(node)}
                            style={{ cursor: 'pointer' }}
                          >
                            {/* Glow circle for select/hover */}
                            {(isSelected || isHovered) && (
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={18}
                                fill={color}
                                opacity={0.2}
                                style={{ transition: 'all 0.15s ease' }}
                              />
                            )}
                            {/* Main circle */}
                            <circle
                              cx={node.x}
                              cy={node.y}
                              r={12}
                              fill={color}
                              stroke="white"
                              strokeWidth={2}
                              style={{ transition: 'all 0.15s ease' }}
                            />
                            {/* Labels */}
                            <text
                              x={node.x}
                              y={node.y - 18}
                              textAnchor="middle"
                              fill="#1e293b"
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: isSelected || isHovered ? 700 : 500,
                                fontFamily: 'inherit',
                                pointerEvents: 'none'
                              }}
                            >
                              {node.label.length > 22 ? `${node.label.substring(0, 19)}...` : node.label}
                            </text>
                            {/* Small icon representation letter */}
                            <text
                              x={node.x}
                              y={node.y + 3.5}
                              textAnchor="middle"
                              fill="white"
                              style={{
                                fontSize: '0.6rem',
                                fontWeight: 800,
                                fontFamily: 'monospace',
                                pointerEvents: 'none'
                              }}
                            >
                              {node.type.substring(0, 1).toUpperCase()}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}
              </div>

              {/* Node Details Card */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', minHeight: '300px' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>Detalle de Selección</h3>

                {!selectedNode ? (
                  <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}>
                    <Network size={32} style={{ margin: '0 auto 12px auto' }} />
                    <p style={{ fontSize: '0.8rem', margin: 0 }}>Haz clic en un nodo en el mapa para explorar sus detalles y conexiones.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '99px',
                        background: selectedNode.type === 'meeting' ? '#dbeafe' : selectedNode.type === 'decision' ? '#d1fae5' : selectedNode.type === 'task' ? '#f3e8ff' : '#fef9c3',
                        color: selectedNode.type === 'meeting' ? '#1e40af' : selectedNode.type === 'decision' ? '#065f46' : selectedNode.type === 'task' ? '#6b21a8' : '#854d0e'
                      }}>
                        {selectedNode.type.toUpperCase()}
                      </span>
                      <h4 style={{ margin: '8px 0 4px 0', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{selectedNode.label}</h4>
                      {selectedNode.description && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>{selectedNode.description}</p>
                      )}
                    </div>

                    {Object.keys(selectedNode.metadata || {}).length > 0 && (
                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>Atributos:</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {Object.entries(selectedNode.metadata || {}).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                              <span style={{ color: '#64748b' }}>{k}</span>
                              <span style={{ fontWeight: 600, color: '#334155' }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ANALÍTICA DE JUNTAS (HISTORIAL Y PROCESAMIENTO) */}
          {activeTab === 'juntas' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', alignItems: 'start' }}>
              
              {/* Meeting List Sidebar (Google Calendar style) */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Calendar Month Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    disabled={currentCalendarMonth.getTime() <= calendarLimits.minMonth.getTime()}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: 'white',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: currentCalendarMonth.getTime() <= calendarLimits.minMonth.getTime() ? 'not-allowed' : 'pointer',
                      opacity: currentCalendarMonth.getTime() <= calendarLimits.minMonth.getTime() ? 0.3 : 1
                    }}
                  >
                    &lt;
                  </button>
                  <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {currentCalendarMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    disabled={currentCalendarMonth.getTime() >= calendarLimits.maxMonth.getTime()}
                    style={{
                      border: '1px solid #cbd5e1',
                      background: 'white',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: currentCalendarMonth.getTime() >= calendarLimits.maxMonth.getTime() ? 'not-allowed' : 'pointer',
                      opacity: currentCalendarMonth.getTime() >= calendarLimits.maxMonth.getTime() ? 0.3 : 1
                    }}
                  >
                    &gt;
                  </button>
                </div>

                {/* Calendar Grid Container */}
                <div style={{ padding: '12px' }}>
                  {/* Days of Week Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 600, color: '#94a3b8', fontSize: '0.75rem', marginBottom: '8px' }}>
                    {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((wd, i) => (
                      <div key={i}>{wd}</div>
                    ))}
                  </div>

                  {/* Day Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                    {calendarDays.map((cell, idx) => {
                      if (cell.type === 'empty') {
                        return <div key={`empty-${idx}`} />;
                      }

                      const dayNum = cell.dayNum!;
                      const dateStr = cell.dateStr!;
                      const dayMeetings = meetingsByDate[dateStr] || [];
                      const isSelected = selectedCalendarDay === dayNum;
                      
                      // Check if it is today
                      const today = new Date();
                      const isToday = today.getDate() === dayNum && 
                                      today.getMonth() === currentCalendarMonth.getMonth() && 
                                      today.getFullYear() === currentCalendarMonth.getFullYear();

                      return (
                        <div
                          key={`day-${dayNum}`}
                          onClick={() => {
                            setSelectedCalendarDay(dayNum);
                            if (dayMeetings.length > 0) {
                              setSelectedMeeting(dayMeetings[0]);
                            }
                          }}
                          style={{
                            height: '36px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: isSelected ? 700 : 500,
                            background: isSelected ? 'var(--primary-color)' : 'transparent',
                            color: isSelected ? 'white' : '#334155',
                            border: isToday ? '1px solid var(--primary-color)' : 'none',
                            position: 'relative',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          <span>{dayNum}</span>
                          {/* Dot indicator if has meetings */}
                          {dayMeetings.length > 0 && (
                            <span style={{
                              position: 'absolute',
                              bottom: '3px',
                              width: '4px',
                              height: '4px',
                              borderRadius: '50%',
                              background: isSelected ? 'white' : 'var(--primary-color)'
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Day meetings list */}
                <div style={{ borderTop: '1px solid #e2e8f0', background: '#fafafa', flexGrow: 1, minHeight: '150px' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#475569', fontSize: '0.75rem' }}>
                    {selectedCalendarDay ? (
                      <span>Juntas del {selectedCalendarDay} de {currentCalendarMonth.toLocaleDateString('es-MX', { month: 'long' })}:</span>
                    ) : (
                      <span>Selecciona un día en el calendario</span>
                    )}
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px' }}>
                    {selectedCalendarDay === null ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                        Haz clic en un día del calendario para ver sus reuniones.
                      </div>
                    ) : selectedDayMeetings.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
                        No hay juntas registradas para este día.
                      </div>
                    ) : (
                      selectedDayMeetings.map(m => (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMeeting(m)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '6px',
                            background: selectedMeeting?.id === m.id ? '#eff6ff' : 'white',
                            border: '1px solid',
                            borderColor: selectedMeeting?.id === m.id ? '#cbd5e1' : '#e2e8f0',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            marginBottom: '6px',
                            transition: 'all 0.1s ease'
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>{m.title}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b' }}>
                            <span>Hora: {new Date(m.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                            {m.summary && m.summary.tareas && m.summary.tareas.length > 0 && (
                              <span style={{ color: '#16a34a', fontWeight: 600 }}>Analizada</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Meeting View Area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {selectedMeeting ? (
                  <>
                    {/* Header Info */}
                    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }}>
                      <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: '0 0 8px 0' }}>{selectedMeeting.title}</h2>
                        <div style={{ display: 'flex', gap: '16px', color: '#64748b', fontSize: '0.85rem' }}>
                          <span>Fecha de Junta: <strong>{selectedMeeting.date}</strong></span>
                          <span>Registrada: <strong>{new Date(selectedMeeting.created_at).toLocaleDateString('es-MX')}</strong></span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setConfirmDelete(selectedMeeting)}
                          className="btn btn-secondary"
                          style={{ border: '1px solid #fca5a5', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Trash2 size={16} />
                          Eliminar Sesión
                        </button>
                        <button
                          onClick={handleAnalyzeTranscript}
                          disabled={analyzing || !selectedMeeting.transcript}
                          className="btn btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                          {selectedMeeting.summary && selectedMeeting.summary.tareas ? 'Re-analizar con IA' : 'Procesar con IA'}
                        </button>
                      </div>
                    </div>

                    {/* Decisions Box */}
                    {selectedMeeting.summary && selectedMeeting.summary.decisiones && selectedMeeting.summary.decisiones.length > 0 && (
                      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={18} color="#10b981" />
                          Acuerdos y Decisiones Clave
                        </h3>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {selectedMeeting.summary.decisiones.map((d, index) => (
                            <li key={index}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Suggested Tasks Box */}
                    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Tareas Gerenciales Sugeridas</span>
                        {extractedTasks.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1e40af', padding: '4px 10px', borderRadius: '999px', fontWeight: 600 }}>
                              {extractedTasks.length} Tareas encontradas
                            </span>
                            <button
                              onClick={handleImportAllSuggestedTasks}
                              className="btn btn-primary"
                              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                            >
                              Importar Todo
                            </button>
                          </div>
                        )}
                      </div>

                      <div style={{ padding: '20px' }}>
                        {!selectedMeeting.summary || !selectedMeeting.summary.tareas ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <AlertTriangle size={32} color="#f59e0b" style={{ margin: '0 auto 12px auto' }} />
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#334155' }}>Esta reunión no ha sido analizada</p>
                            <p style={{ margin: '4px 0 16px 0', fontSize: '0.85rem' }}>Haz clic en el botón de arriba para extraer automáticamente los acuerdos y tareas con Gemini.</p>
                          </div>
                        ) : extractedTasks.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                            No se detectaron tareas gerenciales en la transcripción.
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
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: 'var(--primary-color)' }}>
                                      {task.role}
                                    </span>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{task.title}</h4>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: '1.3' }}>{task.description}</p>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '160px' }}>
                                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>PROYECTO RELACIONADO</span>
                                    <select
                                      value={task.selectedProjectId || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setExtractedTasks(prev => prev.map((t, idx) => idx === index ? { ...t, selectedProjectId: val } : t));
                                      }}
                                      style={{
                                        padding: '4px 6px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.75rem',
                                        outline: 'none'
                                      }}
                                    >
                                      <option value="">-- Sin Proyecto --</option>
                                      {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    {task.status === 'saved' ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '0.75rem', fontWeight: 700, padding: '6px 12px', background: '#dcfce7', borderRadius: '6px' }}>
                                        <Check size={14} /> Importada
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleImportSuggestedTask(index)}
                                        disabled={task.status === 'pending'}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.75rem', padding: '6px 12px', whiteSpace: 'nowrap' }}
                                      >
                                        {task.status === 'pending' ? <Loader2 size={12} className="animate-spin" /> : 'Guardar en Cola'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Transcript Details Area */}
                    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                      <button
                        onClick={() => setShowTranscript(!showTranscript)}
                        style={{
                          width: '100%',
                          padding: '16px 20px',
                          border: 'none',
                          background: 'transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontWeight: 700,
                          color: '#334155',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <FileText size={18} color="#64748b" />
                          Ver Transcripción Completa de la Junta
                        </span>
                        {showTranscript ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>

                      {showTranscript && (
                        <div style={{ padding: '20px', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
                          <pre style={{
                            margin: 0,
                            fontFamily: 'inherit',
                            fontSize: '0.8rem',
                            color: '#475569',
                            whiteSpace: 'pre-wrap',
                            lineHeight: '1.5'
                          }}>
                            {selectedMeeting.transcript || 'Sin transcripción registrada.'}
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1', padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
                    <FileText size={48} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
                    <h3 style={{ margin: 0, color: '#475569' }}>Ninguna sesión seleccionada</h3>
                    <p style={{ margin: '4px 0 16px 0', fontSize: '0.85rem' }}>Selecciona una junta del historial a la izquierda o registra una nueva junta.</p>
                    
                    {/* Database Diagnostic Tool */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', marginTop: '20px', maxWidth: '400px', marginInline: 'auto' }}>
                      <button
                        type="button"
                        onClick={runDatabaseDiagnostics}
                        disabled={runningDiag}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '6px 12px', width: '100%' }}
                      >
                        {runningDiag ? <Loader2 size={14} className="animate-spin" style={{ display: 'inline', marginRight: '6px' }} /> : null}
                        Probar Conexión con Supabase (Diagnóstico)
                      </button>
                      {diagResult && (
                        <pre style={{
                          textAlign: 'left',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '12px',
                          marginTop: '12px',
                          fontSize: '0.7rem',
                          color: '#334155',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '200px',
                          fontFamily: 'monospace'
                        }}>
                          {diagResult}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal: Nueva Junta ── */}
      {showFormModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '600px',
            maxWidth: '90%',
            maxHeight: '90vh',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Registrar Nueva Junta del Lead Team</h3>
              <button onClick={() => setShowFormModal(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <form onSubmit={handleSaveMeeting} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
              {/* File Upload Dropzone */}
              <div style={{
                border: '2px dashed #cbd5e1',
                borderRadius: '8px',
                padding: '20px',
                textAlign: 'center',
                background: '#f8fafc',
                cursor: 'pointer',
                transition: 'border-color 0.15s ease'
              }}>
                <input
                  type="file"
                  accept=".md,.txt"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="meeting-file-upload"
                />
                <label htmlFor="meeting-file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <FileText size={32} color="#64748b" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Cargar archivo de Transcripción o Minuta (.md)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Se autocompletarán la fecha, el título y el contenido
                  </span>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>TÍTULO DE JUNTA</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej. Sesión de Lead Team 2026-08-24"
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>FECHA</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>TRANSCRIPCIÓN O ACTA DE LA REUNIÓN</label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Pega aquí la transcripción completa de la junta (obtenida de Google Calendar / Meet)..."
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    minHeight: '200px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowFormModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Guardar Junta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Configuración de Gemini ── */}
      {showConfigModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '450px',
            maxWidth: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Configuración del Sistema</h3>
              <button onClick={() => setShowConfigModal(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            {/* Google Drive Integration */}
            <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)' }}>INTEGRACIÓN CON GOOGLE DRIVE</span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>GOOGLE CLIENT ID (OAuth 2.0)</label>
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="Ej. 123456789-abc.apps.googleusercontent.com"
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>ID DE CARPETA DE GOOGLE DRIVE</label>
                <input
                  type="text"
                  value={googleFolderId}
                  onChange={(e) => setGoogleFolderId(e.target.value)}
                  placeholder="1tq57ZYomJ2dCRAlT8KhumARk3-TDYTac"
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Gemini AI Config */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary-color)' }}>GOOGLE GEMINI AI</span>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>API KEY DE GOOGLE AI STUDIO</label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => {
                    setGeminiKey(e.target.value);
                    if (e.target.value) fetchAvailableModels(e.target.value);
                  }}
                  placeholder="Pega tu API Key de Gemini..."
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>MODELO SELECCIONADO</label>
                {loadingModels ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#64748b', padding: '8px 0' }}>
                    <Loader2 className="animate-spin" size={14} /> Cargando modelos disponibles de tu cuenta...
                  </div>
                ) : modelLoadError ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} /> Error al consultar modelos: {modelLoadError}
                    </div>
                    <input
                      type="text"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      placeholder="Escribe el modelo (ej: gemini-1.5-flash)"
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>
                ) : (
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', outline: 'none' }}
                  >
                    {availableModels.length === 0 ? (
                      <option value="gemini-1.5-flash">gemini-1.5-flash (predeterminado)</option>
                    ) : (
                      availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))
                    )}
                  </select>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowConfigModal(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleSaveConfig} className="btn btn-primary">Guardar Configuración</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && (
        <ConfirmModal
          isOpen={!!confirmDelete}
          title="¿Eliminar sesión?"
          message={`¿Estás seguro de que deseas eliminar permanentemente la sesión "${confirmDelete.title}" y todos sus análisis? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={handleDeleteMeeting}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
