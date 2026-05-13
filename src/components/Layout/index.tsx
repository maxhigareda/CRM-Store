import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

export default function Layout() {
  const { user, loading } = useAuth();

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
