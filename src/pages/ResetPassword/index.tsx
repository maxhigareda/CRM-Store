import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../contexts/NotificationContext';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showNotification('error', 'Sesión de recuperación no válida o expirada. Por favor, solicita de nuevo el cambio.');
        navigate('/login');
      } else {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, [navigate, showNotification]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      showNotification('success', 'Contraseña restablecida exitosamente. Por favor inicia sesión con tu nueva contraseña.');
      // Cerrar sesión para limpiar el token de recuperación y redirigir
      await supabase.auth.signOut();
      navigate('/login');
    }
  };

  if (checkingSession) {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/logo_store_intelligence%20(1).png" alt="Logo" style={{ height: '24px', maxWidth: '100%', objectFit: 'contain' }} />
        </div>
        <h2 className="auth-title">Restablecer Contraseña</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>
          Ingresa tu nueva contraseña para acceder a la cuenta.
        </p>
        {error && <div style={{ color: 'red', marginBottom: '16px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
        <form onSubmit={handleResetPassword}>
          <div className="form-group">
            <label>Nueva Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="form-group">
            <label>Confirmar Nueva Contraseña</label>
            <input 
              type="password" 
              className="form-input" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Repite la contraseña"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={loading}>
            {loading ? 'Guardando...' : 'Restablecer Contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
