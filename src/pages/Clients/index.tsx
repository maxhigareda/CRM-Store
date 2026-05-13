import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Edit2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Clients() {
  const [clients, setClients] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState({ 
    name: '', 
    reference_name: '', 
    email: '',
    contacts: [] as { name: string; email: string }[]
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (data) setClients(data);
  };

  const handleOpenModal = (client?: any) => {
    if (client) {
      setEditingId(client.id);
      setNewClient({ 
        name: client.name, 
        reference_name: client.reference_name, 
        email: client.email || '',
        contacts: client.contacts || []
      });
    } else {
      setEditingId(null);
      setNewClient({ 
        name: '', 
        reference_name: '', 
        email: '',
        contacts: []
      });
    }
    setShowModal(true);
  };

  const addContactRow = () => {
    setNewClient({
      ...newClient,
      contacts: [...newClient.contacts, { name: '', email: '' }]
    });
  };

  const removeContactRow = (index: number) => {
    setNewClient({
      ...newClient,
      contacts: newClient.contacts.filter((_, i) => i !== index)
    });
  };

  const updateContactRow = (index: number, field: string, value: string) => {
    const updatedContacts = [...newClient.contacts];
    updatedContacts[index] = { ...updatedContacts[index], [field]: value };
    setNewClient({ ...newClient, contacts: updatedContacts });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (editingId) {
      const { error } = await supabase.from('clients').update(newClient).eq('id', editingId);
      if (!error) {
        setShowModal(false);
        fetchClients();
      }
    } else {
      const { error } = await supabase.from('clients').insert([newClient]);
      if (!error) {
        setShowModal(false);
        fetchClients();
      }
    }
    setLoading(false);
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.reference_name && c.reference_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">Clientes</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Directorio unificado de contactos externos y empresas registradas en el sistema.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn" style={{ backgroundColor: 'white', border: '1px solid var(--border-color)' }}>Importación masiva</button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} /> Agregar cliente
          </button>
        </div>
      </div>

      <div className="table-container">
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', width: '300px' }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: '8px' }} />
            <input 
              type="text" 
              placeholder="Filtrar por nombre, empresa o correo..." 
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.875rem' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}><input type="checkbox" /></th>
              <th>CONTACTOS</th>
              <th>CLIENTE</th>
              <th>CORREO ELECTRÓNICO</th>
              <th style={{ textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => (
              <tr key={client.id}>
                <td><input type="checkbox" /></td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '10px' }}>
                        {client.name.substring(0, 1).toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{client.name}</span>
                    </div>
                    {client.contacts && client.contacts.map((contact: any, idx: number) => (
                      <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '32px' }}>
                        • {contact.name} {contact.email && `(${contact.email})`}
                      </div>
                    ))}
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{client.reference_name || '-'}</td>
                <td style={{ color: 'var(--text-muted)' }}>{client.email || '-'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => handleOpenModal(client)}>
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  No se encontraron clientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ minWidth: '550px', padding: '32px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingId ? 'Editar Cliente' : 'Agregar Cliente'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label>Cliente (Empresa/Razón Social)</label>
                  <input required type="text" className="form-input" value={newClient.reference_name} onChange={e => setNewClient({...newClient, reference_name: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Contacto Principal</label>
                  <input required type="text" className="form-input" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} />
                </div>
              </div>
              
              <div className="form-group">
                <label>Correo Electrónico Principal</label>
                <input type="email" className="form-input" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} />
              </div>

              <div style={{ marginTop: '24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontWeight: 600, margin: 0 }}>Contactos Adicionales</label>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={addContactRow}>
                    <Plus size={14} /> Agregar
                  </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {newClient.contacts.map((contact, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        placeholder="Nombre" 
                        className="form-input" 
                        style={{ marginBottom: 0, flex: 1 }} 
                        value={contact.name} 
                        onChange={e => updateContactRow(index, 'name', e.target.value)} 
                      />
                      <input 
                        type="email" 
                        placeholder="Email" 
                        className="form-input" 
                        style={{ marginBottom: 0, flex: 1 }} 
                        value={contact.email} 
                        onChange={e => updateContactRow(index, 'email', e.target.value)} 
                      />
                      <button type="button" onClick={() => removeContactRow(index)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                  {newClient.contacts.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px dashed #e2e8f0' }}>
                      No hay contactos adicionales.
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{editingId ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
