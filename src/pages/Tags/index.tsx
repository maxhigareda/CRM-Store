import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmModal } from '../../components/Modals';

export default function Tags() {
  const { showNotification } = useNotification();
  const [tags, setTags] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  
  // Confirm Modal state
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);

  const colors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#1e293b', '#6366f1', '#14b8a6',
    '#f43f5e', '#84cc16', '#eab308', '#d946ef', '#0ea5e9', '#64748b', '#475569', '#f97316', '#a855f7', '#22c55e'
  ];

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    const { data, error } = await supabase.from('tags').select('*').eq('type', 'project').order('created_at', { ascending: false });
    if (data) setTags(data);
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('tags').insert([
        { name: newTagName.trim(), color: newTagColor, type: 'project' }
      ]).select();
      
      if (error) throw error;
      
      showNotification('success', 'Etiqueta creada correctamente');
      setNewTagName('');
      fetchTags();
    } catch (err: any) {
      showNotification('error', 'Error al crear etiqueta: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTag = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const { error } = await supabase.from('tags').update({
        name: editName.trim(),
        color: editColor
      }).eq('id', id);

      if (error) throw error;

      showNotification('success', 'Etiqueta actualizada');
      setEditingId(null);
      fetchTags();
    } catch (err: any) {
      showNotification('error', 'Error al actualizar: ' + err.message);
    }
  };

  const handleDeleteTag = async (id: string) => {
    setTagToDelete(id);
  };

  const confirmDelete = async () => {
    if (!tagToDelete) return;
    try {
      const { error } = await supabase.from('tags').delete().eq('id', tagToDelete);
      if (error) throw error;

      showNotification('success', 'Etiqueta eliminada');
      fetchTags();
    } catch (err: any) {
      showNotification('error', 'Error al eliminar: ' + err.message);
    } finally {
      setTagToDelete(null);
    }
  };

  const filteredTags = tags.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">Etiquetas Globales</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Gestiona las etiquetas principales disponibles para todos los proyectos.
          </p>
        </div>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', border: '1px solid var(--border-color)', marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em', marginBottom: '20px', textTransform: 'uppercase' }}>
          CONFIGURAR NUEVA ETIQUETA
        </h3>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', letterSpacing: '0.02em' }}>
              NOMBRE DE ETIQUETA
            </label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="Ej: Hardware, Urgente, VIP..." 
              value={newTagName} 
              onChange={e => setNewTagName(e.target.value)} 
              style={{ fontWeight: 600, height: '42px', borderRadius: '10px' }}
            />
          </div>
          <div style={{ flex: 1.5 }}>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', letterSpacing: '0.02em' }}>
              IDENTIFICADOR VISUAL
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '6px' }}>
              {colors.map(color => (
                <button 
                  key={color} 
                  onClick={() => setNewTagColor(color)}
                  style={{ 
                    width: '100%', paddingBottom: '100%', borderRadius: '6px', 
                    backgroundColor: color, 
                    border: newTagColor === color ? '2px solid #000' : 'none', 
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                    transform: newTagColor === color ? 'scale(1.1)' : 'scale(1)'
                  }} 
                />
              ))}
            </div>
          </div>
          <button 
            className="btn btn-primary" 
            style={{ height: '42px', padding: '0 32px', borderRadius: '12px' }} 
            onClick={handleCreateTag} 
            disabled={loading || !newTagName.trim()}
          >
            <Plus size={18} style={{ marginRight: '8px' }} /> Crear Etiqueta
          </button>
        </div>
      </div>

      <div className="table-container" style={{ background: 'white' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px', width: '320px' }}>
            <Search size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
            <input 
              type="text" 
              placeholder="Buscar etiquetas..." 
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.9rem', background: 'transparent', fontWeight: 500 }} 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>{filteredTags.length} etiquetas registradas</div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>ETIQUETA</th>
              <th>COLOR HEX</th>
              <th style={{ textAlign: 'right', paddingRight: '24px' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filteredTags.map(tag => (
              <tr key={tag.id}>
                <td>
                  {editingId === tag.id ? (
                    <input 
                      type="text" 
                      className="form-input" 
                      value={editName} 
                      onChange={e => setEditName(e.target.value)}
                      style={{ marginBottom: 0, height: '32px', fontSize: '0.85rem', fontWeight: 700, width: '200px' }}
                      autoFocus
                    />
                  ) : (
                    <span style={{ backgroundColor: `${tag.color}15`, color: tag.color, padding: '6px 14px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                      #{tag.name}
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {editingId === tag.id ? (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '300px' }}>
                        {colors.map(c => (
                          <div 
                            key={c} 
                            onClick={() => setEditColor(c)}
                            style={{ 
                              width: '18px', height: '18px', borderRadius: '4px', 
                              backgroundColor: c, border: editColor === c ? '2px solid #000' : 'none', cursor: 'pointer' 
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: tag.color }}></div>
                        <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>{tag.color}</span>
                      </>
                    )}
                  </div>
                </td>
                <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {editingId === tag.id ? (
                      <>
                        <button className="btn btn-secondary" style={{ padding: '6px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #dcfce7' }} onClick={() => handleUpdateTag(tag.id)}>
                          <Check size={16} />
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '6px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2' }} onClick={() => setEditingId(null)}>
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '8px', color: '#64748b' }} 
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditName(tag.name);
                            setEditColor(tag.color);
                          }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '8px', color: '#ef4444' }} 
                          onClick={() => handleDeleteTag(tag.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredTags.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', padding: '48px', color: '#94a3b8', fontSize: '0.9rem' }}>
                  No se encontraron etiquetas que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal 
        isOpen={tagToDelete !== null}
        title="Eliminar Etiqueta"
        message="¿Estás seguro de eliminar esta etiqueta? Esto afectará a todos los proyectos que la usen y no se puede deshacer."
        confirmText="Eliminar"
        isDestructive={true}
        onConfirm={confirmDelete}
        onClose={() => setTagToDelete(null)}
      />
    </div>
  );
}
