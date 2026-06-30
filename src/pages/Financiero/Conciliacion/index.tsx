import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, X, Loader2, ChevronLeft, ChevronRight,
  Scale, Clock, Trash2, ArrowRight,
  Link2, CheckSquare, Square, Calendar, AlertTriangle, Eye,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { useAuth } from '../../../contexts/AuthContext';
import { ComplementosCFDI, DatosCompletos } from '../components/FacturaDetalle';

// ─────────────────────────────────────────────────────
// Conciliación bancaria MANUAL (sin IA).
// Flujo: 1 factura emitida  ←→  N movimientos ABONO del estado de cuenta.
// La relación se persiste en `public.conciliaciones` (tabla puente).
// La contadora cruza a mano apoyándose en ordenante + fecha + monto.
// ─────────────────────────────────────────────────────
type FacturaRow = Record<string, any>;
type MovRow      = Record<string, any>;

interface ConciliacionExistente {
  id: number;
  movimiento_id: number;
  monto_aplicado: number;
  moneda: string | null;
  metodo: string | null;
  nota: string | null;
  created_at: string;
  movimientos_bancarios: {
    fecha: string;
    descripcion: string | null;
    referencia: string | null;
    monto: number;
    moneda: string;
  } | null;
}

// ─────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────
const fmtMoney = (v: any, moneda = 'MXN') => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: /^[A-Z]{3}$/.test(moneda) ? moneda : 'MXN',
    minimumFractionDigits: 2,
  }).format(n);
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const sanitize = (s: string) => s.replace(/[(),%*]/g, '').trim();

const estadoBadge = (estado: string) => {
  if (estado === 'conciliada') return { label: 'Conciliada', bg: '#dcfce7', color: '#166534' };
  if (estado === 'parcial')    return { label: 'Parcial',    bg: '#fed7aa', color: '#9a3412' };
  return { label: 'Pendiente', bg: '#fef9c3', color: '#854d0e' };
};

const PAGE_SIZE = 20;
const FACTURA_SEARCH_COLUMNS = ['receptor', 'rfc_receptor', 'folio', 'serie'];
const selectStyle: React.CSSProperties = {
  background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px',
  padding: '7px 10px', fontSize: '0.82rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer',
};

