import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Edit2, Globe, Clock, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export const COUNTRIES_CATALOG = [
  { code: 'MX', name: 'México', flag: '🇲🇽', timezone: 'GMT-6 (Hora Central)', holidayRegion: 'Festivos Oficiales México' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', timezone: 'GMT-5 (Hora Bogotá)', holidayRegion: 'Festivos Oficiales Colombia' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', timezone: 'GMT-4 / GMT-3 (Santiago)', holidayRegion: 'Festivos Oficiales Chile' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪', timezone: 'GMT-5 (Hora Lima)', holidayRegion: 'Festivos Oficiales Perú' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', timezone: 'GMT-5 a GMT-8 (ET/CT/PT)', holidayRegion: 'Federal Holidays USA' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'GMT-3 (Buenos Aires)', holidayRegion: 'Festivos Oficiales Argentina' },
  { code: 'ES', name: 'España', flag: '🇪🇸', timezone: 'GMT+1 / GMT+2 (Madrid)', holidayRegion: 'Festivos Oficiales España' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', timezone: 'GMT-6 (San José)', holidayRegion: 'Festivos Oficiales Costa Rica' },
  { code: 'PA', name: 'Panamá', flag: '🇵🇦', timezone: 'GMT-5 (Panamá)', holidayRegion: 'Festivos Oficiales Panamá' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹', timezone: 'GMT-6 (Guatemala)', holidayRegion: 'Festivos Oficiales Guatemala' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', timezone: 'GMT-5 (Quito)', holidayRegion: 'Festivos Oficiales Ecuador' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', timezone: 'GMT-3 (Brasilia/Sao Paulo)', holidayRegion: 'Feriados Nacionais Brasil' },
  { code: 'OTRO', name: 'Otro', flag: '🌐', timezone: 'GMT-6 (Por defecto)', holidayRegion: 'Personalizado' }
];

export default function Clients() {
  const [clients, setClients] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState({ 
    name: '', 
    reference_name: '', 
    email: '',
    location_country: 'México',
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
        location_country: client.location_country || 'México',
        contacts: client.contacts || []
      });
    } else {
      setEditingId(null);
      setNewClient({ 
        name: '', 
        reference_name: '', 
        email: '',
        location_country: 'México',
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

    const countryObj = COUNTRIES_CATALOG.find(c => c.name === newClient.location_country) || COUNTRIES_CATALOG[0];
    const fullPayload: any = {
      name: newClient.name,
      reference_name: newClient.reference_name,
      email: newClient.email || null,
      contacts: newClient.contacts || [],
      location_country: countryObj.name,
      country_code: countryObj.code,
      timezone: countryObj.timezone
    };

    let currentPayload = { ...fullPayload };

    for (let attempt = 0; attempt < 4; attempt++) {
      let error = null;
      if (editingId) {
        const res = await supabase.from('clients').update(currentPayload).eq('id', editingId);
        error = res.error;
      } else {
        const res = await supabase.from('clients').insert([currentPayload]);
        error = res.error;
      }

      if (!error) {
        setShowModal(false);
        fetchClients();
        break;
      }

      const missingMatch = error.message.match(/column "?([^"\s]+)"? of relation "?clients"? does not exist/i) ||
                           error.message.match(/Could not find the '([^']+)' column/i);
      if (missingMatch && missingMatch[1] && missingMatch[1] in currentPayload) {
        delete currentPayload[missingMatch[1]];
        continue;
      }

      console.error(error);
      break;
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
              <th>UBICACIÓN / HUSO HORARIO</th>
              <th>CORREO ELECTRÓNICO</th>
              <th style={{ textAlign: 'right' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map(client => {
              const country = COUNTRIES_CATALOG.find(c => c.name === client.location_country || c.code === client.country_code) || COUNTRIES_CATALOG[0];

              return (
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
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.25rem' }}>{country.flag}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                          {country.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} color="#94a3b8" />
                          <span>{country.timezone}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{client.email || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => handleOpenModal(client)}>
                      <Edit2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
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

              {/* Selector de Ubicación / País para Huso Horario y Festivos */}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                  <Globe size={15} color="var(--primary-color)" /> Ubicación del Cliente (Huso Horario & Calendario de Festivos) *
                </label>
                <select 
                  className="form-input" 
                  value={newClient.location_country} 
                  onChange={e => setNewClient({ ...newClient, location_country: e.target.value })}
                  style={{ fontWeight: 700, height: '42px', borderRadius: '10px', fontSize: '0.9rem' }}
                >
                  {COUNTRIES_CATALOG.map(c => (
                    <option key={c.code} value={c.name}>
                      {c.flag} {c.name} — {c.timezone}
                    </option>
                  ))}
                </select>

                {/* Tarjeta de Resumen de Huso Horario y Calendario */}
                {(() => {
                  const selCountry = COUNTRIES_CATALOG.find(c => c.name === newClient.location_country) || COUNTRIES_CATALOG[0];
                  return (
                    <div style={{ 
                      background: '#f8fafc', 
                      padding: '12px 16px', 
                      borderRadius: '10px', 
                      border: '1px solid #e2e8f0', 
                      marginTop: '8px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      fontSize: '0.8rem',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="#64748b" />
                        <span style={{ color: '#64748b' }}>Huso Horario:</span>
                        <strong style={{ color: '#0f172a' }}>{selCountry.timezone}</strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="#047857" />
                        <span style={{ color: '#64748b' }}>Calendario Festivos:</span>
                        <span style={{ color: '#047857', fontWeight: 800 }}>📅 {selCountry.holidayRegion}</span>
                      </div>
                    </div>
                  );
                })()}
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
