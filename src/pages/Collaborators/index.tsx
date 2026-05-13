import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Search, 
  Filter, 
  Briefcase, 
  Clock, 
  TrendingUp, 
  Calendar,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  UserCheck,
  ChevronDown,
  Layout,
  Users,
  Trophy,
  AlertTriangle,
  Timer
} from 'lucide-react';

interface CollaboratorStats {
  id: string; // Combined key: profile_id + project_id
  profile_id: string;
  full_name: string;
  area_name: string;
  project_id: string;
  project_name: string;
  progress: number;
  deadline: string | null;
  status: string;
  status_color: string;
  priority: string;
  is_hazu: boolean;
  task_id?: string;
  internal_project_name?: string;
}

export default function Collaborators() {
  const [stats, setStats] = useState<CollaboratorStats[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());
  const [collapsedCollaborators, setCollapsedCollaborators] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projRes, areasRes, profilesRes, tasksRes, checklistsRes] = await Promise.all([
        supabase.from('projects').select('id, name'),
        supabase.from('areas').select('*'),
        supabase.from('profiles').select('id, full_name, email, area_id'),
        supabase.from('tasks').select('id, title, project_id, assigned_to, status, priority, due_date, internal_project_name, projects(name, end_date, status, clients(name, reference_name))'),
        supabase.from('task_checklists').select('task_id, is_completed')
      ]);

      if (projRes.data) setProjects(projRes.data);
      if (areasRes.data) setAreas(areasRes.data);

      if (!profilesRes.data || !tasksRes.data) return;

      const profiles = profilesRes.data;
      const tasks = tasksRes.data;
      const checklists = checklistsRes.data || [];

      // Process stats
      const collabMap = new Map<string, any>();

      tasks.forEach((task: any) => {
        if (!task.assigned_to || !task.project_id) return;

        const profile = profiles.find(p => p.id === task.assigned_to);
        if (!profile) return;

        const projectInfo = Array.isArray(task.projects) ? task.projects[0] : task.projects;
        const area = areasRes.data?.find(a => a.id === profile.area_id);
        const clientData = Array.isArray(projectInfo?.clients) ? projectInfo?.clients[0] : projectInfo?.clients;
        const nameStr = clientData?.name || '';
        const refStr = clientData?.reference_name || '';
        const combinedStr = `${nameStr} ${refStr}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isHazu = combinedStr.includes('hazu');

        const internalProjKey = task.internal_project_name ? `internal_${task.internal_project_name}` : `task_${task.id}`;
        const key = isHazu ? `${task.assigned_to}_${internalProjKey}` : `${task.assigned_to}_${task.project_id}`;

        if (!collabMap.has(key)) {
          const endDate = isHazu ? task.due_date : projectInfo?.end_date;
          let status = 'En tiempo';
          let statusColor = '#3b82f6';

          if (endDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const due = new Date(endDate + 'T12:00:00');
            const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
              status = 'Retrasado';
              statusColor = '#ef4444';
            } else if (diffDays <= 10) {
              status = 'Por vencer';
              statusColor = '#f59e0b';
            }
          }

          collabMap.set(key, {
            id: key,
            profile_id: task.assigned_to,
            full_name: profile.full_name || profile.email || 'Usuario',
            area_id: profile.area_id || 'unassigned',
            area_name: area?.name || 'Sin área',
            project_id: task.project_id,
            project_name: isHazu ? `Interno - ${task.internal_project_name || task.title}` : (projectInfo?.name || 'Sin nombre'),
            progress: 0,
            deadline: endDate,
            status,
            status_color: statusColor,
            priority: task.priority || 'medium',
            is_hazu: isHazu,
            task_id: isHazu && !task.internal_project_name ? task.id : undefined,
            internal_project_name: task.internal_project_name,
            _taskProgressSum: 0,
            _taskCount: 0
          });
        }

        const entry = collabMap.get(key);
        // Take highest priority if multiple tasks for normal projects
        if (!isHazu && task.priority) {
          const prioOrder: Record<string, number> = { 'low': 1, 'medium': 2, 'high': 3, 'urgent': 4 };
          if (prioOrder[task.priority] > prioOrder[entry.priority]) {
             entry.priority = task.priority;
          }
        }
        
        // Calculate progress for THIS task based on its checklists
        const taskChecks = checklists.filter(c => c.task_id === task.id);
        let taskProgress = 0;
        if (taskChecks.length > 0) {
          taskProgress = (taskChecks.filter(c => c.is_completed).length / taskChecks.length) * 100;
        } else if (task.status === 'done' || task.status === 'approved') {
          taskProgress = 100;
        }

        entry._taskProgressSum += taskProgress;
        entry._taskCount += 1;
      });

      const finalStats: CollaboratorStats[] = Array.from(collabMap.values()).map((entry: any) => {
        const progress = entry._taskCount > 0 ? Math.round(entry._taskProgressSum / entry._taskCount) : 0;
        let finalStatus = entry.status;
        let finalStatusColor = entry.status_color;

        if (entry.is_hazu) {
          if (progress === 100) {
            finalStatus = 'Finalizado';
            finalStatusColor = '#10b981';
          }
        } else {
          // For individual projects, check if there is a manual status set in the project
          // The project status was attached in task.projects by the first task processed for this project.
          // Let's get the original project status.
          const projectInfo = tasks.find((t: any) => t.project_id === entry.project_id)?.projects;
          const projStatus = Array.isArray(projectInfo) ? projectInfo[0]?.status : projectInfo?.status;

          if (projStatus === 'Finalizado' || projStatus === 'En Pausa') {
            finalStatus = projStatus;
            finalStatusColor = projStatus === 'Finalizado' ? '#10b981' : '#f59e0b';
          }
        }

        return {
          ...entry,
          progress,
          status: finalStatus,
          status_color: finalStatusColor
        };
      });

      setStats(finalStats);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleArea = (areaId: string) => {
    setCollapsedAreas(prev => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const toggleCollaborator = (collabId: string) => {
    setCollapsedCollaborators(prev => {
      const next = new Set(prev);
      if (next.has(collabId)) next.delete(collabId);
      else next.add(collabId);
      return next;
    });
  };

  const getProgressColor = (pct: number) => {
    if (pct <= 30) return '#ef4444';
    if (pct <= 70) return '#f59e0b';
    return '#10b981';
  };

  const handlePriorityChange = async (stat: CollaboratorStats, newPriority: string) => {
    // Update UI immediately
    setStats(prev => prev.map(s => s.id === stat.id ? { ...s, priority: newPriority } : s));
    
    // Update DB
    try {
      if (stat.is_hazu && stat.internal_project_name) {
        await supabase.from('tasks')
          .update({ priority: newPriority })
          .eq('project_id', stat.project_id)
          .eq('assigned_to', stat.profile_id)
          .eq('internal_project_name', stat.internal_project_name);
      } else if (stat.is_hazu && stat.task_id) {
        await supabase.from('tasks').update({ priority: newPriority }).eq('id', stat.task_id);
      } else {
        await supabase.from('tasks')
          .update({ priority: newPriority })
          .eq('project_id', stat.project_id)
          .eq('assigned_to', stat.profile_id);
      }
    } catch (err) {
      console.error('Failed to update priority', err);
    }
  };

  const filteredStats = stats.filter(s => {
    const matchesSearch = s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         s.project_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProject = filterProject ? s.project_id === filterProject : true;
    const matchesStatus = filterStatus ? s.status === filterStatus : true;
    return matchesSearch && matchesProject && matchesStatus;
  });

  // Grouping by Area -> Collaborator
  const groupedStats = filteredStats.reduce((acc: any, curr) => {
    const areaId = curr.area_id;
    if (!acc[areaId]) {
      acc[areaId] = {
        name: curr.area_name,
        collaboratorsCount: new Set(filteredStats.filter(f => f.area_id === areaId).map(f => f.profile_id)).size,
        collaborators: {}
      };
    }
    
    const profileId = curr.profile_id;
    if (!acc[areaId].collaborators[profileId]) {
      acc[areaId].collaborators[profileId] = {
        id: profileId,
        name: curr.full_name,
        email: curr.email,
        stats: []
      };
    }
    
    acc[areaId].collaborators[profileId].stats.push(curr);
    return acc;
  }, {});

  return (
    <div style={{ padding: '0 0 40px 0' }}>
      {/* 1. Header (Now at the very top) */}
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--primary-color), #6366f1)', padding: '14px', borderRadius: '18px', color: 'white', boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.3)' }}>
            <Timer size={28} />
          </div>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Seguimiento de tareas</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px', fontWeight: 500 }}>
              Tareas asignadas y cumplimiento de objetivos por área.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
        <div style={{ background: 'white', padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: '#f0fdf4', borderRadius: '50%', opacity: 0.5 }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative' }}>
            <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '14px' }}>
              <Trophy size={22} color="#16a34a" />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>
            {filteredStats.filter(s => s.progress === 100).length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, marginTop: '4px', letterSpacing: '0.02em' }}>PROYECTOS COMPLETADOS</div>
        </div>

        <div style={{ background: 'white', padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: '#fff7ed', borderRadius: '50%', opacity: 0.5 }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative' }}>
            <div style={{ background: '#fff7ed', padding: '12px', borderRadius: '14px' }}>
              <AlertTriangle size={22} color="#f97316" />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>
            {filteredStats.filter(s => s.status === 'Por vencer').length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, marginTop: '4px', letterSpacing: '0.02em' }}>CERCANOS A VENCER</div>
        </div>

        <div style={{ background: 'white', padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '-10px', width: '80px', height: '80px', background: '#fef2f2', borderRadius: '50%', opacity: 0.5 }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', position: 'relative' }}>
            <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '14px' }}>
              <AlertCircle size={22} color="#ef4444" />
            </div>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>
            {filteredStats.filter(s => s.status === 'Retrasado').length}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 700, marginTop: '4px', letterSpacing: '0.02em' }}>PROYECTOS CON RETRASO</div>
        </div>
      </div>

      {/* 3. Superior Filters */}
      <div style={{ 
        marginBottom: '24px', 
        display: 'flex', 
        gap: '16px', 
        alignItems: 'center', 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '20px', 
        border: '1px solid var(--border-color)',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Buscar por colaborador o proyecto..." 
            className="form-input"
            style={{ paddingLeft: '42px', marginBottom: 0, borderRadius: '12px', height: '42px', border: '1px solid #f1f5f9' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            className="form-input" 
            style={{ width: '200px', marginBottom: 0, borderRadius: '12px', height: '42px', background: '#f8fafc', border: '1px solid #f1f5f9' }} 
            value={filterProject} 
            onChange={e => setFilterProject(e.target.value)}
          >
            <option value="">Todos los Proyectos</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <select 
            className="form-input" 
            style={{ width: '160px', marginBottom: 0, borderRadius: '12px', height: '42px', background: '#f8fafc', border: '1px solid #f1f5f9' }} 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">Todos los Estados</option>
            <option value="En tiempo">En tiempo</option>
            <option value="Por vencer">Por vencer</option>
            <option value="Retrasado">Retrasado</option>
            <option value="Finalizado">Finalizado</option>
            <option value="En Pausa">En Pausa</option>
          </select>
          
          {(searchQuery || filterProject || filterStatus) && (
            <button className="btn btn-secondary" onClick={() => { setSearchQuery(''); setFilterProject(''); setFilterStatus(''); }} style={{ padding: '10px', borderRadius: '12px' }}>Limpiar</button>
          )}
        </div>
      </div>

      <div className="table-container" style={{ background: 'transparent', border: 'none' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner"></div></div>
        ) : Object.keys(groupedStats).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>No hay datos disponibles.</div>
        ) : Object.entries(groupedStats).map(([areaId, area]: any) => (
          <div key={areaId} style={{ marginBottom: '16px' }}>
            <div 
              onClick={() => toggleArea(areaId)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '14px 24px', 
                background: !collapsedAreas.has(areaId) ? '#f8fafc' : 'white', 
                borderRadius: '16px', 
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
                marginBottom: collapsedAreas.has(areaId) ? '0' : '12px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.01)',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'var(--primary-color)', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  <Users size={16} />
                </div>
                <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{area.name}</span>
                <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 12px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                  {area.collaboratorsCount} {area.collaboratorsCount === 1 ? 'colaborador' : 'colaboradores'}
                </span>
              </div>
              <ChevronDown size={20} color="#94a3b8" style={{ transform: collapsedAreas.has(areaId) ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>

            {!collapsedAreas.has(areaId) && (
              <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
                {Object.values(area.collaborators).map((collab: any, idx: number) => (
                  <div key={collab.id} style={{ borderBottom: idx < Object.values(area.collaborators).length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div 
                      onClick={() => toggleCollaborator(collab.id)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '16px 24px', 
                        cursor: 'pointer',
                        background: !collapsedCollaborators.has(collab.id) ? '#e2e8f0' : 'white',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '36px', height: '36px', borderRadius: '12px', 
                          background: '#f1f5f9', color: 'var(--primary-color)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', 
                          fontWeight: 800, fontSize: '0.8rem' 
                        }}>
                          {(collab.name || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#1e293b' }}>{collab.name}</div>
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 10px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800 }}>
                              {collab.stats.length} PROYECTO{collab.stats.length !== 1 ? 'S' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronDown size={20} color="#94a3b8" style={{ transform: collapsedCollaborators.has(collab.id) ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }} />
                    </div>

                    {!collapsedCollaborators.has(collab.id) && (
                      <div style={{ background: '#f8fafc', padding: '16px 24px', borderTop: '1px solid #e2e8f0' }}>
                        <table className="table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '0 0 12px 0', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>PROYECTO ASIGNADO</th>
                              <th style={{ padding: '0 0 12px 0', textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>PRIORIDAD</th>
                              <th style={{ padding: '0 0 12px 0', textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>AVANCE</th>
                              <th style={{ padding: '0 0 12px 0', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>DEADLINE</th>
                              <th style={{ padding: '0 0 12px 0', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 800 }}>ESTADO</th>
                            </tr>
                          </thead>
                          <tbody>
                            {collab.stats.sort((a: any, b: any) => {
                              const prioOrder: Record<string, number> = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
                              return (prioOrder[b.priority] || 0) - (prioOrder[a.priority] || 0);
                            }).map((s: any) => {
                              const progressColor = getProgressColor(s.progress);
                              return (
                                <tr key={s.id} style={{ background: 'transparent' }}>
                                  <td style={{ padding: '12px 0' }}>
                                    <Link to={`/board/${s.project_id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}>
                                      <Briefcase size={14} style={{ opacity: 0.8 }} />
                                      {s.project_name}
                                    </Link>
                                  </td>
                                  <td style={{ padding: '12px 0', textAlign: 'center' }}>
                                    <select 
                                      value={s.priority} 
                                      onChange={(e) => handlePriorityChange(s, e.target.value)}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        border: `1.5px solid ${s.priority === 'high' || s.priority === 'urgent' ? '#ef444440' : s.priority === 'medium' ? '#f59e0b40' : '#10b98140'}`,
                                        background: s.priority === 'high' || s.priority === 'urgent' ? '#fef2f2' : s.priority === 'medium' ? '#fff7ed' : '#f0fdf4',
                                        color: s.priority === 'high' || s.priority === 'urgent' ? '#ef4444' : s.priority === 'medium' ? '#f97316' : '#10b981',
                                        fontWeight: 800,
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        outline: 'none'
                                      }}
                                    >
                                      <option value="high">Alta</option>
                                      <option value="medium">Media</option>
                                      <option value="low">Baja</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '12px 0', textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: `${progressColor}15`, padding: '6px 14px', borderRadius: '12px' }}>
                                      <TrendingUp size={14} color={progressColor} />
                                      <span style={{ fontWeight: 800, color: progressColor, fontSize: '0.8rem' }}>{s.progress}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.85rem', fontWeight: 700 }}>
                                      <Calendar size={14} style={{ opacity: 0.6 }} />
                                      {s.deadline ? new Date(s.deadline + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'Sin fecha'}
                                    </div>
                                  </td>
                                  <td style={{ padding: '12px 0' }}>
                                    <div style={{ 
                                      display: 'inline-flex', 
                                      alignItems: 'center', 
                                      gap: '6px', 
                                      padding: '6px 12px', 
                                      borderRadius: '10px', 
                                      background: s.status === 'Finalizado' ? '#f0fdf4' : s.status === 'En tiempo' ? '#eff6ff' : s.status === 'En Pausa' ? '#f8fafc' : s.status === 'Por vencer' ? '#fff7ed' : '#fef2f2',
                                      border: `1.5px solid ${s.status_color}40`,
                                      boxShadow: `0 2px 4px ${s.status_color}10`
                                    }}>
                                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.status_color }}></div>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: s.status_color }}>{s.status}</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