// ─────────────────────────────────────────────────────
export default function Conciliacion() {
  const { showNotification } = useNotification();
  const { user }             = useAuth();

  // ── Panel izquierdo: facturas EMITIDAS de ingreso ──
  const [rows, setRows]       = useState<FacturaRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]   = useState('');
  const [estadoFilter, setEstadoFilter] = useState<'todas' | 'pendiente' | 'parcial' | 'conciliada'>('todas');

  // ── Factura seleccionada ───────────────────────────
  const [selected, setSelected]   = useState<FacturaRow | null>(null);
  const [concilSum, setConcilSum] = useState(0); // suma ya conciliada de la factura
  const [conciliaciones, setConciliaciones] = useState<ConciliacionExistente[]>([]);
  const [loadingConcil, setLoadingConcil]   = useState(false);

  // ── Selector de movimientos ABONO ──────────────────
  const [movs, setMovs]           = useState<MovRow[]>([]);
  const [loadingMovs, setLoadingMovs] = useState(false);
  const [movSearchInput, setMovSearchInput] = useState('');
  const [movSearch, setMovSearch] = useState('');
  const [movDesde, setMovDesde]   = useState('');
  const [movHasta, setMovHasta]   = useState('');
  const [hideConciliados, setHideConciliados] = useState(true);

  // Selección: movimiento_id → monto aplicado (string editable)
  const [sel, setSel] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // ── Modal de detalle completo de la factura ────────
  const [detailRow, setDetailRow]   = useState<FacturaRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // no seleccionar la factura al abrir el detalle
    setDetailOpen(true); setDetailLoading(true); setDetailRow(null);
    const { data, error } = await supabase.from('facturas').select('*').eq('id', id).single();
    setDetailLoading(false);
    if (error) { showNotification('error', 'No se pudo cargar el detalle: ' + error.message); return; }
    setDetailRow(data);
  };
  const closeDetail = () => { setDetailOpen(false); setDetailRow(null); };

  // ── Debounce búsquedas ─────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => {
    const t = setTimeout(() => setMovSearch(movSearchInput), 350);
    return () => clearTimeout(t);
  }, [movSearchInput]);

  // ── Fetch facturas emitidas (vista con estado calculado) ──
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('v_facturas_conciliacion')
        .select('id, fecha, folio, serie, receptor, rfc_receptor, moneda, total, condiciones_pago, uso_cfdi, monto_conciliado, saldo_pendiente, estado_conciliacion', { count: 'exact' })
        .eq('tipo_factura', 'EMITIDA');

      if (estadoFilter !== 'todas') q = q.eq('estado_conciliacion', estadoFilter);

      const s = sanitize(search);
      if (s) q = q.or(FACTURA_SEARCH_COLUMNS.map(c => `${c}.ilike.%${s}%`).join(','));

      q = q.order('fecha', { ascending: false, nullsFirst: false });
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) {
        showNotification('error', 'Error al cargar facturas: ' + error.message);
        setRows([]); setTotal(0); return;
      }
      setRows(data || []);
      setTotal(count || 0);
    } finally {
      setLoading(false);
    }
  }, [page, search, estadoFilter, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Conciliaciones existentes de la factura ────────
  const fetchConciliaciones = useCallback(async (facturaId: number) => {
    setLoadingConcil(true);
    try {
      const { data, error } = await supabase
        .from('conciliaciones')
        .select('*, movimientos_bancarios(fecha, descripcion, referencia, monto, moneda)')
        .eq('factura_id', facturaId)
        .order('created_at', { ascending: false });
      if (!error) {
        const list = (data as ConciliacionExistente[]) || [];
        setConciliaciones(list);
        setConcilSum(list.reduce((s, c) => s + Number(c.monto_aplicado), 0));
      }
    } finally {
      setLoadingConcil(false);
    }
  }, []);

  // ── Movimientos ABONO candidatos (misma moneda que la factura) ──
  const fetchMovs = useCallback(async (factura: FacturaRow) => {
    setLoadingMovs(true);
    try {
      // Sin candado de moneda: el cliente puede pagar en la divisa que sea.
      // La contadora ve TODOS los ABONOS y decide (cruce raw). `factura` se
      // mantiene en la firma por si luego se quiere reactivar algún default.
      void factura;
      let q = supabase
        .from('v_movimientos_bancarios')
        .select('id, fecha, descripcion, referencia, monto, moneda, monto_conciliado, estado_conciliacion')
        .eq('tipo_movimiento', 'ABONO');

      if (hideConciliados) q = q.neq('estado_conciliacion', 'conciliada');
      if (movDesde) q = q.gte('fecha', movDesde);
      if (movHasta) q = q.lte('fecha', movHasta);
      const s = sanitize(movSearch);
      if (s) q = q.or(['descripcion', 'referencia'].map(c => `${c}.ilike.%${s}%`).join(','));

      q = q.order('fecha', { ascending: false, nullsFirst: false }).limit(500);

      const { data, error } = await q;
      if (error) {
        showNotification('error', 'Error al cargar movimientos: ' + error.message);
        setMovs([]); return;
      }
      setMovs(data || []);
    } finally {
      setLoadingMovs(false);
    }
  }, [hideConciliados, movDesde, movHasta, movSearch, showNotification]);

  // Re-cargar movimientos cuando cambian sus filtros (si hay factura activa)
  useEffect(() => {
    if (selected) fetchMovs(selected);
  }, [selected, fetchMovs]);

  // ── Seleccionar factura ────────────────────────────
  const selectFactura = (row: FacturaRow) => {
    setSelected(row);
    setSel({});
    setConcilSum(row.monto_conciliado || 0);
    fetchConciliaciones(row.id);
  };

  // saldo libre de un movimiento = monto − ya aplicado en otras conciliaciones
  const saldoLibre = (m: MovRow) => Number(m.monto) - Number(m.monto_conciliado || 0);

  const toggleMov = (m: MovRow) => {
    setSel(prev => {
      const next = { ...prev };
      if (m.id in next) {
        delete next[m.id];
      } else {
        next[m.id] = String(saldoLibre(m).toFixed(2));
      }
      return next;
    });
  };
  const setMontoAplicado = (id: number, v: string) => setSel(prev => ({ ...prev, [id]: v }));

  const selIds   = Object.keys(sel).map(Number);
  const selSum   = selIds.reduce((s, id) => s + (Number(sel[id]) || 0), 0);
  const saldoFactura = selected ? Number(selected.total || 0) - concilSum : 0;
  const difSeleccion = saldoFactura - selSum;

  // ── Conciliar la selección ─────────────────────────
  const handleConciliar = async () => {
    if (!selected || selIds.length === 0) return;

    // Validar montos. La moneda registrada es la del MOVIMIENTO (no la factura):
    // el cliente puede pagar en otra divisa y se guarda tal cual (raw).
    const movById = new Map(movs.map(m => [m.id, m]));
    const payload = [];
    for (const id of selIds) {
      const monto = Number(sel[id]);
      if (Number.isNaN(monto) || monto <= 0) {
        showNotification('error', 'Todos los montos aplicados deben ser mayores a cero.');
        return;
      }
      payload.push({
        factura_id:     selected.id,
        movimiento_id:  id,
        monto_aplicado: monto,
        moneda:         movById.get(id)?.moneda ?? selected.moneda,
        metodo:         'manual',
        conciliado_por: user?.id ?? null,
      });
    }

    setSaving(true);
    const { error } = await supabase
      .from('conciliaciones')
      .upsert(payload, { onConflict: 'factura_id,movimiento_id' });
    setSaving(false);

    if (error) {
      showNotification('error', 'Error al conciliar: ' + error.message);
      return;
    }

    showNotification('success', `${payload.length} movimiento(s) conciliado(s) con la factura.`);
    setSel({});
    await fetchConciliaciones(selected.id);
    await fetchMovs(selected);
    fetchRows();
  };

  // ── Eliminar una conciliación ──────────────────────
  const handleDelete = async (concilId: number) => {
    if (!selected) return;
    const { error } = await supabase.from('conciliaciones').delete().eq('id', concilId);
    if (error) { showNotification('error', 'No se pudo eliminar: ' + error.message); return; }
    showNotification('success', 'Conciliación eliminada.');
    await fetchConciliaciones(selected.id);
    await fetchMovs(selected);
    fetchRows();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd   = Math.min((page + 1) * PAGE_SIZE, total);
  const hasMovFilters = !!movSearch || !!movDesde || !!movHasta;

  // ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Scale size={20} color="var(--primary-color)" />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Conciliación Bancaria</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Manual · Relaciona varios movimientos ABONO a una factura emitida
            </p>
          </div>
        </div>
      </div>

      {/* Dos paneles */}
      <div style={{ display: 'flex', flex: 1, gap: '16px', padding: '0 24px 24px', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Panel izquierdo: facturas ── */}
        <div style={{ width: '400px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="table-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', flex: 1 }}>
                <Search size={14} color="var(--text-muted)" style={{ marginRight: '6px', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Cliente, folio, RFC…"
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.82rem', background: 'transparent' }}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button onClick={() => setSearchInput('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <select value={estadoFilter} onChange={e => { setEstadoFilter(e.target.value as any); setPage(0); }} style={selectStyle}>
                <option value="todas">Todas</option>
                <option value="pendiente">Pendientes</option>
                <option value="parcial">Parciales</option>
                <option value="conciliada">Conciliadas</option>
              </select>
            </div>

            {/* Lista de facturas */}
            <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                  <Loader2 size={24} className="animate-spin" color="var(--primary-color)" />
                </div>
              )}
              {rows.length === 0 && !loading ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No se encontraron facturas.
                </div>
              ) : (
                rows.map(row => {
                  const badge = estadoBadge(row.estado_conciliacion);
                  const isActive = selected?.id === row.id;
                  return (
                    <div
                      key={row.id}
                      onClick={() => selectFactura(row)}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        background: isActive ? '#eff6ff' : 'white',
                        borderLeft: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{fmtDate(row.fecha)}</span>
                            {row.folio && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>· Folio {row.folio}</span>}
                          </div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.receptor || '—'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>{row.rfc_receptor || ''}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{fmtMoney(row.total, row.moneda)}</p>
                          <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', display: 'inline-block' }}>
                            {badge.label}
                          </span>
                          <button
                            onClick={(e) => openDetail(e, row.id)}
                            title="Ver detalle completo de la factura"
                            style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', padding: '3px 6px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem' }}
                          >
                            <Eye size={13} /> Detalle
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Paginación */}
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{rangeStart}–{rangeEnd} / {total.toLocaleString('es-MX')}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ padding: '4px 8px' }} disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-main)', minWidth: '60px', textAlign: 'center' }}>
                  {page + 1} / {totalPages}
                </span>
                <button className="btn btn-secondary" style={{ padding: '4px 8px' }} disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Panel derecho: workbench ── */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {!selected ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px' }}>
              <ArrowRight size={32} style={{ opacity: 0.3 }} />
              <p style={{ margin: 0, fontSize: '0.95rem' }}>Selecciona una factura para conciliar</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Card info factura */}
              <div className="table-container" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Factura emitida (cliente)</p>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>{selected.receptor || '—'}</h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {selected.rfc_receptor || ''} · {fmtDate(selected.fecha)}
                      {selected.folio ? ` · Folio ${selected.folio}` : ''}
                    </p>
                    {selected.condiciones_pago && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Condiciones de pago: <strong>{selected.condiciones_pago}</strong>
                      </p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total factura</p>
                    <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{fmtMoney(selected.total, selected.moneda)}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: saldoFactura > 0.005 ? '#9a3412' : '#166534', fontWeight: 600 }}>
                      Saldo pendiente: {fmtMoney(saldoFactura, selected.moneda)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Selector de movimientos ABONO */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Link2 size={15} color="var(--primary-color)" />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    Movimientos ABONO — selecciona los que pagan esta factura
                  </span>
                </div>

                {/* Filtros de movimientos */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', flex: '1 1 220px' }}>
                    <Search size={14} color="var(--text-muted)" style={{ marginRight: '6px', flexShrink: 0 }} />
                    <input
                      type="text"
                      placeholder="Ordenante, descripción, referencia…"
                      style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.82rem', background: 'transparent' }}
                      value={movSearchInput}
                      onChange={e => setMovSearchInput(e.target.value)}
                    />
                    {movSearchInput && (
                      <button onClick={() => setMovSearchInput('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Calendar size={14} color="var(--text-muted)" />
                    <input type="date" value={movDesde} onChange={e => setMovDesde(e.target.value)} style={selectStyle} title="Desde" />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>–</span>
                    <input type="date" value={movHasta} onChange={e => setMovHasta(e.target.value)} style={selectStyle} title="Hasta" />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={hideConciliados} onChange={e => setHideConciliados(e.target.checked)} />
                    Ocultar ya conciliados
                  </label>
                  {hasMovFilters && (
                    <button onClick={() => { setMovSearchInput(''); setMovSearch(''); setMovDesde(''); setMovHasta(''); }} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <X size={13} /> Limpiar
                    </button>
                  )}
                </div>

                {/* Lista de movimientos con checkbox */}
                <div className="table-container" style={{ position: 'relative', maxHeight: '420px', overflowY: 'auto' }}>
                  {loadingMovs && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                      <Loader2 size={22} className="animate-spin" color="var(--primary-color)" />
                    </div>
                  )}
                  {movs.length === 0 && !loadingMovs ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No hay movimientos ABONO con estos filtros.
                    </div>
                  ) : (
                    movs.map(m => {
                      const checked = m.id in sel;
                      const libre   = saldoLibre(m);
                      const agotado = libre <= 0.005;
                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '10px 14px', borderBottom: '1px solid var(--border-color)',
                            background: checked ? '#eff6ff' : 'white',
                            opacity: agotado && !checked ? 0.5 : 1,
                          }}
                        >
                          <button
                            onClick={() => !agotado && toggleMov(m)}
                            disabled={agotado && !checked}
                            style={{ background: 'none', border: 'none', cursor: agotado && !checked ? 'not-allowed' : 'pointer', padding: 0, marginTop: '2px', color: checked ? 'var(--primary-color)' : 'var(--text-muted)', flexShrink: 0 }}
                            title={agotado ? 'Movimiento totalmente aplicado' : 'Seleccionar'}
                          >
                            {checked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(m.fecha)}</span>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.descripcion || '—'}
                              </span>
                            </div>
                            {m.referencia && (
                              <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.referencia}>
                                {m.referencia}
                              </p>
                            )}
                            {checked && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Aplicar:</span>
                                <input
                                  type="number" step="0.01" min="0.01"
                                  value={sel[m.id]}
                                  onChange={e => setMontoAplicado(m.id, e.target.value)}
                                  style={{ ...selectStyle, width: '120px', cursor: 'text' }}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{fmtMoney(m.monto, m.moneda)}</p>
                            {Number(m.monto_conciliado) > 0 && (
                              <p style={{ margin: 0, fontSize: '0.72rem', color: agotado ? '#166534' : '#9a3412' }}>
                                libre: {fmtMoney(libre, m.moneda)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Barra de resumen + acción */}
                {selIds.length > 0 && (
                  <div className="table-container" style={{ marginTop: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderColor: 'var(--primary-color)' }}>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Seleccionados</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{selIds.length} mov.</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Suma a aplicar</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmtMoney(selSum, selected.moneda)}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Saldo factura</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmtMoney(saldoFactura, selected.moneda)}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>Diferencia</span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: Math.abs(difSeleccion) < 0.005 ? '#166534' : '#9a3412' }}>
                          {fmtMoney(difSeleccion, selected.moneda)}
                        </span>
                      </div>
                      {selSum > saldoFactura + 0.005 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.76rem', color: '#9a3412' }}>
                          <AlertTriangle size={14} /> La suma excede el saldo
                        </span>
                      )}
                    </div>
                    <button className="btn btn-primary" onClick={handleConciliar} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {saving ? <><Loader2 size={15} className="animate-spin" />Guardando…</> : <><Link2 size={15} />Conciliar {selIds.length} mov.</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Conciliaciones existentes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Clock size={15} color="var(--text-muted)" />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    Conciliaciones registradas ({conciliaciones.length})
                  </span>
                </div>

                {loadingConcil ? (
                  <div style={{ padding: '24px', display: 'flex', justifyContent: 'center' }}>
                    <Loader2 size={20} className="animate-spin" color="var(--primary-color)" />
                  </div>
                ) : conciliaciones.length === 0 ? (
                  <div style={{ padding: '20px 16px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Sin conciliaciones aún para esta factura.
                  </div>
                ) : (
                  <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Movimiento (ordenante)</th>
                          <th>Fecha mov.</th>
                          <th style={{ textAlign: 'right' }}>Monto aplicado</th>
                          <th style={{ textAlign: 'center' }}>Método</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {conciliaciones.map(c => (
                          <tr key={c.id}>
                            <td style={{ maxWidth: '260px', fontSize: '0.82rem' }}>
                              <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.movimientos_bancarios?.descripcion || '—'}
                              </p>
                              {c.movimientos_bancarios?.referencia && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.movimientos_bancarios.referencia}>
                                  {c.movimientos_bancarios.referencia}
                                </p>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              {fmtDate(c.movimientos_bancarios?.fecha || null)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                              {fmtMoney(c.monto_aplicado, c.moneda || selected.moneda)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge" style={{ background: '#f3f4f6', color: '#374151', fontSize: '0.72rem' }}>
                                {c.metodo || 'manual'}
                              </span>
                            </td>
                            <td>
                              <button
                                onClick={() => handleDelete(c.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', display: 'flex', borderRadius: '4px' }}
                                title="Eliminar conciliación"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal de detalle completo de la factura (read-only) ── */}
      {detailOpen && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '760px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ margin: 0 }}>
                Detalle de la factura{detailRow?.receptor ? ` · ${detailRow.receptor}` : ''}
              </h3>
              <button className="modal-close" onClick={closeDetail}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {detailLoading || !detailRow ? (
                <div style={{ padding: '40px', display: 'flex', justifyContent: 'center' }}>
                  <Loader2 size={24} className="animate-spin" color="var(--primary-color)" />
                </div>
              ) : (
                <>
                  <DatosCompletos factura={detailRow} title="Datos completos del comprobante" />
                  <ComplementosCFDI factura={detailRow} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
