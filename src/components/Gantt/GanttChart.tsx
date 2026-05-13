

interface Phase {
  id?: string;
  name: string;
  duration_weeks: number;
}

interface GanttChartProps {
  kickOffDate: string;
  totalWeeks: number;
  phases: Phase[];
  phaseProgress?: Record<string, number>;
}

const PHASE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

export default function GanttChart({ kickOffDate, totalWeeks, phases, phaseProgress = {} }: GanttChartProps) {
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  const startDate = new Date(kickOffDate + 'T12:00:00');
  
  const day = startDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(startDate);
  monday.setDate(startDate.getDate() + diff);

  const sumPhasesWeeks = phases.reduce((acc, p) => acc + p.duration_weeks, 0);
  const displayWeeks = Math.max(totalWeeks, sumPhasesWeeks, 1);

  const weeks = Array.from({ length: displayWeeks }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + (i * 7));
    return d;
  });

  const calculateTodayPosition = () => {
    const today = new Date();
    const startTime = monday.getTime();
    const endTime = startTime + (displayWeeks * 7 * 24 * 60 * 60 * 1000);
    
    if (today.getTime() < startTime || today.getTime() > endTime) return null;
    
    const percentage = ((today.getTime() - startTime) / (endTime - startTime)) * 100;
    return `${percentage}%`;
  };

  const todayPos = calculateTodayPosition();

  // Dynamic week width based on total weeks to avoid scroll on large screens
  // If weeks are few, they take more space. If many, they have a minimum.


  return (
    <div className="gantt-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', width: '100%' }}>
      <div className="gantt-header">
        <div className="gantt-label-col" style={{ backgroundColor: '#fcfdfe', textTransform: 'none', width: '150px', minWidth: '150px' }}>Etapas</div>
        <div className="gantt-timeline-col" style={{ width: '100%', flex: 1, minWidth: 0 }}>
          {weeks.map((w, i) => (
            <div key={i} className="gantt-week-header" style={{ borderRight: '1px solid #f1f5f9', flex: 1, minWidth: 0, textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                {capitalize(w.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }))}
              </div>
              <div style={{ fontWeight: 800, fontSize: '10px', color: '#1e293b' }}>S{i + 1}</div>
            </div>
          ))}
          {todayPos && <div className="gantt-today-line" style={{ left: todayPos }}></div>}
        </div>
      </div>

      <div className="gantt-body">
        {phases.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No hay fases configuradas.
          </div>
        ) : (
          phases.map((phase, idx) => {
            const previousDuration = phases.slice(0, idx).reduce((acc, p) => acc + p.duration_weeks, 0);
            const startPct = (previousDuration / displayWeeks) * 100;
            const widthPct = (phase.duration_weeks / displayWeeks) * 100;
            const color = PHASE_COLORS[idx % PHASE_COLORS.length];
            

            // Removed weekLabel since user wants S1, S2 at top and percentage on bar.
            
            const progress = phase.id && phaseProgress[phase.id] !== undefined ? phaseProgress[phase.id] : 0;

            return (
              <div key={idx} className="gantt-row">
                <div className="gantt-label-col" style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b', width: '150px', minWidth: '150px' }}>
                  {capitalize(phase.name || `Etapa ${idx + 1}`)}
                </div>
                <div className="gantt-timeline-col" style={{ padding: '10px 0', width: '100%', flex: 1, minWidth: 0 }}>
                  <div 
                    className="gantt-phase-bar" 
                    style={{ 
                      marginLeft: `${startPct}%`, 
                      width: `${widthPct}%`,
                      background: color,
                      boxShadow: `0 4px 6px -1px ${color}30`,
                      border: `1px solid ${color}50`,
                      borderRadius: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'white', fontWeight: 800, padding: '0 8px' }}>
                      {progress}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
