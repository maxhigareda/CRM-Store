import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Briefcase, Building2, LayoutDashboard, ChevronRight } from 'lucide-react';
import './home.css';

export default function Home() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      const modules = profile.modules || ['proyectos']; // default fallback
      if (modules.length === 1) {
        setShouldRedirect(true);
        const moduleName = (modules[0] || '').toLowerCase().trim();
        
        if (moduleName === 'proyectos') {
          navigate('/projects', { replace: true });
        } else if (moduleName === 'comercial') {
          navigate('/comercial', { replace: true });
        } else if (moduleName === 'financiero') {
          navigate('/financiero', { replace: true });
        } else {
          // Fallback por si la cadena no coincide exactamente
          navigate('/projects', { replace: true });
        }
      }
    }
  }, [loading, profile, navigate]);

  if (loading) {
    return <div className="home-loading">Cargando tu perfil...</div>;
  }

  if (shouldRedirect) {
    return <div className="home-loading">Redirigiendo a tu módulo...</div>;
  }

  const userModules = profile?.modules || ['proyectos'];
  const hasProyectos = userModules.includes('proyectos');
  const hasComercial = userModules.includes('comercial');
  const hasFinanciero = userModules.includes('financiero');

  return (
    <div className="home-container">
      <div className="home-content">
        <header className="home-header">
          <div className="logo-wrapper">
            <img src="/logo_store_intelligence%20(1).png" alt="GeStore" className="home-logo" />
          </div>
          <h1 className="home-title">
            ¡Hola, {profile?.full_name?.split(' ')[0] || 'Colaborador'}! 👋
          </h1>
          <p className="home-subtitle">
            Selecciona el módulo al que deseas ingresar
          </p>
        </header>

        <div className="modules-grid">
          {/* Módulo Comercial */}
          <div 
            className={`module-card ${!hasComercial ? 'disabled' : ''}`}
            onClick={() => hasComercial ? alert('Módulo Comercial en construcción 🚀') : null}
          >
            <div className="card-bg comercial-bg"></div>
            <div className="card-content">
              <div className="icon-wrapper comercial-icon">
                <Briefcase size={32} />
              </div>
              <h3>Comercial</h3>
              <p>Gestión de ventas, clientes potenciales y oportunidades de negocio.</p>
              
              <div className="card-footer">
                {!hasComercial ? (
                  <span className="badge-locked">Sin acceso</span>
                ) : (
                  <span className="action-text">Entrar <ChevronRight size={16} /></span>
                )}
              </div>
            </div>
          </div>

          {/* Módulo Proyectos */}
          <div 
            className={`module-card ${!hasProyectos ? 'disabled' : ''}`}
            onClick={() => hasProyectos ? navigate('/projects') : null}
          >
            <div className="card-bg proyectos-bg"></div>
            <div className="card-content">
              <div className="icon-wrapper proyectos-icon">
                <LayoutDashboard size={32} />
              </div>
              <h3>Proyectos</h3>
              <p>Seguimiento de tareas, cronogramas y colaboración en equipo.</p>
              
              <div className="card-footer">
                {!hasProyectos ? (
                  <span className="badge-locked">Sin acceso</span>
                ) : (
                  <span className="action-text">Entrar <ChevronRight size={16} /></span>
                )}
              </div>
            </div>
          </div>

          {/* Módulo Financiero */}
          <div 
            className={`module-card ${!hasFinanciero ? 'disabled' : ''}`}
            onClick={() => hasFinanciero ? navigate('/financiero') : null}
          >
            <div className="card-bg financiero-bg"></div>
            <div className="card-content">
              <div className="icon-wrapper financiero-icon">
                <Building2 size={32} />
              </div>
              <h3>Financiero</h3>
              <p>Administración de presupuestos, facturación y reportes financieros.</p>
              
              <div className="card-footer">
                {!hasFinanciero ? (
                  <span className="badge-locked">Sin acceso</span>
                ) : (
                  <span className="action-text">Entrar <ChevronRight size={16} /></span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
