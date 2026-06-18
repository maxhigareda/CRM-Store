import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  UserPlus,
  LogOut,
  ChevronLeft,
  Building2,
  LayoutDashboard,
  Table2,
  Scale,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function FinancieroSidebar() {
  const { signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
        <NavLink to="/financiero/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Dashboard">
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/financiero/conciliacion" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Conciliación">
          <Scale size={18} />
          <span>Conciliación</span>
        </NavLink>

        <div className="nav-section">BASE DE DATOS</div>
        <NavLink to="/financiero/tablas/facturas" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Tabla Facturas">
          <Table2 size={18} />
          <span>Facturas</span>
        </NavLink>
        <NavLink to="/financiero/tablas/movimientos" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Tabla Movimientos Bancarios">
          <Table2 size={18} />
          <span>Movimientos</span>
        </NavLink>

        <div className="nav-section">ADMINISTRACIÓN</div>
        <NavLink to="/financiero/clients" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Clientes">
          <Building2 size={18} />
          <span>Clientes</span>
        </NavLink>
        <NavLink to="/financiero/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Usuarios">
          <UserPlus size={18} />
          <span>Usuarios</span>
        </NavLink>
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
