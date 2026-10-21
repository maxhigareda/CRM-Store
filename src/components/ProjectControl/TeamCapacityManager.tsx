import { useState, useEffect } from 'react';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Briefcase, 
  ChevronDown, 
  ChevronUp, 
  Search,
  ShieldAlert
} from 'lucide-react';
import { getCollaboratorWeeklyCapacity } from '../../utils/timeTrackingService';
import type { ResourceCapacity } from '../../types/projectControl';

interface TeamCapacityManagerProps {
  profiles: any[];
}

export default function TeamCapacityManager({ profiles }: TeamCapacityManagerProps) {
  const [capacities, setCapacities] = useState<ResourceCapacity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'overallocated' | 'available'>('all');

  useEffect(() => {
    fetchTeamCapacities();
  }, [profiles]);

  const fetchTeamCapacities = async () => {
    setLoading(true);
    try {
      const results: ResourceCapacity[] = [];
      for (const p of profiles) {
        const cap = await getCollaboratorWeeklyCapacity(
          p.id,
          p.full_name || p.email,
          p.email
        );
        results.push(cap);
      }
      setCapacities(results);
    } catch (err) {
      console.error('Error fetching team capacities:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCapacities = capacities.filter((c) => {
    const matchesSearch = c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'overallocated') return c.is_overallocated;
    if (filterMode === 'available') return c.occupancy_pct < 80;
    return true;
  });

  const overallocatedCount = capacities.filter((c) => c.is_overallocated).length;
  const avgOccupancy = capacities.length > 0
    ? Math.round(capacities.reduce((acc, c) => acc + c.occupancy_pct, 0) / capacities.length)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Equipo Monitoreado</span>
            <Users size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
            {capacities.length} Colaboradores
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            Capacidad base: 40h/semana (160h/mes)
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: overallocatedCount > 0 ? '#fef2f2' : 'white', border: overallocatedCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: overallocatedCount > 0 ? '#b91c1c' : '#64748b', textTransform: 'uppercase' }}>Sobreasignados (&gt;100%)</span>
            <ShieldAlert size={18} color={overallocatedCount > 0 ? '#dc2626' : '#94a3b8'} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: overallocatedCount > 0 ? '#dc2626' : '#0f172a' }}>
            {overallocatedCount} en Alerta
          </div>
          <div style={{ fontSize: '0.75rem', color: overallocatedCount > 0 ? '#b91c1c' : '#64748b', marginTop: '2px' }}>
            {overallocatedCount > 0 ? 'Requieren redistribución inmediata' : 'Carga balanceada en el equipo'}
          </div>
        </div>

        <div className="form-card" style={{ padding: '16px 20px', borderRadius: '16px', background: 'white', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Ocupación Promedio</span>
            <Clock size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: avgOccupancy > 100 ? '#dc2626' : '#0f172a' }}>
            {avgOccupancy}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            {avgOccupancy > 90 ? 'Capacidad al límite' : 'Margen para nuevos alcances'}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div 
        style={{ 
          background: 'white', 
          padding: '14px 20px', 
          borderRadius: '16px', 
          border: '1px solid #e2e8f0', 
          display: 'flex', 
          flexWrap: 'wrap', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '12px' 
        }}
      >
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: '#94a3b8' }} />
          <input
            type="text"
            className="form-input"
            style={{ width: '100%', paddingLeft: '34px', height: '38px', borderRadius: '10px', fontSize: '0.85rem' }}
            placeholder="Buscar colaborador..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilterMode('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              background: filterMode === 'all' ? '#1e293b' : '#f1f5f9',
              color: filterMode === 'all' ? 'white' : '#475569',
              cursor: 'pointer'
            }}
          >
            Todos ({capacities.length})
          </button>
          <button
            onClick={() => setFilterMode('overallocated')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              background: filterMode === 'overallocated' ? '#dc2626' : '#fef2f2',
              color: filterMode === 'overallocated' ? 'white' : '#dc2626',
              cursor: 'pointer'
            }}
          >
            ⚠️ Sobreasignados ({overallocatedCount})
          </button>
          <button
            onClick={() => setFilterMode('available')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              background: filterMode === 'available' ? '#15803d' : '#f0fdf4',
              color: filterMode === 'available' ? 'white' : '#15803d',
              cursor: 'pointer'
            }}
          >
            Disponibles (&lt;80%)
          </button>
        </div>
      </div>

      {/* Collaborators List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            Calculando capacidad semanal de cada recurso sumando todos sus proyectos...
          </div>
        ) : filteredCapacities.length === 0 ? (
          <div style={{ background: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', color: '#94a3b8' }}>
            No se encontraron colaboradores con el filtro seleccionado.
          </div>
        ) : (
          filteredCapacities.map((cap) => {
            const isExpanded = expandedProfileId === cap.profile_id;
            const barColor = cap.occupancy_pct > 100 
              ? '#dc2626' 
              : cap.occupancy_pct >= 80 
              ? '#f59e0b' 
              : '#10b981';

            return (
              <div 
                key={cap.profile_id}
                style={{ 
                  background: 'white', 
                  borderRadius: '16px', 
                  border: cap.is_overallocated ? '2px solid #fecaca' : '1px solid #e2e8f0', 
                  overflow: 'hidden',
                  boxShadow: cap.is_overallocated ? '0 4px 12px rgba(220, 38, 38, 0.08)' : 'none'
                }}
              >
                {/* Main Row */}
                <div 
                  onClick={() => setExpandedProfileId(isExpanded ? null : cap.profile_id)}
                  style={{ 
                    padding: '16px 20px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: cap.is_overallocated ? '#fffdfd' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '240px' }}>
                    <div 
                      style={{ 
                        width: '42px', 
                        height: '42px', 
                        borderRadius: '50%', 
                        background: cap.is_overallocated ? '#fee2e2' : '#f1f5f9', 
                        color: cap.is_overallocated ? '#dc2626' : '#475569', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '0.9rem'
                      }}
                    >
                      {cap.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                        {cap.full_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {cap.email}
                      </div>
                    </div>
                  </div>

                  {/* Progress & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1, maxWidth: '420px', margin: '0 20px' }}>
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '6px' }}>
                        <span style={{ color: '#475569' }}>
                          {cap.weekly_assigned_hours}h asignadas / 40h máx
                        </span>
                        <span style={{ color: barColor, fontWeight: 800 }}>
                          {cap.occupancy_pct}%
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div 
                          style={{ 
                            width: `${Math.min(100, cap.occupancy_pct)}%`, 
                            height: '100%', 
                            background: barColor,
                            borderRadius: '4px'
                          }} 
                        />
                      </div>
                    </div>

                    {/* Badge */}
                    <div style={{ minWidth: '130px', textAlign: 'right' }}>
                      {cap.is_overallocated ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fee2e2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px' }}>
                          <AlertTriangle size={13} /> SOBREASIGNADO
                        </span>
                      ) : cap.occupancy_pct >= 80 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#d97706', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '8px' }}>
                          Óptimo ({cap.occupancy_pct}%)
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '8px' }}>
                          <CheckCircle2 size={13} /> Disponible
                        </span>
                      )}
                    </div>
                  </div>

                  <button 
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                  >
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                {/* Expanded Details: Breakdown by Project */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafc', padding: '16px 24px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Desglose de Horas Asignadas por Proyecto Activo
                    </div>

                    {cap.projects_breakdown.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                        Este colaborador no tiene tareas pendientes asignadas actualmente.
                      </p>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                        {cap.projects_breakdown.map((proj) => (
                          <div 
                            key={proj.project_id}
                            style={{ 
                              background: 'white', 
                              padding: '12px 14px', 
                              borderRadius: '10px', 
                              border: '1px solid #e2e8f0', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between' 
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Briefcase size={15} color="#3b82f6" />
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                                {proj.project_name}
                              </span>
                            </div>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px' }}>
                              {proj.hours} hrs
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
