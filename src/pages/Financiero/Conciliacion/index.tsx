import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, X, Loader2, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowUpDown, Scale, Sparkles,
  CheckCircle2, AlertCircle, Clock, Save, Trash2,
  Info, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { useAuth } from '../../../contexts/AuthContext';

// ─────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────
type FacturaRow = Record<string, any>;

interface CandidatoRPC {
  id: string;
  fecha: string;
  descripcion: string | null;
  referencia: string | null;
  monto: number;
  moneda: string;
  monto_conciliado: number;
  saldo_disponible: number;
  dif_monto: number;
  dif_dias: number;
}

interface Sugerencia {
  movimiento_id: string;
  monto_aplicado: number;
  porcentaje: number;
  confianza: 'alta' | 'media' | 'baja';
  razon: string;
  _candidato?: CandidatoRPC;  // enriquecido en frontend
  _fromHermes: boolean;
}

interface ConciliacionExistente {
  id: string;
  movimiento_id: string;
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

const estadoBadge = (conciliado: number, total: number) => {
  if (conciliado <= 0) return { label: 'Pendiente', bg: '#fef9c3', color: '#854d0e' };
  if (conciliado < total) return { label: 'Parcial', bg: '#fed7aa', color: '#9a3412' };
  return { label: 'Conciliada', bg: '#dcfce7', color: '#166534' };
};

const confianzaBadge = (c: string) => {
  if (c === 'alta')  return { bg: '#dcfce7', color: '#166534' };
  if (c === 'media') return { bg: '#dbeafe', color: '#1e40af' };
  return { bg: '#fee2e2', color: '#991b1b' };
};

const WEBHOOK_URL = 'https://n8n.myinfo.la/webhook/oraculo/conciliador';
const PAGE_SIZE   = 20;
const SEARCH_COLUMNS = ['receptor', 'rfc_receptor', 'folio', 'serie', 'emisor'];

// ─────────────────────────────────────────────────────
export default function Conciliacion() {
  const { showNotification } = useNotification();
  const { user }             = useAuth();

  // ── Panel izquierdo: lista de facturas EMITIDAS ────
  const [rows, setRows]           = useState<FacturaRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(0);
  const [sortCol, setSortCol]     = useState('fecha');
  const [sortAsc, setSortAsc]     = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]       = useState('');

  // mapa factura_id → monto conciliado (calculado en JS)
  const [saldoMap, setSaldoMap]   = useState<Record<string, number>>({});
  const [estadoFilter, setEstadoFilter] = useState<'todas' | 'pendientes' | 'parciales'>('todas');

  // ── Panel derecho: workbench ───────────────────────
  const [selected, setSelected]   = useState<FacturaRow | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [candidatosFallback, setCandidatosFallback] = useState<CandidatoRPC[]>([]);
  const [facturaSaldo, setFacturaSaldo] = useState(0);
  const [conciliaciones, setConciliaciones] = useState<ConciliacionExistente[]>([]);
  const [loadingConcil, setLoadingConcil] = useState(false);

  // ── Modal VoBo ─────────────────────────────────────
  const [voboItem, setVoboItem]     = useState<Sugerencia | null>(null);
  const [voboMonto, setVoboMonto]   = useState('');
  const [voboNota, setVoboNota]     = useState('');
  const [voboSaving, setVoboSaving] = useState(false);

  // ── Debounce búsqueda ──────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Fetch facturas EMITIDAS ────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('facturas')
        .select('id, fecha, folio, serie, receptor, rfc_receptor, moneda, total', { count: 'exact' })
        .eq('tipo_factura', 'EMITIDA');

      const s = sanitize(search);
      if (s) q = q.or(SEARCH_COLUMNS.map(c => `${c}.ilike.%${s}%`).join(','));

