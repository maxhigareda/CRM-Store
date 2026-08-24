import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Settings, 
  LayoutTemplate, 
  Hash, 
  UserPlus, 
  LogOut,
  ChevronLeft,
  UserCheck,
  Building2,
  ClipboardList
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function Sidebar() {
  const { signOut, profile } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isCollaborator = profile?.role === 'collaborator';

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <button 
        className="sidebar-toggle" 
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expandir' : 'Colapsar'}
        style={{ transform: isCollapsed ? 'rotate(180deg)' : 'none' }}
      >
        <ChevronLeft size={14} />
      </button>

      <div className="sidebar-header" style={{ justifyContent: isCollapsed ? 'center' : 'flex-start', padding: '24px 20px', borderBottom: 'none' }}>
        {isCollapsed ? (
          <NavLink to="/" className="sidebar-mini-logo" style={{ textDecoration: 'none' }}>SI</NavLink>
        ) : (
          <NavLink to="/" style={{ display: 'block' }}>
            <img src="/logo_store_intelligence%20(1).png" alt="Logo" style={{ height: '24px', maxWidth: '100%', objectFit: 'contain' }} />
          </NavLink>
        )}
      </div>
      
      <nav className="sidebar-nav" style={{ overflowY: 'auto' }}>
        {isCollaborator ? (
          <>
            <NavLink to="/plan-trabajo" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Plan de trabajo">
              <ClipboardList size={18} />
              <span>Plan de trabajo</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/projects" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Proyectos">
              <LayoutDashboard size={18} />
              <span>Proyectos</span>
            </NavLink>
            <NavLink to="/collaborators" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Colaboradores">
              <UserCheck size={18} />
              <span>Colaboradores</span>
            </NavLink>
            <NavLink to="/lead-team-meetings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Juntas Lead Team">
              <ClipboardList size={18} />
              <span>Juntas Lead Team</span>
            </NavLink>

            <div className="nav-section">GESTIÓN ENTERPRISE</div>
            <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Configuración">
              <Settings size={18} />
              <span>Configuración</span>
            </div>

            <div className="nav-section">OBJETOS Y REGLAS</div>
            <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }} title="Campos">
              <LayoutTemplate size={18} />
              <span>Campos</span>
            </div>
            <NavLink to="/tags" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Etiquetas">
              <Hash size={18} />
              <span>Etiquetas</span>
            </NavLink>

            <div className="nav-section">ADMINISTRACIÓN</div>
            <NavLink to="/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Clientes">
              <Building2 size={18} />
              <span>Clientes</span>
            </NavLink>
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Usuarios">
              <UserPlus size={18} />
              <span>Usuarios</span>
            </NavLink>
          </>
        )}
      </nav>

      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)' }}>
        <button className="btn-logout" onClick={signOut}>
          <LogOut size={18} />
          {!isCollapsed && <span>Cerrar Sesión</span>}
        </button>
      </div>
    </aside>
  );
}
