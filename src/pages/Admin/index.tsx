import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { UserPlus, Plus, Trash2, Camera, Loader2, X } from 'lucide-react';
import { PromptModal } from '../../components/Modals';
import { createClient } from '@supabase/supabase-js';
import { useNotification } from '../../contexts/NotificationContext';

interface Area {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  area_id?: string | null;
  photo_url?: string;
  modules?: string[];
  can_edit_facturas?: boolean;
}

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false, storageKey: 'admin-temp-client' } }
);

export default function Admin() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAreaName, setNewAreaName] = useState('');

  const { showNotification } = useNotification();

  // Prompt modal state
  const [promptConfig, setPromptConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    placeholder: string;
    defaultValue: string;
    onConfirm: (val: string) => void;
  } | null>(null);

  // Invite User state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('collaborator');
  const [inviteArea, setInviteArea] = useState('');
  const [inviteModules, setInviteModules] = useState<string[]>(['proyectos']);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const fetchPromise = Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('areas').select('*').order('name')
      ]);

      const timeoutPromise = new Promise<[any, any]>((_, reject) => 
        setTimeout(() => reject(new Error("Supabase timeout (Admin)")), 30000)
      );

      const [usersRes, areasRes] = await Promise.race([fetchPromise, timeoutPromise]);
      
      console.log("Admin fetchData users:", usersRes);
      console.log("Admin fetchData areas:", areasRes);

      if (usersRes.error) console.error("Error fetching users:", usersRes.error);
      if (areasRes.error) console.error("Error fetching areas:", areasRes.error);

      if (usersRes.data) setUsers(usersRes.data);
      if (areasRes.data) setAreas(areasRes.data);
    } catch (err) {
      console.error("Excepción en fetchData Admin:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (id: string, updates: Partial<Profile>) => {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id);
      
    if (!error) {
      setUsers(users.map(u => u.id === id ? { ...u, ...updates } : u));
    }
  };

  const handleAddArea = async () => {
    if (!newAreaName) return;
    const { data, error } = await supabase.from('areas').insert([{ name: newAreaName }]).select().single();
    if (!error && data) {
      setAreas([...areas, data]);
      setNewAreaName('');
    }
  };

  const handleDeleteArea = async (id: string) => {
    const { error } = await supabase.from('areas').delete().eq('id', id);
    if (!error) {
      setAreas(areas.filter(a => a.id !== id));
    }
  };

  const handleAreaChange = async (userId: string, areaId: string) => {
    if (areaId === 'new') {
      setPromptConfig({
        isOpen: true,
        title: 'Nueva Área',
        message: 'Ingresa el nombre de la nueva área',
        placeholder: 'Ej: Marketing',
        defaultValue: '',
        onConfirm: async (name) => {
          if (name) {
            const { data, error } = await supabase.from('areas').insert([{ name }]).select().single();
            if (!error && data) {
              setAreas(prev => [...prev, data]);
              handleUpdateUser(userId, { area_id: data.id });
            }
          }
        }
      });
    } else {
      handleUpdateUser(userId, { area_id: areaId || null });
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;
    setInviting(true);
    try {
      const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
        email: inviteEmail,
        password: 'Sistema2026!',
      });
      
      if (authError) {
        if (authError.message.includes('security purposes') || authError.message.includes('rate limit')) {
          throw new Error('Límite de seguridad de la base de datos. Por favor, espera 1 minuto antes de invitar a otro usuario.');
        }
        throw authError;
      }
      
      if (authData.user) {
        // Esperar a que el trigger de Supabase cree el perfil inicial
        await new Promise(r => setTimeout(r, 1000));

        const { error: profileError } = await supabase.from('profiles').update({
          full_name: inviteName,
          role: inviteRole,
          area_id: inviteArea || null,
          modules: inviteModules.length > 0 ? inviteModules : ['proyectos']
        }).eq('id', authData.user.id);

        if (profileError) throw profileError;
        
        showNotification('success', 'Usuario invitado. Contraseña temporal: Sistema2026!');
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteName('');
        fetchData();
      }
    } catch(err: any) {
      showNotification('error', 'Error al invitar: ' + err.message);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', padding: '10px' }}>
      {/* Areas Management Section */}
      <section className="glass-card" style={{ padding: '32px', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Áreas de la Empresa</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>Crea y gestiona las áreas para organizar a tu equipo.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ej: Operaciones, Diseño..." 
              value={newAreaName} 
              onChange={e => setNewAreaName(e.target.value)} 
              style={{ width: '250px', marginBottom: 0, borderRadius: '12px', border: '2px solid #f1f5f9' }}
            />
            <button className="btn btn-primary" onClick={handleAddArea} style={{ borderRadius: '12px', padding: '0 20px' }}>
              <Plus size={20} />
              <span>Añadir Área</span>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {areas.map(area => (
            <div key={area.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>{area.name}</span>
              <button onClick={() => handleDeleteArea(area.id)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {areas.length === 0 && <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>No hay áreas creadas todavía.</div>}
        </div>
      </section>

      {/* Users Management Section */}
      <section>
        <div className="page-header" style={{ marginBottom: '24px' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Gestión de Usuarios</h1>
            <p style={{ color: '#64748b', fontSize: '0.95rem', marginTop: '4px' }}>Edita la información de los colaboradores directamente en la tabla.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowInviteModal(true)}>
            <UserPlus size={18} />
            <span>Invitar Usuario</span>
          </button>
        </div>

        <div className="table-container" style={{ background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 4px 25px rgba(0,0,0,0.04)', border: '1px solid #e2e8f0' }}>
          <table className="table">
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ width: '80px', padding: '20px' }}>Foto</th>
                <th style={{ padding: '20px' }}>Datos del Usuario</th>
                <th style={{ padding: '20px' }}>Área Asignada</th>
                <th style={{ padding: '20px' }}>Módulos</th>
                <th style={{ padding: '20px' }}>Editar facturas</th>
                <th style={{ padding: '20px' }}>Rol de Acceso</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '60px' }}><Loader2 className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary-color)' }} /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>No hay usuarios registrados.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                        {u.photo_url ? (
                          <img src={u.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#94a3b8', fontSize: '1.4rem' }}>
                            {u.full_name?.charAt(0) || 'U'}
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          setPromptConfig({
                            isOpen: true,
                            title: 'Actualizar Foto',
                            message: 'Ingresa la URL directa de la foto de perfil:',
                            placeholder: 'https://...',
                            defaultValue: u.photo_url || '',
                            onConfirm: (url) => handleUpdateUser(u.id, { photo_url: url })
                          });
                        }}
                        style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10 }}
                      >
                        <Camera size={12} />
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={u.full_name || ''} 
                        placeholder="Nombre completo"
                        onChange={e => setUsers(users.map(user => user.id === u.id ? { ...user, full_name: e.target.value } : user))}
                        onBlur={e => handleUpdateUser(u.id, { full_name: e.target.value })}
                        style={{ 
                          border: '2px solid #f1f5f9', 
                          background: '#fcfdfe', 
                          fontWeight: 700, 
                          padding: '10px 14px', 
                          marginBottom: 0, 
                          width: '100%',
                          borderRadius: '12px',
                          fontSize: '1rem',
                          color: '#0f172a'
                        }}
                      />
                      <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500, paddingLeft: '4px' }}>{u.email}</div>
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <select 
                      className="form-input"
                      value={u.area_id || ''}
                      onChange={e => handleAreaChange(u.id, e.target.value)}
                      style={{ 
                        padding: '10px 14px', 
                        marginBottom: 0, 
                        width: '200px', 
                        background: '#fcfdfe', 
                        fontWeight: 700,
                        border: '2px solid #f1f5f9',
                        borderRadius: '12px',
                        fontSize: '0.95rem',
                        color: '#1e293b'
                      }}
                    >
                      <option value="">Sin área específica</option>
                      {areas.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                      <option value="new" style={{ fontWeight: 800, color: 'var(--primary-color)' }}>+ Crear nueva área...</option>
                    </select>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minWidth: '180px' }}>
                      {['comercial', 'financiero', 'proyectos', 'operaciones'].map(mod => {
                        const isChecked = u.modules?.includes(mod) || false;
                        return (
                          <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input 
                              type="checkbox" 
                              checked={isChecked}
                              onChange={(e) => {
                                const current = u.modules || [];
                                const next = e.target.checked ? [...current, mod] : current.filter(m => m !== mod);
                                handleUpdateUser(u.id, { modules: next });
                              }}
                            />
                            {mod === 'comercial' ? 'Com.' : mod === 'financiero' ? 'Fin.' : mod === 'proyectos' ? 'Proy.' : 'Oper.'}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} title="Permite editar, eliminar y clasificar facturas. Sin marcar: solo lectura.">
                      <input
                        type="checkbox"
                        checked={u.can_edit_facturas === true}
                        onChange={(e) => handleUpdateUser(u.id, { can_edit_facturas: e.target.checked })}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                        {u.can_edit_facturas === true ? 'Sí' : 'No'}
                      </span>
                    </label>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <select
                      value={u.role}
                      onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                      className="form-input"
                      style={{ 
                        width: '160px', 
                        padding: '10px 14px', 
                        marginBottom: 0, 
                        background: '#fcfdfe', 
                        fontWeight: 700,
                        border: '2px solid #f1f5f9',
                        borderRadius: '12px',
                        fontSize: '0.95rem',
                        color: '#1e293b'
                      }}
                    >
                      <option value="collaborator">Colaborador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modals */}
      {promptConfig && (
        <PromptModal
          isOpen={promptConfig.isOpen}
          title={promptConfig.title}
          message={promptConfig.message}
          placeholder={promptConfig.placeholder}
          defaultValue={promptConfig.defaultValue}
          onConfirm={promptConfig.onConfirm}
          onClose={() => setPromptConfig(null)}
        />
      )}

      {showInviteModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px', padding: '32px' }}>
            <div className="modal-header" style={{ marginBottom: '24px' }}>
              <h2 className="modal-title">Invitar Nuevo Usuario</h2>
              <button className="modal-close" onClick={() => setShowInviteModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleInviteUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nombre Completo</label>
                  <input type="text" className="form-input" value={inviteName} onChange={e => setInviteName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Correo Electrónico</label>
                  <input type="email" className="form-input" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Rol de Acceso</label>
                  <select className="form-input" value={inviteRole} onChange={e => setInviteRole(e.target.value)} required>
                    <option value="collaborator">Colaborador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Área Asignada</label>
                  <select className="form-input" value={inviteArea} onChange={e => setInviteArea(e.target.value)}>
                    <option value="">Sin área específica</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Módulos Asignados</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {['comercial', 'financiero', 'proyectos', 'operaciones'].map(mod => (
                      <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={inviteModules.includes(mod)}
                          onChange={e => {
                            if (e.target.checked) setInviteModules([...inviteModules, mod]);
                            else setInviteModules(inviteModules.filter(m => m !== mod));
                          }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{mod}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#3b82f6', marginTop: '16px' }}>
                  <strong>Nota:</strong> El usuario podrá iniciar sesión con la contraseña temporal: <code style={{ background: '#dbeafe', padding: '2px 6px', borderRadius: '4px' }}>Sistema2026!</code>
                </div>
              </div>
              <div className="modal-footer" style={{ marginTop: '32px', paddingTop: '24px', display: 'flex', gap: '16px', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowInviteModal(false)} style={{ padding: '12px 24px' }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={inviting} style={{ padding: '12px 24px' }}>
                  {inviting ? 'Invitando...' : 'Invitar Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
