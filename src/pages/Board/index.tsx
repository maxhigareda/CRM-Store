import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  Plus, 
  Search, 
  X, 
  Trash2, 
  MessageSquare, 
  CheckSquare, 
  Clock,
  MoreHorizontal,
  Send,
  Info,
  Briefcase,
  GripVertical,
  Paperclip as AttachIcon,
  Edit2,
  User,
  ChevronDown,
  Table as TableIcon,
  BarChart3,
  Columns as KanbanIcon,
  Timer
} from 'lucide-react';
import { 
  DndContext, 
  closestCorners, 
  PointerSensor, 
  useSensor, 
  useSensors, 
  DragOverlay,
  KeyboardSensor,
  useDroppable
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  verticalListSortingStrategy, 
  useSortable,
  sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import GanttChart from '../../components/Gantt/GanttChart';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmModal } from '../../components/Modals';
interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  priority_level?: string;
  internal_project_name?: string;
  phase_id?: string;
  due_date: string;
  due_time: string;
  start_date?: string;
  label_ids: string[];
  assigned_to: string;
  position: number;
  profiles?: { id: string; full_name: string; email: string };
  checklists?: { total: number; completed: number };
}

interface Project {
  id: string;
  name: string;
  delivery_date: string;
  end_date: string;
  duration_weeks: number;
  client_id: string;
  status?: string;
  clients?: { name: string; reference_name?: string };
  project_phases?: any[];
}

const COLUMNS = [
  { id: 'todo', title: 'Por Hacer', color: '#3b82f6' }, // Blue
  { id: 'doing', title: 'En Proceso', color: '#f59e0b' }, // Orange
  { id: 'review', title: 'En Revisión', color: '#8b5cf6' }, // Purple
  { id: 'done', title: 'Aprobado', color: '#10b981' }   // Green
];


const TAG_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#1e293b', '#6366f1', '#14b8a6',
  '#f43f5e', '#84cc16', '#eab308', '#d946ef', '#0ea5e9', '#64748b', '#475569', '#f97316', '#a855f7', '#22c55e',
  '#fbbf24', '#f87171', '#38bdf8', '#818cf8', '#c084fc', '#fb7185', '#4ade80', '#fb923c', '#94a3b8', '#000000'
];

