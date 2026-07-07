import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Wallet, AlertTriangle, CalendarCheck, HelpCircle,
  Users, BookOpen, Plus, Pencil, Trash2, X, Check,
} from 'lucide-react';
import { useNotification } from '../../../contexts/NotificationContext';
import { ConfirmModal } from '../../../components/Modals';
import {
  fetchCxC, buildMes, fetchCatalogo, addCatalogo, updateCatalogo, deleteCatalogo,
  formatMXN, mesLabel, mesActual,
  type CxCDataset, type CatalogoRow,
} from './utils';

// ── KPI card (mismo estilo que el Dashboard) ────────────────────────────────
function KpiCard({ label, value, icon, color, bgColor, sub }: {
  label: string; value: string; icon: React.ReactNode; color: string; bgColor: string; sub?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '20px',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '20px',
};

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
  padding: '6px 12px', fontSize: '0.875rem', color: 'var(--text-main)',
  background: 'white', cursor: 'pointer', outline: 'none',
};

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
  padding: '6px 10px', fontSize: '0.875rem', color: 'var(--text-main)', background: 'white', outline: 'none',
};

export default function CuentasPorCobrar() {
  const { showNotification } = useNotification();
  const [data, setData] = useState<CxCDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState<string>('');
  const [showCatalogo, setShowCatalogo] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const d = await fetchCxC();
      setData(d);
      // Default: mes actual si está disponible; si no, el más reciente.
      const actual = mesActual();
      setMes((prev) => prev || (d.mesesDisponibles.includes(actual) ? actual : d.mesesDisponibles[0] ?? actual));
    } catch (e) {
      showNotification('error', 'Error al cargar Cuentas por Cobrar: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vista = useMemo(() => (data && mes ? buildMes(data.rows, mes) : null), [data, mes]);
  const maxCliente = useMemo(() => Math.max(1, ...(vista?.porCliente.map((c) => c.saldo) ?? [1])), [vista]);

  if (loading && !data) {
    return (
      <div style={{ padding: 48, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const { sinTermino, mesesDisponibles, rango } = data;

  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            Cuentas por Cobrar
            {loading && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--primary-color)' }} />}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Saldo esperado por <strong>mes de cobro</strong> = emisión + días de crédito del cliente
            {rango.minDias != null && rango.maxDias != null && (
              <> · rango del catálogo: <strong>{rango.minDias}–{rango.maxDias} días</strong></>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowCatalogo(true)}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px' }}
        >
          <BookOpen size={16} /> Catálogo de días de crédito
        </button>
      </div>

      {/* Filtro de mes */}
      <div style={{ ...cardStyle, display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mes de cobro estimado
          </label>
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={selectStyle}>
            {mesesDisponibles.length === 0 && <option value="">Sin datos</option>}
            {mesesDisponibles.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>
        {vista && (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingBottom: 6 }}>
            {vista.numFacturas} factura{vista.numFacturas === 1 ? '' : 's'} · {vista.numClientes} cliente{vista.numClientes === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {/* KPIs del mes + Sin término */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KpiCard label={`Esperado ${mes ? mesLabel(mes) : ''}`} value={formatMXN(vista?.totalEsperado ?? 0)}
          icon={<Wallet size={18} />} color="#0070f3" bgColor="#eff6ff"
          sub="Saldo adeudado con vencimiento en el mes" />
        <KpiCard label="Vencido (del mes)" value={formatMXN(vista?.vencido ?? 0)}
          icon={<AlertTriangle size={18} />} color="#ef4444" bgColor="#fef2f2"
          sub="Fecha estimada de pago ya pasó" />
        <KpiCard label="Vigente (del mes)" value={formatMXN(vista?.vigente ?? 0)}
          icon={<CalendarCheck size={18} />} color="#16a34a" bgColor="#f0fdf4"
          sub="Aún dentro del plazo de crédito" />
        <KpiCard label="Sin término de crédito" value={formatMXN(sinTermino.saldo)}
          icon={<HelpCircle size={18} />} color="#f59e0b" bgColor="#fffbeb"
          sub={`${sinTermino.numFacturas} fac. · ${sinTermino.numClientes} cliente(s) — completa el catálogo`} />
      </div>

      {/* Cuerpo: top deudores + tabla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Top deudores del mes */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} /> Quién nos debe este mes
          </h2>
          {vista && vista.porCliente.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {vista.porCliente.slice(0, 10).map((c) => (
                <div key={c.cliente}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }} title={c.cliente}>{c.cliente}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700, flexShrink: 0 }}>{formatMXN(c.saldo)}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.saldo / maxCliente) * 100}%`, background: '#0070f3', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sin saldo por cobrar en este mes.</p>
          )}
        </div>

        {/* Tabla detalle del mes */}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={th}>Cliente</th>
                  <th style={th}>Emisión</th>
                  <th style={{ ...th, textAlign: 'center' }}>Días créd.</th>
                  <th style={th}>Pago estimado</th>
                  <th style={th}>Estatus</th>
                  <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {vista && vista.filas.length > 0 ? vista.filas.map((f) => {
                  const vencida = f.diasVencido > 0;
                  return (
                    <tr key={f.id} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={{ ...td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.cliente}>{f.cliente}</td>
                      <td style={td}>{f.fecha}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{f.diasCredito}</td>
                      <td style={td}>{f.fechaEstimadaPago}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                          background: vencida ? '#fef2f2' : '#f0fdf4', color: vencida ? '#ef4444' : '#16a34a',
                        }}>
                          {vencida ? `Vencida ${f.diasVencido}d` : f.diasVencido === 0 ? 'Vence hoy' : `Vence en ${-f.diasVencido}d`}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formatMXN(f.saldo)}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>Sin facturas por cobrar en este mes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCatalogo && (
        <CatalogoModal
          onClose={() => setShowCatalogo(false)}
          sugerencias={sinTermino.clientes}
          onChanged={loadData}
        />
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '10px 14px', color: 'var(--text-main)' };

// ── Modal: CRUD del catálogo de días de crédito ──────────────────────────────
function CatalogoModal({ onClose, sugerencias, onChanged }: {
  onClose: () => void;
  sugerencias: { cliente: string; saldo: number }[];
  onChanged: () => void;
}) {
  const { showNotification } = useNotification();
  const [rows, setRows] = useState<CatalogoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoCliente, setNuevoCliente] = useState('');
  const [nuevoDias, setNuevoDias] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editCliente, setEditCliente] = useState('');
  const [editDias, setEditDias] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<CatalogoRow | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchCatalogo()); }
    catch (e) { showNotification('error', (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enCatalogo = useMemo(() => new Set(rows.map((r) => r.cliente.trim().toUpperCase())), [rows]);
  const faltantes = sugerencias.filter((s) => !enCatalogo.has(s.cliente.trim().toUpperCase()));

  const handleAdd = async () => {
    const dias = parseInt(nuevoDias, 10);
    if (!nuevoCliente.trim()) { showNotification('error', 'Escribe el nombre del cliente.'); return; }
    if (isNaN(dias) || dias < 0) { showNotification('error', 'Días de crédito inválidos.'); return; }
    try {
      await addCatalogo(nuevoCliente, dias);
      setNuevoCliente(''); setNuevoDias('');
      showNotification('success', `"${nuevoCliente.trim()}" agregado (${dias} días).`);
      await load(); onChanged();
    } catch (e) { showNotification('error', (e as Error).message); }
  };

  const startEdit = (r: CatalogoRow) => { setEditId(r.id); setEditCliente(r.cliente); setEditDias(String(r.dias_credito)); };
  const handleUpdate = async () => {
    const dias = parseInt(editDias, 10);
    if (!editCliente.trim() || isNaN(dias) || dias < 0) { showNotification('error', 'Datos inválidos.'); return; }
    try {
      await updateCatalogo(editId!, editCliente, dias);
      setEditId(null);
      showNotification('success', 'Cliente actualizado.');
      await load(); onChanged();
    } catch (e) { showNotification('error', (e as Error).message); }
  };

  const handleDelete = async (r: CatalogoRow) => {
    try {
      await deleteCatalogo(r.id);
      showNotification('success', `"${r.cliente}" eliminado del catálogo.`);
      await load(); onChanged();
    } catch (e) { showNotification('error', (e as Error).message); }
    finally { setConfirmDelete(null); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9000 }}>
      <div className="modal-content" style={{ maxWidth: 620, width: '92%', maxHeight: '86vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={18} /> Catálogo de días de crédito
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
            El <strong>nombre del cliente</strong> debe coincidir exactamente con el <strong>RECEPTOR</strong> de la factura. 0 = contado.
          </p>

          {/* Alta rápida */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input placeholder="Cliente (= receptor)" value={nuevoCliente} onChange={(e) => setNuevoCliente(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input placeholder="Días" type="number" min={0} value={nuevoDias} onChange={(e) => setNuevoDias(e.target.value)} style={{ ...inputStyle, width: 90 }} />
            <button onClick={handleAdd} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px' }}>
              <Plus size={16} /> Agregar
            </button>
          </div>

          {/* Sugerencias: receptores con saldo pero sin término */}
          {faltantes.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Receptores con saldo pero sin término ({faltantes.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {faltantes.slice(0, 20).map((s) => (
                  <button key={s.cliente} onClick={() => { setNuevoCliente(s.cliente); setNuevoDias(''); }}
                    title={`Saldo: ${formatMXN(s.saldo)} — clic para prellenar`}
                    style={{ fontSize: '0.75rem', border: '1px solid #fcd34d', background: 'white', color: '#92400e', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>
                    + {s.cliente}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabla del catálogo */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: 'var(--text-muted)' }}><Loader2 size={20} className="animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: 16 }}>El catálogo está vacío.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ ...th, padding: '8px 8px' }}>Cliente</th>
                  <th style={{ ...th, padding: '8px 8px', textAlign: 'center' }}>Días</th>
                  <th style={{ ...th, padding: '8px 8px', width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {editId === r.id ? (
                      <>
                        <td style={{ padding: '6px 8px' }}><input value={editCliente} onChange={(e) => setEditCliente(e.target.value)} style={{ ...inputStyle, width: '100%' }} /></td>
                        <td style={{ padding: '6px 8px' }}><input type="number" min={0} value={editDias} onChange={(e) => setEditDias(e.target.value)} style={{ ...inputStyle, width: 70 }} /></td>
                        <td style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
                          <button onClick={handleUpdate} title="Guardar" style={iconBtn('#16a34a')}><Check size={16} /></button>
                          <button onClick={() => setEditId(null)} title="Cancelar" style={iconBtn('#64748b')}><X size={16} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '8px 8px', color: 'var(--text-main)' }}>{r.cliente}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 700 }}>{r.dias_credito}</td>
                        <td style={{ padding: '8px 8px', display: 'flex', gap: 6 }}>
                          <button onClick={() => startEdit(r)} title="Editar" style={iconBtn('#0070f3')}><Pencil size={15} /></button>
                          <button onClick={() => setConfirmDelete(r)} title="Eliminar" style={iconBtn('#ef4444')}><Trash2 size={15} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Eliminar del catálogo"
        message={confirmDelete ? `¿Eliminar "${confirmDelete.cliente}" (${confirmDelete.dias_credito} días)? Las facturas de ese cliente quedarán sin término hasta reasignarlo.` : ''}
        confirmText="Eliminar"
        isDestructive
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

const iconBtn = (color: string): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', color, padding: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});
