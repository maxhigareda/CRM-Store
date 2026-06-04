import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Briefcase, Calendar, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';

interface Project {
  id: string;
  name: string;
  client_id: string;
  clients?: { name: string; reference_name?: string };
  delivery_date: string;
  status: string;
  end_date: string;
  priority?: string;
  progress?: number;
}

const priorityWeight: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1
};

export default function PlanTrabajo() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'my' | 'all'>('my');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch projects and client data
      const fetchPromise = Promise.all([
        supabase.from('projects').select('*, clients(name, reference_name)'),
        supabase.from('tasks').select('*'),
        supabase.from('task_checklists').select('*')
      ]);

      const timeoutPromise = new Promise<[any, any, any]>((_, reject) => 
        setTimeout(() => reject(new Error("Supabase timeout (Plan de Trabajo)")), 10000)
      );

      const [projRes, tasksRes, checklistsRes] = await Promise.race([fetchPromise, timeoutPromise]);

      if (projRes.error) throw projRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const allProjects = projRes.data || [];
      const allTasks = tasksRes.data || [];
      const allChecklists = checklistsRes.data || [];

      // 2. Compute project progress
      const projectsWithProgress = allProjects.map((p: any) => {
        const projectTasks = allTasks.filter((t: any) => t.project_id === p.id);
        
        let progress = 0;
        if (projectTasks.length > 0) {
          let totalTaskProgressSum = 0;
          
          projectTasks.forEach((task: any) => {
            const taskChecklists = allChecklists.filter((c: any) => c.task_id === task.id);
            
            let taskProgress = 0;
            if (taskChecklists.length > 0) {
              const completedCount = taskChecklists.filter((c: any) => c.is_completed).length;
              taskProgress = (completedCount / taskChecklists.length) * 100;
            } else if (task.status === 'done' || task.status === 'approved') {
              taskProgress = 100;
            }
            
            totalTaskProgressSum += taskProgress;
          });
          
          progress = Math.round(totalTaskProgressSum / projectTasks.length);
        }

        // Add user association flag: Has at least one task assigned to this user
        const isAssigned = projectTasks.some((t: any) => t.assigned_to === user?.id);

        return {
          ...p,
          progress,
          isAssigned
        };
      });

      // 3. Sort by priority weight descending (Urgent -> High -> Medium -> Low), then by end_date
      projectsWithProgress.sort((a: any, b: any) => {
        const weightA = priorityWeight[a.priority || 'medium'] || 2;
        const weightB = priorityWeight[b.priority || 'medium'] || 2;
        
        if (weightB !== weightA) {
          return weightB - weightA;
        }
        
        // Secondary sort by end date
        if (!a.end_date) return 1;
        if (!b.end_date) return -1;
        return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
      });

      setProjects(projectsWithProgress);
    } catch (err: any) {
      console.error("Error en Plan de Trabajo:", err);
      showNotification('error', 'Error al cargar el plan de trabajo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    // Search filter
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.clients?.reference_name || p.clients?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    // Tab filter
    const matchesTab = filterTab === 'my' ? (p as any).isAssigned : true;

    return matchesSearch && matchesTab;
  });

  return (
    <div style={{ padding: '10px' }}>
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>Plan de Trabajo</h1>
          <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '6px' }}>Listado de tus proyectos activos ordenados por prioridad de entrega.</p>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
          <button 
            onClick={() => setFilterTab('my')} 
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '8px',
              background: filterTab === 'my' ? 'white' : 'transparent',
              color: filterTab === 'my' ? '#0f172a' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: filterTab === 'my' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Mis Proyectos Asignados
          </button>
          <button 
            onClick={() => setFilterTab('all')} 
            style={{
              padding: '8px 18px',
              border: 'none',
              borderRadius: '8px',
              background: filterTab === 'all' ? 'white' : 'transparent',
              color: filterTab === 'all' ? '#0f172a' : '#64748b',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: filterTab === 'all' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            Todos los Proyectos
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '350px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Buscar por proyecto o cliente..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '40px', marginBottom: 0, borderRadius: '12px', border: '2px solid #e2e8f0', background: 'white' }}
          />
        </div>
      </div>

      {/* Projects Table */}
      <div className="table-container" style={{ background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' }}>
        <table className="table">
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '20px' }}>Proyecto</th>
              <th style={{ padding: '20px' }}>Cliente</th>
              <th style={{ padding: '20px' }}>Prioridad</th>
              <th style={{ padding: '20px' }}>Fecha Límite</th>
              <th style={{ padding: '20px', width: '220px' }}>Progreso de Avance</th>
              <th style={{ padding: '20px', width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '60px' }}>
                  <Loader2 className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary-color)' }} />
                </td>
              </tr>
            ) : filteredProjects.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8', fontStyle: 'italic' }}>
                  {filterTab === 'my' ? 'No tienes proyectos asignados en este momento.' : 'No se encontraron proyectos.'}
                </td>
              </tr>
            ) : filteredProjects.map(p => {
              const hasDeadline = !!p.end_date;
              const isOverdue = hasDeadline && new Date(p.end_date + 'T12:00:00') < new Date() && p.progress !== 100;
              
              return (
                <tr 
                  key={p.id} 
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.2s' }}
                  onClick={() => navigate(`/board/${p.id}`)}
                  className="project-row-hover"
                >
                  <td style={{ padding: '20px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '8px', borderRadius: '10px' }}>
                        <Briefcase size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{p.name}</div>
                        {(p as any).isAssigned && (
                          <span style={{ display: 'inline-block', fontSize: '0.7rem', color: 'var(--primary-color)', fontWeight: 800, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', marginTop: '4px' }}>
                            Asignado
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '20px', color: '#475569', fontWeight: 600 }}>
                    {p.clients?.reference_name || p.clients?.name || 'Sin asignar'}
                  </td>
                  <td style={{ padding: '20px' }}>
                    <span className="status-chip" style={{ 
                      backgroundColor: p.priority === 'urgent' ? '#fee2e2' : p.priority === 'high' ? '#ffedd5' : p.priority === 'low' ? '#dcfce7' : '#f1f5f9',
                      color: p.priority === 'urgent' ? '#991b1b' : p.priority === 'high' ? '#c2410c' : p.priority === 'low' ? '#166534' : '#475569',
                      fontWeight: 700
                    }}>
                      {p.priority === 'urgent' ? '🔴 Urgente' : p.priority === 'high' ? '🟠 Alta' : p.priority === 'low' ? '🟢 Baja' : '🟡 Media'}
                    </span>
                  </td>
                  <td style={{ padding: '20px', color: isOverdue ? '#ef4444' : '#475569', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      <span>
                        {p.end_date ? new Date(p.end_date + 'T12:00:00').toLocaleDateString() : '-'}
                      </span>
                      {isOverdue && (
                        <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                          Vencido
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '20px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${p.progress || 0}%`, 
                          height: '100%', 
                          backgroundColor: p.progress === 100 ? '#10b981' : 'var(--primary-color)',
                          borderRadius: '4px',
                          transition: 'width 0.5s ease-out'
                        }}></div>
                      </div>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', minWidth: '38px', textAlign: 'right' }}>{p.progress || 0}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '20px', textAlign: 'right', color: '#cbd5e1' }}>
                    <ChevronRight size={18} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Table hover styles */}
      <style>{`
        .project-row-hover:hover {
          background-color: #f8fafc;
        }
      `}</style>
    </div>
  );
}