export default function Board() {
  const { showNotification } = useNotification();
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksRef = useRef<Task[]>([]); // Ref to avoid stale closures in DnD
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [globalInternalProjects, setGlobalInternalProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table' | 'gantt'>('kanban');
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showGanttModal, setShowGanttModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [targetColumn, setTargetColumn] = useState('todo');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (projectId) {
      fetchBoardData();
    }
  }, [projectId]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const fetchBoardData = async () => {
    setLoading(true);
    try {
      const fetchPromise = Promise.all([
        supabase.from('projects').select('*, clients(name, reference_name), project_phases(*)').eq('id', projectId).single(),
        supabase.from('tasks').select('*, profiles(id, full_name, email)').eq('project_id', projectId).order('position'),
        supabase.from('profiles').select('id, full_name, email').order('full_name'),
        supabase.from('tags').select('*').eq('type', 'task').order('name'),
        supabase.from('tasks').select('internal_project_name').not('internal_project_name', 'is', null)
      ]);

      const timeoutPromise = new Promise<any>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout al cargar datos del tablero")), 30000)
      );

      const [projRes, tasksRes, profilesRes, tagsRes, internalProjRes] = await Promise.race([fetchPromise, timeoutPromise]);

      if (projRes.data) setProject(projRes.data);
      if (tasksRes.data) {
        const tasksWithCounts = await Promise.all(tasksRes.data.map(async (t: any) => {
          const { data: checks } = await supabase.from('task_checklists').select('is_completed').eq('task_id', t.id);
          return {
            ...t,
            checklists: {
              total: checks?.length || 0,
              completed: checks?.filter(c => c.is_completed).length || 0
            }
          };
        }));
        setTasks(tasksWithCounts);
      }
      if (profilesRes.data) setAllProfiles(profilesRes.data || []);
      if (tagsRes.data) setAllTags(tagsRes.data || []);
      if (internalProjRes.data) {
        const uniqueProjects = Array.from(new Set(internalProjRes.data.map((t: any) => t.internal_project_name).filter(Boolean)));
        setGlobalInternalProjects(uniqueProjects as string[]);
      }
    } catch (err) {
      console.error("Error loading board data:", err);
    } finally {
      setLoading(false);
    }
  };

  const findContainer = (id: string, currentTasks: Task[]) => {
    if (COLUMNS.some(c => c.id === id)) return id;
    const task = currentTasks.find(t => t.id === id);
    return task ? task.status : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeContainer = findContainer(activeId, tasks);
    const overContainer = findContainer(overId, tasks);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setTasks((prev) => {
      const activeIndex = prev.findIndex((t) => t.id === activeId);
      const overIndex = prev.findIndex((t) => t.id === overId);

      let newIndex;
      if (COLUMNS.some(c => c.id === overId)) {
        newIndex = prev.length;
      } else {
        newIndex = overIndex >= 0 ? overIndex : prev.length;
      }

      const updatedTasks = [...prev];
      updatedTasks[activeIndex] = { ...updatedTasks[activeIndex], status: overContainer };
      
      return arrayMove(updatedTasks, activeIndex, newIndex);
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over) {
      const activeId = active.id as string;
      const overId = over.id as string;
      
      // We look at the container after the potential updates in handleDragOver
      const containerId = findContainer(overId, tasksRef.current) || findContainer(activeId, tasksRef.current);
      
      if (containerId) {
        const finalTasks = tasksRef.current;
        const activeIndex = finalTasks.findIndex((t) => t.id === activeId);
        
        try {
          const { error } = await supabase.from('tasks').update({ 
            status: containerId, 
            position: activeIndex 
          }).eq('id', activeId);
          
          if (error) throw error;
          showNotification('success', 'Posición guardada');
        } catch (err: any) {
          showNotification('error', 'Error al sincronizar: ' + err.message);
          fetchBoardData();
        }
      }
    }
    
    setActiveId(null);
  };

  const handleAddTask = (columnId: string) => {
    setEditingTask(null);
    setTargetColumn(columnId);
    setShowTaskModal(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const calculateDaysRemaining = (endDateStr: string | null) => {
    if (!endDateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr + 'T12:00:00');
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) return <div style={{ padding: '100px', textAlign: 'center', background: '#f8fafc' }}><div className="loading-spinner"></div> Cargando tablero...</div>;
  if (!project) return <div style={{ padding: '100px', textAlign: 'center', background: '#f8fafc' }}>Proyecto no encontrado</div>;


  const clientData = Array.isArray(project.clients) ? project.clients[0] : project.clients;

  const isHazu = clientData?.name?.toLowerCase().includes('hazu') || clientData?.reference_name?.toLowerCase().includes('hazu');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Board Header */}
      <div className="board-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div className="board-menu-top" style={{ margin: 0 }}>
            <div className="board-menu-item active">Tablero</div>
            <div className="board-menu-item" onClick={() => setShowGanttModal(true)}>Cronograma</div>
            <div className="board-menu-item">Documentos</div>
          </div>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
            <button 
              onClick={() => setViewMode('kanban')}
              style={{ padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700, border: 'none', background: viewMode === 'kanban' ? 'white' : 'transparent', color: viewMode === 'kanban' ? 'var(--primary-color)' : '#64748b', cursor: 'pointer', boxShadow: viewMode === 'kanban' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              <KanbanIcon size={16} /> Kanban
            </button>
            <button 
              onClick={() => setViewMode('table')}
              style={{ padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700, border: 'none', background: viewMode === 'table' ? 'white' : 'transparent', color: viewMode === 'table' ? 'var(--primary-color)' : '#64748b', cursor: 'pointer', boxShadow: viewMode === 'table' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              <TableIcon size={16} /> Tabla
            </button>
            <button 
              onClick={() => setViewMode('gantt')}
              style={{ padding: '8px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 700, border: 'none', background: viewMode === 'gantt' ? 'white' : 'transparent', color: viewMode === 'gantt' ? 'var(--primary-color)' : '#64748b', cursor: 'pointer', boxShadow: viewMode === 'gantt' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
            >
              <BarChart3 size={16} /> Gantt
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px', letterSpacing: '-0.03em' }}>{project.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-color)' }}>{clientData?.reference_name || clientData?.name || 'Cliente'}</span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>{clientData?.name || 'Sin encargado'}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
               <div style={{ position: 'relative' }}>
                 <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: '#94a3b8' }} />
                 <input type="text" placeholder="Buscar..." className="form-input" style={{ paddingLeft: '36px', width: '200px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', height: '38px', marginBottom: 0 }} />
               </div>
               <button className="btn btn-secondary" style={{ borderRadius: '12px', height: '38px' }} onClick={() => handleAddTask('todo')}><Plus size={16} /> Nueva Tarea</button>
            </div>
            {!isHazu && (
              <select 
                className="form-input"
                style={{ width: 'auto', minWidth: '150px', height: '32px', padding: '0 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', marginBottom: 0 }}
                value={project.status === 'Finalizado' || project.status === 'En Pausa' ? project.status : ''}
                onChange={async (e) => {
                  const newStatus = e.target.value;
                  const { error } = await supabase.from('projects').update({ status: newStatus || 'A tiempo' }).eq('id', project.id);
                  if (!error) {
                    setProject({ ...project, status: newStatus || 'A tiempo' });
                    showNotification('success', 'Estado del proyecto actualizado');
                  }
                }}
              >
                <option value="">Estado automático</option>
                <option value="Finalizado">Finalizado</option>
                <option value="En Pausa">En Pausa</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 48px 40px 48px' }}>
        {viewMode === 'kanban' && (
          <DndContext 
            collisionDetection={closestCorners} 
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd} 
            sensors={sensors}
          >
            <div className="board-container" style={{ padding: 0, height: '100%' }}>
              {COLUMNS.map(col => (
                <Column key={col.id} id={col.id} title={col.title} color={col.color} tasks={tasks.filter(t => t.status === col.id)} allTags={allTags} onEditTask={handleEditTask} onAddTask={() => handleAddTask(col.id)} />
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {activeId ? (
                <TaskCard 
                  task={tasks.find(t => t.id === activeId)!} 
                  allTags={allTags} 
                  onClick={() => {}} 
                  isOverlay 
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {viewMode === 'table' && (
          <TableView 
            tasks={tasks} 
            onEditTask={handleEditTask} 
            calculateDays={calculateDaysRemaining} 
          />
        )}

        {viewMode === 'gantt' && (
          <GanttView 
            tasks={tasks} 
            project={project}
            onEditTask={handleEditTask}
          />
        )}
      </div>

      {showTaskModal && (
        <TaskModal 
          projectId={projectId!}
          task={editingTask}
          initialStatus={targetColumn}
          onClose={() => { setShowTaskModal(false); fetchBoardData(); }}
          allTags={allTags}
          setAllTags={setAllTags}
          profiles={allProfiles}
          clientName={clientData?.reference_name || clientData?.name}
          clientData={clientData}
          existingInternalProjects={globalInternalProjects}
          projectPhases={project?.project_phases || []}
        />
      )}

      {showGanttModal && (
        <div className="modal-overlay">
          <div className="modal-content wide" style={{ padding: '32px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
               <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Cronograma del Proyecto</h2>
               <button className="modal-close" onClick={() => setShowGanttModal(false)}><X size={24} /></button>
             </div>
             {(() => {
               // Calculate phase progress based on task statuses
               const phases = project?.project_phases || [];
               const progressData: Record<string, number> = {};
               
               phases.forEach(phase => {
                 const phaseTasks = tasks.filter(t => t.phase_id === phase.id);
                 if (phaseTasks.length === 0) {
                   progressData[phase.id] = 0;
                 } else {
                   let totalProgress = 0;
                   phaseTasks.forEach(t => {
                     if (t.status === 'approved') totalProgress += 100;
                     else if (t.status === 'done') totalProgress += 80;
                     else if (t.status === 'doing') totalProgress += 50;
                   });
                   progressData[phase.id] = Math.round(totalProgress / phaseTasks.length);
                 }
               });

               return (
                 <GanttChart 
                   kickOffDate={project.delivery_date}
                   totalWeeks={project.duration_weeks}
                   phases={phases}
                   phaseProgress={progressData}
                 />
               );
             })()}
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ id, title, color, tasks, allTags, onEditTask, onAddTask }: any) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="board-column">
      <div className="column-header" style={{ padding: '20px 24px', background: `${color}10`, borderBottom: `2px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
           <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
           <span style={{ fontWeight: 800, color: '#1e293b' }}>{title}</span>
           <span style={{ background: 'white', color: '#64748b', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 800, border: '1px solid #e2e8f0' }}>
             {tasks.length}
           </span>
        </div>
        <button className="btn-icon" style={{ background: 'transparent', border: 'none', color: '#94a3b8' }}><MoreHorizontal size={18} /></button>
      </div>
      
      <div className="column-content" style={{ padding: '20px' }}>
        <SortableContext id={id} items={tasks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task: any) => (
            <TaskCard key={task.id} task={task} allTags={allTags} onClick={() => onEditTask(task)} />
          ))}
        </SortableContext>
        
        <button className="btn-add-card" onClick={onAddTask} style={{ border: '2px dashed #e2e8f0', background: 'transparent' }}>
          <Plus size={16} />
          <span>Agregar tarjeta</span>
        </button>
      </div>
    </div>
  );
}

function TaskCard({ task, allTags, onClick, isOverlay }: { task: Task, allTags: any[], onClick: () => void, isOverlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  
  const style = { 
    transform: CSS.Translate.toString(transform), 
    transition, 
    opacity: isDragging && !isOverlay ? 0.0 : 1,
    cursor: isOverlay ? 'grabbing' : 'pointer',
    userSelect: 'none' as any,
    WebkitUserSelect: 'none' as any,
    touchAction: 'none'
  };
  
  const taskTags = allTags.filter(t => (task.label_ids || []).includes(t.id));

  const calculateRemainingDays = () => {
    if (!task.due_date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.due_date + 'T12:00:00');
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysLeft = calculateRemainingDays();
  const dateColor = (daysLeft !== null && daysLeft < 7) ? '#ef4444' : '#94a3b8';

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`task-card ${isOverlay ? 'overlay' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onClick();
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {taskTags.map(t => (
            <div key={t.id} style={{ 
              height: '14px', 
              minWidth: '32px', 
              padding: '0 8px', 
              borderRadius: '4px', 
              background: t.color,
              color: 'white',
              fontSize: '9px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {t.name.substring(0, 3).toUpperCase()}
            </div>
          ))}
        </div>
        <div style={{ color: '#cbd5e1' }}>
          <GripVertical size={14} />
        </div>
      </div>
      
      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem', lineHeight: '1.4', pointerEvents: 'none' }}>{task.title}</div>
      
      {task.description && (
        <div className="task-desc-preview" style={{ fontSize: '0.8rem', pointerEvents: 'none' }}>{task.description}</div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {task.due_date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: dateColor, fontSize: '0.7rem', fontWeight: 800 }}>
              <Clock size={12} />
              <span>{new Date(task.due_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
            </div>
          )}
          {task.checklists && task.checklists.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>
              <CheckSquare size={12} />
              <span>{task.checklists.completed}/{task.checklists.total}</span>
            </div>
          )}
        </div>
        
        {task.assigned_to && (
          <div className="avatar" style={{ width: '24px', height: '24px', fontSize: '10px', margin: 0, border: 'none', background: '#f1f5f9' }}>
             {task.profiles?.full_name?.charAt(0) || '?'}
          </div>
        )}
      </div>
    </div>
  );
}

function TableView({ tasks, onEditTask, calculateDays }: any) {
  return (
    <div style={{ background: 'white', borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', height: '100%', overflowY: 'auto' }}>
      <table className="table">
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ padding: '16px 24px' }}>TAREA</th>
            <th>INICIO</th>
            <th>DEADLINE</th>
            <th>TIEMPO RESTANTE</th>
            <th style={{ textAlign: 'center' }}>% CHECKLIST</th>
            <th>ESTADO</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task: any) => {
            const daysLeft = calculateDays(task.due_date);
            const progress = task.checklists?.total > 0 ? Math.round((task.checklists.completed / task.checklists.total) * 100) : (task.status === 'done' ? 100 : 0);
            
            return (
              <tr key={task.id} onClick={() => onEditTask(task)} style={{ cursor: 'pointer' }}>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#1e293b' }}>{task.title}</td>
                <td style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                   {task.start_date ? new Date(task.start_date + 'T12:00:00').toLocaleDateString('es-ES') : '-'}
                </td>
                <td style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                   {task.due_date ? new Date(task.due_date + 'T12:00:00').toLocaleDateString('es-ES') : '-'}
                </td>
                <td>
                  {daysLeft !== null ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '8px', background: daysLeft < 0 ? '#fef2f2' : daysLeft < 10 ? '#fff7ed' : '#f0fdf4', color: daysLeft < 0 ? '#ef4444' : daysLeft < 10 ? '#f97316' : '#16a34a', fontSize: '0.75rem', fontWeight: 800 }}>
                      <Timer size={14} />
                      {daysLeft < 0 ? `Retrasado (${Math.abs(daysLeft)}d)` : `${daysLeft} días`}
                    </div>
                  ) : '-'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '120px', margin: '0 auto' }}>
                    <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary-color)' }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>{progress}%</span>
                  </div>
                </td>
                <td>
                   <span style={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 800, color: COLUMNS.find(c => c.id === task.status)?.color }}>
                     {COLUMNS.find(c => c.id === task.status)?.title}
                   </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GanttView({ tasks, project, onEditTask }: any) {
  // Simple Task Gantt Implementation
  const sortedTasks = [...tasks].sort((a, b) => {
    const da = new Date(a.start_date || a.created_at).getTime();
    const db = new Date(b.start_date || b.created_at).getTime();
    return da - db;
  });

  if (sortedTasks.length === 0) return <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '20px' }}>No hay tareas para mostrar en el cronograma.</div>;

  const projectStart = new Date(project.delivery_date + 'T00:00:00');
  const projectEnd = new Date(project.end_date + 'T23:59:59');
  const totalDays = Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  return (
    <div style={{ background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', display: 'flex', height: '100%', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
      {/* Task List Column */}
      <div style={{ width: '300px', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: '0.85rem', color: '#94a3b8' }}>TAREAS</div>
        <div style={{ overflowY: 'auto' }}>
          {sortedTasks.map(t => (
            <div key={t.id} onClick={() => onEditTask(t)} style={{ padding: '16px 24px', borderBottom: '1px solid #f8fafc', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </div>
          ))}
        </div>
      </div>

      {/* Gantt Chart Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
        {/* Dates Header */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', minWidth: 'fit-content' }}>
          {Array.from({ length: totalDays }).map((_, i) => {
            const date = new Date(projectStart);
            date.setDate(date.getDate() + i);
            const isToday = new Date().toDateString() === date.toDateString();
            return (
              <div key={i} style={{ minWidth: '40px', padding: '12px 0', textAlign: 'center', borderRight: '1px solid #f8fafc', background: isToday ? '#eff6ff' : 'transparent' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: isToday ? 'var(--primary-color)' : '#94a3b8' }}>{date.toLocaleDateString('es-ES', { weekday: 'narrow' })}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: isToday ? 'var(--primary-color)' : '#475569' }}>{date.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        <div style={{ overflowY: 'auto', flex: 1, minWidth: 'fit-content', position: 'relative' }}>
          {/* Today Indicator Line */}
          {(() => {
            const today = new Date();
            const daysFromStart = Math.floor((today.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
            if (daysFromStart >= 0 && daysFromStart < totalDays) {
              return <div style={{ position: 'absolute', left: `${daysFromStart * 40 + 20}px`, top: 0, bottom: 0, width: '2px', background: '#ef4444', zIndex: 10, opacity: 0.5 }}></div>;
            }
          })()}

          {sortedTasks.map(t => {
            const start = new Date((t.start_date || t.created_at) + 'T00:00:00');
            const end = new Date((t.due_date || t.start_date || t.created_at) + 'T23:59:59');
            const left = Math.max(0, Math.floor((start.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24)) * 40);
            const width = Math.max(40, (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1) * 40);
            const progress = t.checklists?.total > 0 ? (t.checklists.completed / t.checklists.total) : (t.status === 'done' ? 1 : 0);
            const color = COLUMNS.find(c => c.id === t.status)?.color || 'var(--primary-color)';

            return (
              <div key={t.id} style={{ height: '52px', borderBottom: '1px solid #f8fafc', position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{ 
                  position: 'absolute', 
                  left: `${left + 4}px`, 
                  width: `${width - 8}px`, 
                  height: '24px', 
                  background: `${color}20`, 
                  borderRadius: '12px',
                  border: `1.5px solid ${color}`,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 8px'
                }}>
                   {/* Progress fill */}
                   <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progress * 100}%`, background: color, opacity: 0.3 }}></div>
                   <span style={{ fontSize: '0.65rem', fontWeight: 800, color: color, position: 'relative' }}>{Math.round(progress * 100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TaskModal({ projectId, task, initialStatus, onClose, allTags, setAllTags, profiles, clientName, clientData, existingInternalProjects = [], projectPhases = [] }: any) {
  const { showNotification } = useNotification();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || initialStatus);
  const [startDate, setStartDate] = useState(task?.start_date || new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [dueTime] = useState(task?.due_time || '');
  const [selectedLabels, setSelectedLabels] = useState<string[]>(task?.label_ids || []);
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || '');
  const [priorityLevel, setPriorityLevel] = useState(task?.priority_level || 'media');
  const [internalProjectName, setInternalProjectName] = useState(task?.internal_project_name || '');
  const [phaseId, setPhaseId] = useState(task?.phase_id || '');
  const [showNewInternalInput, setShowNewInternalInput] = useState(!existingInternalProjects.length || (task && task.internal_project_name && !existingInternalProjects.includes(task.internal_project_name)));
  
  const nameStr = clientData?.name || clientName || '';
  const refStr = clientData?.reference_name || '';
  const combinedStr = `${nameStr} ${refStr}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const isHazu = combinedStr.includes('hazu');
  
  const [checklists, setChecklists] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(TAG_COLORS[0]);
  const [showNewLabel, setShowNewLabel] = useState(false);
  
  // Tag management
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);

  // Searchable Collaborator Select
  const [showCollabSearch, setShowCollabSearch] = useState(false);
  const [collabQuery, setCollabQuery] = useState('');
  const collabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      fetchTaskDetails();
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (collabRef.current && !collabRef.current.contains(event.target as Node)) {
        setShowCollabSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [task]);

  const fetchTaskDetails = async () => {
    const [checkRes, commRes] = await Promise.all([
      supabase.from('task_checklists').select('*').eq('task_id', task.id).order('order_index'),
      supabase.from('task_comments').select('*, profiles(full_name)').eq('task_id', task.id).order('created_at')
    ]);
    if (checkRes.data) setChecklists(checkRes.data);
    if (commRes.data) setComments(commRes.data);
  };

  const handleSave = async () => {
    const taskData = {
      project_id: projectId,
      title,
      description,
      status,
      start_date: startDate || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      label_ids: selectedLabels,
      assigned_to: assignedTo || null,
      priority_level: priorityLevel,
      internal_project_name: internalProjectName,
      phase_id: phaseId || null,
    };

    let savedTaskId = task?.id;

    try {
      if (task) {
        await supabase.from('tasks').update(taskData).eq('id', task.id);
        showNotification('success', 'Tarea actualizada');
      } else {
        const { data, error } = await supabase.from('tasks').insert([taskData]).select().single();
        if (error) throw error;
        if (data) {
          savedTaskId = data.id;
          showNotification('success', 'Tarea creada');
        }
      }

      if (savedTaskId) {
        for (const item of checklists) {
          const itemData = { ...item, task_id: savedTaskId };
          const isNew = typeof item.id === 'number';
          if (isNew) {
             const { id, ...rest } = itemData;
             await supabase.from('task_checklists').insert([rest]);
          } else {
             await supabase.from('task_checklists').update(itemData).eq('id', item.id);
          }
        }
      }
      onClose();
    } catch (err: any) {
      showNotification('error', 'Error al guardar tarea: ' + err.message);
    }
  };

  const addChecklistItem = (content?: string | React.MouseEvent) => {
    const textContent = typeof content === 'string' && content.trim() !== '' ? content : 'Nueva sub-tarea';
    const newItem = { 
      id: Math.random(), 
      content: textContent, 
      is_completed: false, 
      order_index: checklists.length 
    };
    setChecklists([...checklists, newItem]);
  };

  const updateChecklistItem = (id: any, updates: any) => {
    setChecklists(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteChecklistItem = async (id: any) => {
    try {
      if (typeof id === 'string') {
        await supabase.from('task_checklists').delete().eq('id', id);
      }
      setChecklists(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      showNotification('error', 'Error al eliminar item');
    }
  };

  const handleAddComment = async () => {
    if (!newComment || !task) return;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase.from('task_comments').insert([{
      task_id: task.id,
      user_id: userData.user.id,
      content: newComment
    }]).select('*, profiles(full_name)').single();

    if (data) {
      setComments([...comments, data]);
      setNewComment('');
    }
  };

  const handleCreateLabel = async () => {
    if (!newLabelName) return;
    try {
      if (editingTagId) {
        const { error } = await supabase.from('tags').update({
          name: newLabelName,
          color: newLabelColor
        }).eq('id', editingTagId);
        
        if (error) throw error;
        setAllTags(allTags.map((t: any) => t.id === editingTagId ? { ...t, name: newLabelName, color: newLabelColor } : t));
        showNotification('success', 'Etiqueta actualizada');
      } else {
        const { data, error } = await supabase.from('tags').insert([{ 
          name: newLabelName, 
          color: newLabelColor,
          type: 'task'
        }]).select().single();
        
        if (error) throw error;
        if (data) {
          setSelectedLabels([...selectedLabels, data.id]);
          setAllTags([...allTags, data]);
          showNotification('success', 'Etiqueta creada');
        }
      }
      setNewLabelName('');
      setEditingTagId(null);
      setShowNewLabel(false);
    } catch (err: any) {
      showNotification('error', 'Error: ' + err.message);
    }
  };

  const handleDeleteTag = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagToDelete(id);
  };

  const confirmDeleteTag = async () => {
    if (!tagToDelete) return;
    try {
      const { error } = await supabase.from('tags').delete().eq('id', tagToDelete);
      if (error) throw error;
      setAllTags(allTags.filter((t: any) => t.id !== tagToDelete));
      setSelectedLabels(selectedLabels.filter(sid => sid !== tagToDelete));
      showNotification('success', 'Etiqueta eliminada');
    } catch (err: any) {
      showNotification('error', 'Error al eliminar');
    } finally {
      setTagToDelete(null);
    }
  };

  const handleEditTag = (tag: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTagId(tag.id);
    setNewLabelName(tag.name);
    setNewLabelColor(tag.color);
    setShowNewLabel(true);
  };

  const filteredProfiles = (profiles || []).filter((p: any) => 
    (p.full_name || '').toLowerCase().includes((collabQuery || '').toLowerCase()) || 
    (p.email || '').toLowerCase().includes((collabQuery || '').toLowerCase())
  );

  const selectedCollab = profiles.find((p: any) => p.id === assignedTo);

  return (
    <div className="modal-overlay">
      <div className="modal-content wide" style={{ height: '90vh', borderRadius: '32px', padding: 0, overflow: 'hidden' }}>
        <div className="modal-header" style={{ padding: '24px 48px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1 }}>
             <div style={{ 
               background: 'var(--primary-color)', 
               color: 'white', 
               width: '36px', 
               height: '36px', 
               borderRadius: '10px',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center'
             }}>
               <CheckSquare size={18} />
             </div>
             <div style={{ flex: 1 }}>
               <input 
                 type="text" 
                 className="modal-title" 
                 value={title} 
                 onChange={e => setTitle(e.target.value)} 
                 style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}
                 placeholder="Título de la tarea"
               />
               <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>Cliente Detectado: {clientData?.reference_name || clientData?.name || clientName || 'Ninguno'}</p>
             </div>
           </div>
           <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
             <button className="btn btn-primary" style={{ padding: '10px 32px', borderRadius: '14px', fontWeight: 700 }} onClick={handleSave}>Guardar Tarea</button>
             <button className="modal-close" style={{ background: 'transparent', color: '#94a3b8', border: 'none', padding: '4px', cursor: 'pointer' }} onClick={onClose}><X size={24} /></button>
           </div>
        </div>
        
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '0', padding: '0', height: 'calc(100% - 85px)', overflow: 'hidden' }}>
          <div style={{ padding: '40px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '40px', borderRight: '1px solid #e2e8f0' }}>
            <section>
              <div className="card-title" style={{ fontSize: '0.9rem', marginBottom: '16px' }}>
                <div style={{ 
                  background: '#eff6ff', 
                  color: '#3b82f6', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginRight: '12px' 
                }}>
                  <Info size={16} />
                </div>
                Descripción
              </div>
              <textarea 
                className="form-input" 
                style={{ minHeight: '140px', resize: 'vertical', background: '#f8fafc', border: '2px solid #f1f5f9', padding: '20px', fontSize: '1rem', borderRadius: '18px', lineHeight: '1.5' }}
                placeholder="Añade una descripción detallada..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </section>

            <section>
              <div className="card-title" style={{ fontSize: '0.9rem', marginBottom: '20px' }}>
                <div style={{ 
                  background: '#fff7ed', 
                  color: '#f97316', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginRight: '12px' 
                }}>
                  <MessageSquare size={16} />
                </div>
                Comentarios
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {comments.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: '12px' }}>
                    <div className="avatar" style={{ margin: 0, width: '32px', height: '32px', background: '#f1f5f9', fontSize: '12px' }}>{c.profiles?.full_name?.charAt(0) || '?'}</div>
                    <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', flex: 1, border: '1px solid #f1f5f9' }}>
                       <div style={{ fontWeight: 800, fontSize: '0.75rem', marginBottom: '4px', color: '#475569' }}>{c.profiles?.full_name || 'Usuario'}</div>
                       <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: '1.5' }}>{c.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', background: 'white', padding: '8px', borderRadius: '14px', border: '2px solid #f1f5f9' }}>
                <input 
                  className="form-input" 
                  placeholder="Escribe un comentario..." 
                  style={{ background: 'transparent', border: 'none', padding: '4px', marginBottom: 0, fontSize: '0.9rem' }}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                />
                <button className="btn btn-primary" style={{ width: '34px', height: '34px', padding: 0, borderRadius: '10px' }} onClick={handleAddComment}><Send size={16} /></button>
              </div>
            </section>
          </div>

          <div style={{ background: '#f8fafc', padding: '32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>PROCESO</label>
                  <select className="form-input" value={status} onChange={e => setStatus(e.target.value)} style={{ background: 'white', fontWeight: 700, borderRadius: '10px', fontSize: '0.85rem', height: '42px', lineHeight: '42px', padding: '0 12px' }}>
                    {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                  <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>ETAPA DEL PROYECTO</label>
                  <select className="form-input" value={phaseId} onChange={e => setPhaseId(e.target.value)} style={{ background: 'white', fontWeight: 700, borderRadius: '10px', fontSize: '0.85rem', height: '42px', lineHeight: '42px', padding: '0 12px' }}>
                    <option value="">Sin etapa asignada</option>
                    {projectPhases.map((phase: any) => (
                      <option key={phase.id} value={phase.id}>{phase.name}</option>
                    ))}
                  </select>
                </div>
             </div>

             <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
               <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>PRIORIDAD / TIPO</label>
               <select className="form-input" value={priorityLevel} onChange={e => setPriorityLevel(e.target.value)} style={{ background: 'white', fontWeight: 700, borderRadius: '10px', fontSize: '0.85rem', height: '42px', lineHeight: '42px', padding: '0 12px' }}>
                 <option value="baja">Baja</option>
                 <option value="media">Media</option>
                 <option value="alta">Alta</option>
                 <option value="urgente">Urgente</option>
               </select>
             </div>

            {isHazu && (
              <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#3b82f6', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>PROYECTO INTERNO</label>
                <div style={{ position: 'relative' }}>
                  <Briefcase size={14} style={{ position: 'absolute', left: '12px', top: '14px', color: '#3b82f6' }} />
                  {showNewInternalInput ? (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="Escribe el nombre del proyecto..." 
                        value={internalProjectName} 
                        onChange={e => setInternalProjectName(e.target.value)} 
                        style={{ background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e40af', fontWeight: 700, borderRadius: '10px', height: '42px', padding: '0 12px 0 36px', fontSize: '0.85rem', width: '100%' }} 
                      />
                      {existingInternalProjects.length > 0 && (
                        <button type="button" onClick={() => { setShowNewInternalInput(false); setInternalProjectName(''); }} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: '0 8px' }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  ) : (
                    <select 
                      className="form-input" 
                      value={internalProjectName}
                      onChange={e => {
                        if (e.target.value === 'NEW_PROJECT') {
                          setShowNewInternalInput(true);
                          setInternalProjectName('');
                        } else {
                          setInternalProjectName(e.target.value);
                        }
                      }}
                      style={{ background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e40af', fontWeight: 700, borderRadius: '10px', height: '42px', padding: '0 12px 0 36px', fontSize: '0.85rem', width: '100%', appearance: 'none' }} 
                    >
                      <option value="">Seleccionar proyecto...</option>
                      {existingInternalProjects.map((name: string) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                      <option value="NEW_PROJECT">➕ Agregar uno nuevo...</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
               <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                 <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>INICIO</label>
                 <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: 'white', fontWeight: 700, borderRadius: '10px', height: '42px', padding: '0 12px', fontSize: '0.85rem' }} />
               </div>
               <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                 <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>VENCIMIENTO</label>
                 <input type="date" className="form-input" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ background: 'white', fontWeight: 700, borderRadius: '10px', height: '42px', padding: '0 12px', fontSize: '0.85rem' }} />
               </div>
            </div>

            <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>COLABORADOR</label>
              <div style={{ position: 'relative' }} ref={collabRef}>
                <div 
                  onClick={() => setShowCollabSearch(!showCollabSearch)}
                  style={{ 
                    background: 'white', 
                    fontWeight: 700, 
                    borderRadius: '10px', 
                    fontSize: '0.85rem', 
                    height: '42px', 
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={16} color="#94a3b8" />
                    <span>{selectedCollab?.full_name || 'Sin asignar'}</span>
                  </div>
                  <ChevronDown size={16} color="#94a3b8" />
                </div>

                {showCollabSearch && (
                  <div style={{ 
                    position: 'absolute', 
                    top: '48px', 
                    left: 0, 
                    right: 0, 
                    background: 'white', 
                    borderRadius: '12px', 
                    border: '1px solid #e2e8f0', 
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    padding: '12px',
                    animation: 'fadeIn 0.2s ease'
                  }}>
                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                      <input 
                        type="text" 
                        placeholder="Buscar colaborador..." 
                        style={{ width: '100%', height: '34px', paddingLeft: '32px', borderRadius: '8px', border: '1px solid #f1f5f9', fontSize: '0.8rem', outline: 'none' }}
                        value={collabQuery}
                        onChange={e => setCollabQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div 
                        onClick={() => { setAssignedTo(''); setShowCollabSearch(false); }}
                        style={{ padding: '8px 10px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', background: assignedTo === '' ? '#eff6ff' : 'transparent', color: assignedTo === '' ? '#3b82f6' : '#475569', fontWeight: 600 }}
                      >
                        Sin asignar
                      </div>
                      {filteredProfiles.map((p: any) => (
                        <div 
                          key={p.id}
                          onClick={() => { setAssignedTo(p.id); setShowCollabSearch(false); }}
                          style={{ 
                            padding: '8px 10px', 
                            borderRadius: '6px', 
                            fontSize: '0.85rem', 
                            cursor: 'pointer', 
                            background: assignedTo === p.id ? '#eff6ff' : 'transparent', 
                            color: assignedTo === p.id ? '#3b82f6' : '#475569', 
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                        >
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem' }}>
                            {p.full_name.charAt(0)}
                          </div>
                          {p.full_name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '6px', letterSpacing: '0.05em' }}>DOCUMENTOS</label>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%', justifyContent: 'center', height: '42px', borderRadius: '12px', border: '2px dashed #cbd5e1', background: 'white' }}
                onClick={() => alert('Próximamente carga de archivos...')}
              >
                <AttachIcon size={16} style={{ marginRight: '8px' }} />
                Añadir documentos
              </button>
            </div>

            <div className="form-card" style={{ border: 'none', padding: 0, background: 'transparent' }}>
              <label style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '8px', letterSpacing: '0.05em' }}>ETIQUETAS</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {allTags.map((tag: any) => (
                  <div key={tag.id} style={{ position: 'relative', display: 'flex' }}>
                    <div 
                      onClick={() => setSelectedLabels(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                      className="tag-button"
                      style={{ 
                        padding: '6px 10px', 
                        borderRadius: '8px', 
                        fontSize: '0.65rem', 
                        fontWeight: 800, 
                        background: selectedLabels.includes(tag.id) ? tag.color : 'white',
                        color: selectedLabels.includes(tag.id) ? 'white' : '#64748b',
                        border: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {tag.name}
                      <div className="tag-actions" style={{ display: 'flex', gap: '4px', marginLeft: '4px', paddingLeft: '4px', borderLeft: `1px solid ${selectedLabels.includes(tag.id) ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)'}` }}>
                        <span onClick={(e) => { e.stopPropagation(); handleEditTag(tag, e); }} style={{ opacity: 0.8, cursor: 'pointer', padding: '2px' }}><Edit2 size={12} /></span>
                        <span onClick={(e) => { e.stopPropagation(); handleDeleteTag(tag.id, e); }} style={{ opacity: 0.8, cursor: 'pointer', padding: '2px' }}><Trash2 size={12} /></span>
                      </div>
                    </div>
                  </div>
                ))}
                <button className="btn btn-secondary" style={{ padding: '6px 10px', borderRadius: '8px', height: '28px' }} onClick={() => { setEditingTagId(null); setNewLabelName(''); setShowNewLabel(!showNewLabel); }}><Plus size={14} /></button>
              </div>
              
              {showNewLabel && (
                <div style={{ background: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>{editingTagId ? 'EDITAR ETIQUETA' : 'NUEVA ETIQUETA'}</span>
                    <button onClick={() => { setShowNewLabel(false); setEditingTagId(null); }} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><X size={14} /></button>
                  </div>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Nombre etiqueta..." 
                    value={newLabelName} 
                    onChange={e => setNewLabelName(e.target.value)} 
                    style={{ marginBottom: 0, fontSize: '0.85rem', height: '36px' }} 
                    autoFocus
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                    {TAG_COLORS.map(c => (
                      <div 
                        key={c} 
                        onClick={() => setNewLabelColor(c)}
                        style={{ 
                          height: '20px', 
                          borderRadius: '4px', 
                          background: c, 
                          cursor: 'pointer',
                          border: newLabelColor === c ? '2px solid #000' : 'none',
                          transition: 'transform 0.1s'
                        }}
                      ></div>
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={handleCreateLabel} style={{ fontSize: '0.75rem', padding: '8px' }}>
                    {editingTagId ? 'Actualizar' : 'Crear Etiqueta'}
                  </button>
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

            <section>
              <div className="card-title" style={{ justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ 
                    background: '#f0fdf4', 
                    color: '#16a34a', 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '8px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <CheckSquare size={16} />
                  </div>
                  Checklist
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    type="text"
                    className="form-input"
                    placeholder="Nuevo elemento... (Enter para añadir)"
                    style={{ marginBottom: 0, padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', height: '28px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
                        addChecklistItem(e.currentTarget.value.trim());
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: '8px', height: '28px' }} onClick={() => {
                    const input = document.querySelector('input[placeholder="Nuevo elemento... (Enter para añadir)"]') as HTMLInputElement;
                    if (input && input.value.trim() !== '') {
                      addChecklistItem(input.value.trim());
                      input.value = '';
                    } else {
                      addChecklistItem();
                    }
                  }}>+ Añadir</button>
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div style={{ flex: 1, height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${checklists.length ? (checklists.filter(c => c.is_completed).length / checklists.length) * 100 : 0}%`,
                        height: '100%',
                        background: '#16a34a',
                        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#16a34a' }}>
                      {Math.round(checklists.length ? (checklists.filter(c => c.is_completed).length / checklists.length) * 100 : 0)}%
                    </span>
                 </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {checklists.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <input 
                      type="checkbox" 
                      checked={item.is_completed} 
                      onChange={() => updateChecklistItem(item.id, { is_completed: !item.is_completed })} 
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }} 
                    />
                    <input 
                      type="text" 
                      className="form-input" 
                      value={item.content} 
                      onChange={e => updateChecklistItem(item.id, { content: e.target.value })}
                      style={{ 
                        border: 'none', 
                        background: 'transparent', 
                        padding: 0, 
                        marginBottom: 0, 
                        fontSize: '0.85rem', 
                        fontWeight: 600, 
                        textDecoration: item.is_completed ? 'line-through' : 'none', 
                        color: item.is_completed ? '#94a3b8' : '#1e293b',
                        width: '100%',
                        outline: 'none',
                        height: 'auto'
                      }}
                    />
                    <button 
                      onClick={() => deleteChecklistItem(item.id)}
                      style={{ border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      
      <ConfirmModal 
        isOpen={tagToDelete !== null}
        title="Eliminar Etiqueta"
        message="¿Estás seguro de eliminar esta etiqueta permanentemente?"
        confirmText="Eliminar"
        isDestructive={true}
        onConfirm={confirmDeleteTag}
        onClose={() => setTagToDelete(null)}
      />
    </div>
  );
}
