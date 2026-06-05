import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

export default function Layout() {
  const { user, loading, canImpersonate, impersonatedRole, impersonateRole } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <header className="header">
          <div>
            {/* El logo ahora vive en el Sidebar */}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {canImpersonate && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                background: impersonatedRole ? '#fef3c7' : '#f8fafc', 
                padding: '6px 12px', 
                borderRadius: '12px', 
                border: impersonatedRole ? '1px solid #f59e0b' : '1px solid #e2e8f0', 
                transition: 'all 0.2s' 
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: impersonatedRole ? '#b45309' : '#64748b' }}>
                  {impersonatedRole ? '⚡ VISTA SIMULADA:' : '👁️ VER COMO:'}
                </span>
                <select 
                  value={impersonatedRole || 'admin'} 
                  onChange={(e) => {
                    const val = e.target.value;
                    const newRole = val === 'admin' ? null : val;
                    impersonateRole(newRole);
                    if (val === 'collaborator') {
                      navigate('/plan-trabajo');
                    } else {
                      navigate('/projects');
                    }
                  }}
                  style={{ 
                    border: 'none', 
                    background: 'transparent', 
                    fontWeight: 700, 
                    fontSize: '0.85rem', 
                    color: impersonatedRole ? '#b45309' : '#0f172a',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="admin">Administrador (Tú)</option>
                  <option value="collaborator">Colaborador</option>
                </select>
              </div>
            )}
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
              Portal de Proyectos
            </span>
            <div style={{ 
              width: '36px', height: '36px', 
              borderRadius: '50%', backgroundColor: '#e2e8f0', 
              color: 'var(--primary-color)', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', 
              fontWeight: '700', fontSize: '14px' 
            }}>
              {user.email?.[0].toUpperCase()}
            </div>
          </div>
        </header>
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
