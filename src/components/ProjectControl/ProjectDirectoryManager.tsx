import { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Mail, 
  Phone, 
  Globe, 
  X,
  Building2,
  UserCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';

export interface DirectoryMember {
  id: string;
  project_id: string;
  group_type: 'Cliente' | 'Store';
  name: string;
  email: string;
  phone?: string;
  role_title: string;
  location_country: string;
  created_at?: string;
}

interface ProjectDirectoryManagerProps {
  projectId: string;
  projectName?: string;
  onDirectoryUpdated?: () => void;
}

const COUNTRIES = [
  'México',
  'Colombia',
  'Chile',
  'Perú',
  'Estados Unidos',
  'Argentina',
  'España',
  'Costa Rica',
  'Panamá',
  'Guatemala',
  'Otro'
];

export default function ProjectDirectoryManager({
  projectId,
  onDirectoryUpdated
}: ProjectDirectoryManagerProps) {
  const { showNotification } = useNotification();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState<'all' | 'Cliente' | 'Store'>('all');

  // Formulario nuevo miembro
  const [showAddForm, setShowAddForm] = useState(false);
  const [groupType, setGroupType] = useState<'Cliente' | 'Store'>('Store');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [country, setCountry] = useState('México');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDirectory();
  }, [projectId]);

  const fetchDirectory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_directory_members')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) {
        // Fallback a localStorage si la migración aún no se ha ejecutado
        const cached = localStorage.getItem(`project_dir_${projectId}`);
        if (cached) {
          setMembers(JSON.parse(cached));
        } else {
          setMembers([]);
        }
      } else {
        setMembers(data || []);
        localStorage.setItem(`project_dir_${projectId}`, JSON.stringify(data || []));
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return showNotification('error', 'El nombre es obligatorio');
    if (!email.trim()) return showNotification('error', 'El correo es obligatorio');
    if (!roleTitle.trim()) return showNotification('error', 'El rol es obligatorio');

    setSaving(true);
    const newMember: Partial<DirectoryMember> = {
      project_id: projectId,
      group_type: groupType,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      role_title: roleTitle.trim(),
      location_country: country
    };

    try {
      const { data, error } = await supabase
        .from('project_directory_members')
        .insert([newMember])
        .select()
        .single();

      if (error) {
        // Fallback local
        const localId = 'dir_' + Date.now();
        const savedMember: DirectoryMember = {
          id: localId,
          project_id: projectId,
          group_type: groupType,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          role_title: roleTitle.trim(),
          location_country: country,
          created_at: new Date().toISOString()
        };
        const updated = [...members, savedMember];
        setMembers(updated);
        localStorage.setItem(`project_dir_${projectId}`, JSON.stringify(updated));
      } else if (data) {
        const updated = [...members, data];
        setMembers(updated);
        localStorage.setItem(`project_dir_${projectId}`, JSON.stringify(updated));
      }

      showNotification('success', `${name} agregado al Directorio del Proyecto`);
      setName('');
      setEmail('');
      setPhone('');
      setRoleTitle('');
      setShowAddForm(false);
      if (onDirectoryUpdated) onDirectoryUpdated();
    } catch (err: any) {
      showNotification('error', 'Error al guardar miembro: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMember = async (id: string, memberName: string) => {
    if (!confirm(`¿Eliminar a "${memberName}" del directorio del proyecto?`)) return;

    try {
      await supabase.from('project_directory_members').delete().eq('id', id);
      const updated = members.filter(m => m.id !== id);
      setMembers(updated);
      localStorage.setItem(`project_dir_${projectId}`, JSON.stringify(updated));
      showNotification('success', 'Miembro eliminado del directorio');
      if (onDirectoryUpdated) onDirectoryUpdated();
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al eliminar miembro');
    }
  };

  const filteredMembers = members.filter(m => {
    if (filterGroup === 'all') return true;
    return m.group_type === filterGroup;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Informativo del Paso 1 */}
      <div style={{ 
        background: 'white', 
        padding: '24px', 
        borderRadius: '16px', 
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ 
              background: '#e0e7ff', 
              color: '#4338ca', 
              fontSize: '0.75rem', 
              fontWeight: 800, 
              padding: '4px 10px', 
              borderRadius: '8px' 
            }}>
              PASO 1 DEL FLUJO PM
            </span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Directorio del Proyecto
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Base de personas involucradas (Cliente y Store). Los responsables de tareas en el Plan de Trabajo se asignarán a partir de esta lista según su Rol.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Filtro por Grupo */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '2px' }}>
            <button
              onClick={() => setFilterGroup('all')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterGroup === 'all' ? 'white' : 'transparent',
                color: filterGroup === 'all' ? '#1e293b' : '#64748b',
                cursor: 'pointer'
              }}
            >
              Todos ({members.length})
            </button>
            <button
              onClick={() => setFilterGroup('Store')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterGroup === 'Store' ? 'white' : 'transparent',
                color: filterGroup === 'Store' ? '#2563eb' : '#64748b',
                cursor: 'pointer'
              }}
            >
              🏢 Store ({members.filter(m => m.group_type === 'Store').length})
            </button>
            <button
              onClick={() => setFilterGroup('Cliente')}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                borderRadius: '8px',
                background: filterGroup === 'Cliente' ? 'white' : 'transparent',
                color: filterGroup === 'Cliente' ? '#7c3aed' : '#64748b',
                cursor: 'pointer'
              }}
            >
              🤝 Cliente ({members.filter(m => m.group_type === 'Cliente').length})
            </button>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-primary"
            style={{ 
              borderRadius: '10px', 
              fontSize: '0.8rem', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '8px 16px' 
            }}
          >
            {showAddForm ? <X size={15} /> : <Plus size={15} />}
            {showAddForm ? 'Cerrar' : '+ Agregar Persona'}
          </button>
        </div>
      </div>

      {/* Formulario de Alta Rápida en Directorio */}
      {showAddForm && (
        <form 
          onSubmit={handleAddMember}
          style={{ 
            background: 'white', 
            padding: '24px', 
            borderRadius: '16px', 
            border: '2px solid #6366f1',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)' 
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#1e293b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={18} color="#6366f1" /> Nuevo Registro en Directorio
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            {/* Grupo */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                GRUPO *
              </label>
              <select
                className="form-input"
                value={groupType}
                onChange={e => setGroupType(e.target.value as any)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                <option value="Store">🏢 Store Intelligence</option>
                <option value="Cliente">🤝 Equipo del Cliente</option>
              </select>
            </div>

            {/* Nombre */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                NOMBRE COMPLETO *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Laura Morales"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Correo */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                CORREO ELECTRÓNICO *
              </label>
              <input
                type="email"
                required
                placeholder="ejemplo@correo.com"
                className="form-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Teléfono */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                TELÉFONO (OPCIONAL)
              </label>
              <input
                type="tel"
                placeholder="+52 55..."
                className="form-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Rol */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                ROL EN EL PROYECTO *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: BI Visualization Developer, PM, Sponsor"
                className="form-input"
                value={roleTitle}
                onChange={e => setRoleTitle(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Ubicación */}
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>
                UBICACIÓN (PAÍS DÍAS INHÁBILES)
              </label>
              <select
                className="form-input"
                value={country}
                onChange={e => setCountry(e.target.value)}
                style={{ width: '100%', height: '40px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {COUNTRIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="btn btn-secondary"
              style={{ borderRadius: '10px', padding: '8px 16px', fontSize: '0.8rem' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ borderRadius: '10px', padding: '8px 20px', fontSize: '0.8rem', fontWeight: 700 }}
            >
              {saving ? 'Guardando...' : 'Guardar en Directorio'}
            </button>
          </div>
        </form>
      )}

      {/* Tabla del Directorio */}
      <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>GRUPO</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>NOMBRE</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>CORREO</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>TELÉFONO</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>ROL</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569' }}>UBICACIÓN</th>
              <th style={{ padding: '14px 18px', fontSize: '0.75rem', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Cargando directorio del proyecto...
                </td>
              </tr>
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center' }}>
                  <Users size={32} style={{ color: '#cbd5e1', margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#64748b' }}>
                    No hay personas registradas en el directorio aún.
                  </p>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                    Haz clic en "+ Agregar Persona" para comenzar el Paso 1 del flujo.
                  </p>
                </td>
              </tr>
            ) : (
              filteredMembers.map(member => (
                <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.75rem', 
                      fontWeight: 800, 
                      padding: '3px 8px', 
                      borderRadius: '6px',
                      background: member.group_type === 'Store' ? '#eff6ff' : '#f5f3ff',
                      color: member.group_type === 'Store' ? '#2563eb' : '#7c3aed'
                    }}>
                      {member.group_type === 'Store' ? <Building2 size={12} /> : <Users size={12} />}
                      {member.group_type}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a' }}>
                    {member.name}
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Mail size={13} color="#94a3b8" />
                      <a href={`mailto:${member.email}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {member.email}
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', color: '#64748b', fontSize: '0.85rem' }}>
                    {member.phone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={13} color="#94a3b8" />
                        {member.phone}
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      fontWeight: 700, 
                      color: '#334155',
                      background: '#f1f5f9',
                      padding: '3px 8px',
                      borderRadius: '6px'
                    }}>
                      {member.role_title}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: '0.85rem', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Globe size={13} color="#94a3b8" />
                      {member.location_country}
                    </div>
                  </td>
                  <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteMember(member.id, member.name)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', color: '#ef4444', borderRadius: '8px' }}
                      title="Eliminar del directorio"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