      q = q.order(sortCol, { ascending: sortAsc, nullsFirst: false });
      q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) {
        showNotification('error', 'Error al cargar facturas: ' + error.message);
        setRows([]); setTotal(0); return;
      }

      const rows = data || [];
      setRows(rows);
      setTotal(count || 0);

      if (rows.length > 0) {
        const ids = rows.map(r => r.id);
        const { data: concilData } = await supabase
          .from('conciliaciones')
          .select('factura_id, monto_aplicado')
          .in('factura_id', ids);
        const map: Record<string, number> = {};
        (concilData || []).forEach(c => {
          map[c.factura_id] = (map[c.factura_id] || 0) + Number(c.monto_aplicado);
        });
        setSaldoMap(map);
      } else {
        setSaldoMap({});
      }
    } finally {
      setLoading(false);
    }
  }, [page, sortCol, sortAsc, search, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Re-cargar saldos cuando cambian conciliaciones del item seleccionado
  const refreshSaldoSelected = useCallback(() => {
    if (!selected) return;
    supabase
      .from('conciliaciones')
      .select('factura_id, monto_aplicado')
      .eq('factura_id', selected.id)
      .then(({ data }) => {
        const monto = (data || []).reduce((s, c) => s + Number(c.monto_aplicado), 0);
        setSaldoMap(prev => ({ ...prev, [selected.id]: monto }));
        setFacturaSaldo((selected.total || 0) - monto);
      });
  }, [selected]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
    setPage(0);
  };

  // ── Fetch conciliaciones existentes de la factura ──
  const fetchConciliaciones = useCallback(async (facturaId: string) => {
    setLoadingConcil(true);
    try {
      const { data, error } = await supabase
        .from('conciliaciones')
        .select('*, movimientos_bancarios(fecha, descripcion, referencia, monto, moneda)')
        .eq('factura_id', facturaId)
        .order('created_at', { ascending: false });
      if (!error) setConciliaciones((data as ConciliacionExistente[]) || []);
    } finally {
      setLoadingConcil(false);
    }
  }, []);

  // ── Seleccionar factura ────────────────────────────
  const selectFactura = (row: FacturaRow) => {
    setSelected(row);
    setSugerencias([]);
    setCandidatosFallback([]);
    const conciliado = saldoMap[row.id] || 0;
    setFacturaSaldo((row.total || 0) - conciliado);
    fetchConciliaciones(row.id);
  };

  // ── Analizar con Hermes ────────────────────────────
  const handleAnalizar = async () => {
    if (!selected) return;
    setAnalyzing(true);
    setSugerencias([]);
    setCandidatosFallback([]);

    try {
      // 1. RPC determinista
      const { data: rpcData, error: rpcError } = await supabase.rpc('candidatos_conciliacion', {
        p_factura_id: selected.id,
      });

      if (rpcError) {
        showNotification('error', 'Error al obtener candidatos: ' + rpcError.message);
        return;
      }

      const { factura_saldo, candidatos } = rpcData as {
        factura: any;
        factura_saldo: number;
        candidatos: CandidatoRPC[];
      };
      setFacturaSaldo(factura_saldo);

      if (!candidatos || candidatos.length === 0) {
        showNotification('info', 'No se encontraron movimientos ABONO candidatos para esta factura.');
        return;
      }

      // 2. Enviar a Hermes vía webhook (con fallback)
      try {
        const body = {
          factura: {
            id:           selected.id,
            total:        selected.total,
            moneda:       selected.moneda,
            fecha:        selected.fecha,
            folio:        selected.folio,
            receptor:     selected.receptor,
            rfc_receptor: selected.rfc_receptor,
          },
          factura_saldo,
          candidatos,
        };

        const res = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const sugs: Sugerencia[] = (json.sugerencias || []).map((s: any) => ({
          ...s,
          _fromHermes: true,
          _candidato: candidatos.find(c => c.id === s.movimiento_id),
        }));

        if (sugs.length === 0) {
          showNotification('info', 'Hermes no encontró coincidencias. Mostrando candidatos por score.');
          setCandidatosFallback(candidatos);
        } else {
          setSugerencias(sugs);
        }
      } catch {
        showNotification('info', 'Hermes no disponible. Mostrando candidatos por score determinista.');
        setCandidatosFallback(candidatos);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Abrir modal VoBo ───────────────────────────────
  const openVobo = (item: Sugerencia) => {
    setVoboItem(item);
    setVoboMonto(String(item.monto_aplicado));
    setVoboNota(item._fromHermes ? item.razon : '');
  };

  const openVoboFromCandidato = (c: CandidatoRPC) => {
    const sugerencia: Sugerencia = {
      movimiento_id: c.id,
      monto_aplicado: Math.min(c.saldo_disponible, facturaSaldo > 0 ? facturaSaldo : c.monto),
      porcentaje: 100,
      confianza: 'media',
      razon: '',
      _candidato: c,
      _fromHermes: false,
    };
    openVobo(sugerencia);
  };

  // ── Confirmar VoBo ─────────────────────────────────
  const handleConfirmVobo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voboItem || !selected) return;
    setVoboSaving(true);

    const monto = Number(voboMonto);
    if (isNaN(monto) || monto <= 0) {
      showNotification('error', 'El monto debe ser mayor a cero.');
      setVoboSaving(false);
      return;
    }

    const { error } = await supabase.from('conciliaciones').insert({
      factura_id:     selected.id,
      movimiento_id:  voboItem.movimiento_id,
      monto_aplicado: monto,
      moneda:         selected.moneda,
      metodo:         voboItem._fromHermes ? 'auto' : 'manual',
      conciliado_por: user?.id ?? null,
      nota:           voboNota.trim() || null,
    });

    setVoboSaving(false);

    if (error) {
      if (error.code === '23505') {
        showNotification('error', 'Este movimiento ya está conciliado con esta factura.');
      } else {
        showNotification('error', 'Error al guardar: ' + error.message);
      }
      return;
    }

    showNotification('success', 'VoBo confirmado. Conciliación registrada.');
    setVoboItem(null);

    // Refrescar conciliaciones + saldo
    await fetchConciliaciones(selected.id);
    refreshSaldoSelected();

    // Quitar la sugerencia aprobada
    setSugerencias(prev => prev.filter(s => s.movimiento_id !== voboItem.movimiento_id));
    setCandidatosFallback(prev => prev.filter(c => c.id !== voboItem.movimiento_id));
  };

  // ── Eliminar conciliación ──────────────────────────
  const handleDelete = async (concilId: string) => {
    const { error } = await supabase.from('conciliaciones').delete().eq('id', concilId);
    if (error) { showNotification('error', 'No se pudo eliminar: ' + error.message); return; }
    showNotification('success', 'Conciliación eliminada.');
    await fetchConciliaciones(selected!.id);
    refreshSaldoSelected();
  };

  // ── Filtro local de estado ─────────────────────────
  const visibleRows = rows.filter(row => {
    if (estadoFilter === 'todas') return true;
    const c = saldoMap[row.id] || 0;
    const t = row.total || 0;
    if (estadoFilter === 'pendientes') return c <= 0;
    if (estadoFilter === 'parciales')  return c > 0 && c < t;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd   = Math.min((page + 1) * PAGE_SIZE, total);

  // ─────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Scale size={20} color="var(--primary-color)" />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Conciliación Bancaria</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Facturas emitidas · Matching con movimientos ABONO · VoBo humano
            </p>
          </div>
        </div>
      </div>

      {/* Dos paneles */}
      <div style={{ display: 'flex', flex: 1, gap: '16px', padding: '0 24px 24px', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Panel izquierdo ── */}
        <div style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="table-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Toolbar */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 10px', flex: 1 }}>
                <Search size={14} color="var(--text-muted)" style={{ marginRight: '6px', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Receptor, folio, RFC…"
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
              <select
                value={estadoFilter}
                onChange={e => setEstadoFilter(e.target.value as any)}
                style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 8px', fontSize: '0.82rem', outline: 'none', cursor: 'pointer' }}
              >
                <option value="todas">Todas</option>
                <option value="pendientes">Pendientes</option>
                <option value="parciales">Parciales</option>
              </select>
            </div>

            {/* Lista de facturas */}
            <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
              {loading && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                  <Loader2 size={24} className="animate-spin" color="var(--primary-color)" />
                </div>
              )}
              {visibleRows.length === 0 && !loading ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No se encontraron facturas.
                </div>
              ) : (
                visibleRows.map(row => {
                  const conciliado = saldoMap[row.id] || 0;
                  const badge = estadoBadge(conciliado, row.total || 0);
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
                        transition: 'background 0.15s',
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
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{fmtMoney(row.total, row.moneda)}</p>
                          <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', marginTop: '4px', display: 'inline-block' }}>
                            {badge.label}
                          </span>
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

        {/* ── Panel derecho ── */}
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
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Factura emitida</p>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>{selected.receptor || '—'}</h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {selected.rfc_receptor || ''} · {fmtDate(selected.fecha)}
                      {selected.folio ? ` · Folio ${selected.folio}` : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Total factura</p>
                    <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{fmtMoney(selected.total, selected.moneda)}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: facturaSaldo > 0 ? '#9a3412' : '#166534', fontWeight: 600 }}>
                      Saldo pendiente: {fmtMoney(facturaSaldo, selected.moneda)}
                    </p>
                  </div>
                </div>

                {/* Botón analizar */}
                <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleAnalizar}
                    disabled={analyzing || facturaSaldo <= 0}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {analyzing ? <><Loader2 size={15} className="animate-spin" />Analizando…</> : <><Sparkles size={15} />Analizar con Hermes</>}
                  </button>
                  {facturaSaldo <= 0 && (
                    <span style={{ fontSize: '0.82rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> Totalmente conciliada
                    </span>
                  )}
                </div>
              </div>

              {/* Sugerencias de Hermes */}
              {sugerencias.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Sparkles size={15} color="var(--primary-color)" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Sugerencias de Hermes</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {sugerencias.map(s => {
                      const cb = confianzaBadge(s.confianza);
                      return (
                        <div key={s.movimiento_id} className="table-container" style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                <span className="badge" style={{ background: cb.bg, color: cb.color, fontSize: '0.72rem' }}>
                                  {s.confianza.toUpperCase()}
                                </span>
                                {s.porcentaje < 100 && (
                                  <span className="badge" style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '0.72rem' }}>
                                    {s.porcentaje}% del pago
                                  </span>
                                )}
                              </div>
                              {s._candidato && (
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e293b', fontWeight: 600 }}>
                                  {fmtDate(s._candidato.fecha)} · {s._candidato.descripcion || s._candidato.referencia || '—'}
                                </p>
                              )}
                              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px' }}>
                                {s.razon}
                              </p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                                {fmtMoney(s.monto_aplicado, selected.moneda)}
                              </p>
                              {s._candidato && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  mov. total: {fmtMoney(s._candidato.monto, selected.moneda)}
                                </p>
                              )}
                              <button
                                className="btn btn-primary"
                                onClick={() => openVobo(s)}
                                style={{ marginTop: '8px', padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <CheckCircle2 size={14} /> VoBo
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Candidatos fallback (sin Hermes) */}
              {candidatosFallback.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Info size={15} color="var(--text-muted)" />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Candidatos por score determinista</span>
                  </div>
                  <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Descripción</th>
                          <th style={{ textAlign: 'right' }}>Monto</th>
                          <th style={{ textAlign: 'right' }}>Saldo libre</th>
                          <th style={{ textAlign: 'right' }}>Dif. $</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidatosFallback.map(c => (
                          <tr key={c.id}>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDate(c.fecha)}</td>
                            <td style={{ maxWidth: '200px', fontSize: '0.82rem' }}>
                              <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion || '—'}</p>
                              {c.referencia && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.referencia}</p>}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.85rem' }}>{fmtMoney(c.monto, c.moneda)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{fmtMoney(c.saldo_disponible, c.moneda)}</td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: '0.82rem', color: c.dif_monto < 1 ? '#166534' : 'var(--text-muted)' }}>
                              {fmtMoney(c.dif_monto, c.moneda)}
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                onClick={() => openVoboFromCandidato(c)}
                                style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                              >
                                <CheckCircle2 size={13} /> VoBo
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
                          <th>Movimiento</th>
                          <th>Fecha mov.</th>
                          <th style={{ textAlign: 'right' }}>Monto aplicado</th>
                          <th style={{ textAlign: 'center' }}>Método</th>
                          <th>Nota</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {conciliaciones.map(c => (
                          <tr key={c.id}>
                            <td style={{ maxWidth: '180px', fontSize: '0.82rem' }}>
                              <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.movimientos_bancarios?.descripcion || '—'}
                              </p>
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              {fmtDate(c.movimientos_bancarios?.fecha || null)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                              {fmtMoney(c.monto_aplicado, c.moneda || selected.moneda)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className="badge" style={{ background: c.metodo === 'auto' ? '#dbeafe' : '#f3f4f6', color: c.metodo === 'auto' ? '#1e40af' : '#374151', fontSize: '0.72rem' }}>
                                {c.metodo || 'manual'}
                              </span>
                            </td>
                            <td style={{ maxWidth: '160px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.nota || '—'}
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

      {/* ── Modal VoBo ── */}
      {voboItem && (
        <div className="modal-overlay" onClick={() => !voboSaving && setVoboItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ margin: 0 }}>Confirmar VoBo</h3>
              <button className="modal-close" onClick={() => !voboSaving && setVoboItem(null)}><X size={20} /></button>
            </div>

            <form onSubmit={handleConfirmVobo}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Info movimiento */}
                {voboItem._candidato && (
                  <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Movimiento bancario</p>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{voboItem._candidato.descripcion || voboItem._candidato.referencia || '—'}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {fmtDate(voboItem._candidato.fecha)} · Total: {fmtMoney(voboItem._candidato.monto, voboItem._candidato.moneda)} · Saldo libre: {fmtMoney(voboItem._candidato.saldo_disponible, voboItem._candidato.moneda)}
                    </p>
                  </div>
                )}

                {/* Info factura */}
                <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '12px 14px' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Factura emitida</p>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{selected!.receptor}</p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Total: {fmtMoney(selected!.total, selected!.moneda)} · Saldo pendiente: {fmtMoney(facturaSaldo, selected!.moneda)}
                  </p>
                </div>

                {/* Monto aplicado */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Monto aplicado ({selected!.moneda})</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={voboMonto}
                    onChange={e => setVoboMonto(e.target.value)}
                  />
                </div>

                {/* Nota */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Nota (opcional)</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Ej. Complemento de pago 25%, referencia SPEI…"
                    value={voboNota}
                    onChange={e => setVoboNota(e.target.value)}
                  />
                </div>

                {voboItem._fromHermes && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px' }}>
                    <AlertCircle size={14} color="#166534" />
                    <span style={{ fontSize: '0.78rem', color: '#166534' }}>Se registrará como <strong>auto</strong> (sugerido por Hermes).</span>
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px', borderTop: '1px solid var(--border-color)', background: '#fcfdfe' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setVoboItem(null)} disabled={voboSaving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={voboSaving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {voboSaving ? <><Loader2 size={15} className="animate-spin" />Guardando…</> : <><Save size={15} />Confirmar VoBo</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
