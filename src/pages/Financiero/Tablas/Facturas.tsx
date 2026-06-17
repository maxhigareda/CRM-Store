import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, X, Loader2, Save, Database,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';

// ──────────────────────────────────────────────
// Definición de la tabla public.facturas
// ──────────────────────────────────────────────
type Factura = Record<string, any>;

type FieldType = 'text' | 'number' | 'date' | 'textarea' | 'select';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];      // para select
  editable?: boolean;      // default true
  span2?: boolean;         // ocupa 2 columnas en el form
}

// Orden y configuración de TODOS los campos de la factura.
const FIELDS: FieldDef[] = [
  { key: 'tipo_factura', label: 'Tipo de factura', type: 'select', options: ['EMITIDA', 'RECIBIDA'] },
  { key: 'formato_origen', label: 'Formato origen', type: 'select', options: ['XML', 'PDF'] },
  { key: 'tipo', label: 'Tipo CFDI', type: 'text' },
  { key: 'fecha', label: 'Fecha', type: 'date' },
  { key: 'fecha_timbrado', label: 'Fecha timbrado', type: 'date' },
  { key: 'serie', label: 'Serie', type: 'text' },
  { key: 'folio', label: 'Folio', type: 'text' },
  { key: 'emisor', label: 'Emisor', type: 'text', span2: true },
  { key: 'rfc_emisor', label: 'RFC emisor', type: 'text' },
  { key: 'receptor', label: 'Receptor', type: 'text', span2: true },
  { key: 'rfc_receptor', label: 'RFC receptor', type: 'text' },
  { key: 'uso_cfdi', label: 'Uso CFDI', type: 'text' },
  { key: 'moneda', label: 'Moneda', type: 'text' },
  { key: 'subtotal', label: 'Subtotal', type: 'number' },
  { key: 'total', label: 'Total', type: 'number' },
  { key: 'forma_pago', label: 'Forma de pago', type: 'text' },
  { key: 'metodo_pago', label: 'Método de pago', type: 'select', options: ['PUE', 'PPD'] },
  { key: 'categoria', label: 'Categoría', type: 'text' },
  { key: 'cfdi_uuid', label: 'UUID CFDI', type: 'text', span2: true },
  { key: 'conceptos', label: 'Conceptos', type: 'textarea', span2: true },
];

// Columnas de texto sobre las que corre la búsqueda global (server-side ilike).
const SEARCH_COLUMNS = [
  'emisor', 'receptor', 'rfc_emisor', 'rfc_receptor',
  'folio', 'serie', 'conceptos', 'categoria',
];

// Columnas mostradas en la grilla y si son ordenables.
const COLUMNS: { key: string; label: string; sortable: boolean; align?: 'right' | 'center' }[] = [
  { key: 'fecha', label: 'Fecha', sortable: true },
  { key: 'tipo_factura', label: 'Tipo', sortable: true, align: 'center' },
  { key: 'serie', label: 'Serie', sortable: true },
  { key: 'folio', label: 'Folio', sortable: true },
  { key: 'emisor', label: 'Emisor', sortable: true },
  { key: 'receptor', label: 'Receptor', sortable: true },
  { key: 'moneda', label: 'Moneda', sortable: true, align: 'center' },
  { key: 'total', label: 'Total', sortable: true, align: 'right' },
  { key: 'categoria', label: 'Categoría', sortable: true },
];

const PAGE_SIZE = 25;
// Campos NO editables (gestionados por la DB).
const READONLY_KEYS = new Set(['id', 'created_at']);

// ──────────────────────────────────────────────
// Helpers de formato
// ──────────────────────────────────────────────
const fmtMoney = (v: any, moneda?: string) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda && /^[A-Z]{3}$/.test(moneda) ? moneda : 'MXN',
    minimumFractionDigits: 2,
  }).format(n);
};

const fmtCell = (col: string, row: Factura) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return '—';
  if (col === 'total' || col === 'subtotal') return fmtMoney(v, row.moneda);
  return String(v);
};

// Sanitiza el término para usarlo dentro de un filtro .or() de PostgREST.
const sanitize = (s: string) => s.replace(/[(),%*]/g, '').trim();

export default function FacturasTabla() {
  const { showNotification } = useNotification();

  const [rows, setRows] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState('fecha');
  const [sortAsc, setSortAsc] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'' | 'EMITIDA' | 'RECIBIDA'>('');

  // Edición
  const [editing, setEditing] = useState<Factura | null>(null);
  const [form, setForm] = useState<Factura>({});
  const [saving, setSaving] = useState(false);

  // Debounce de la búsqueda (server-side).
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('facturas').select('*', { count: 'exact' });

    if (tipoFilter) q = q.eq('tipo_factura', tipoFilter);

    const s = sanitize(search);
    if (s) {
      const orFilter = SEARCH_COLUMNS.map((c) => `${c}.ilike.%${s}%`).join(',');
      q = q.or(orFilter);
    }

    q = q.order(sortColumn, { ascending: sortAsc, nullsFirst: false });

    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      showNotification('error', 'Error al cargar facturas: ' + error.message);
      setRows([]);
      setTotal(0);
    } else {
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, sortColumn, sortAsc, search, tipoFilter, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) {
      setSortAsc((a) => !a);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
    setPage(0);
  };

  const openEdit = (row: Factura) => {
    setEditing(row);
    setForm({ ...row });
  };

  const closeEdit = () => {
    if (saving) return;
    setEditing(null);
    setForm({});
  };

  const setField = (key: string, value: any) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    // Construir payload solo con campos editables, normalizando vacíos -> null.
    const payload: Factura = {};
    for (const f of FIELDS) {
      if (READONLY_KEYS.has(f.key)) continue;
      let v = form[f.key];
      if (v === '' || v === undefined) v = null;
      if (f.type === 'number' && v !== null) {
        const n = Number(v);
        v = Number.isNaN(n) ? null : n;
      }
      payload[f.key] = v;
    }

    const { data, error } = await supabase
      .from('facturas')
      .update(payload)
      .eq('id', editing.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      showNotification('error', 'No se pudo guardar: ' + error.message);
      return;
    }

    showNotification('success', 'Factura actualizada correctamente.');
    setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    setEditing(null);
    setForm({});
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Database size={20} color="var(--primary-color)" />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Facturas</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Tabla directa <code>public.facturas</code> · {total.toLocaleString('es-MX')} registros
            </p>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="table-container" style={{ position: 'relative' }}>
        {/* Toolbar: búsqueda + filtro (dentro del contenedor de la tabla) */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', flex: '1 1 320px', maxWidth: '440px' }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: '8px', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar por emisor, receptor, RFC, folio, concepto…"
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.875rem', background: 'transparent' }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0, padding: 0, marginLeft: '8px' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <select
            value={tipoFilter}
            onChange={(e) => { setTipoFilter(e.target.value as any); setPage(0); }}
            style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', minWidth: '170px' }}
          >
            <option value="">Todos los tipos</option>
            <option value="EMITIDA">Emitidas</option>
            <option value="RECIBIDA">Recibidas</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto', position: 'relative' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
              <Loader2 size={28} className="animate-spin" color="var(--primary-color)" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && toggleSort(col.key)}
                    style={{
                      cursor: col.sortable ? 'pointer' : 'default',
                      textAlign: col.align || 'left',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      {col.label}
                      {col.sortable && (
                        sortColumn === col.key
                          ? (sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />)
                          : <ArrowUpDown size={13} style={{ opacity: 0.35 }} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    No se encontraron facturas.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openEdit(row)}
                    style={{ cursor: 'pointer' }}
                    className="row-clickable"
                  >
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        style={{
                          textAlign: col.align || 'left',
                          whiteSpace: col.key === 'emisor' || col.key === 'receptor' ? 'normal' : 'nowrap',
                          maxWidth: col.key === 'emisor' || col.key === 'receptor' ? '220px' : undefined,
                        }}
                      >
                        {col.key === 'tipo_factura' ? (
                          <span
                            className="badge"
                            style={{
                              background: row.tipo_factura === 'EMITIDA' ? '#dcfce7' : '#dbeafe',
                              color: row.tipo_factura === 'EMITIDA' ? '#166534' : '#1e40af',
                            }}
                          >
                            {row.tipo_factura}
                          </span>
                        ) : (
                          fmtCell(col.key, row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {rangeStart}–{rangeEnd} de {total.toLocaleString('es-MX')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', minWidth: '90px', textAlign: 'center' }}>
            Página {page + 1} / {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            disabled={page + 1 >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Modal de edición */}
      {editing && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Editar factura</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>id: {editing.id}</span>
              </div>
              <button className="modal-close" onClick={closeEdit}><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '24px 32px', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {FIELDS.map((f) => (
                    <div className="form-group" key={f.key} style={{ gridColumn: f.span2 ? '1 / -1' : undefined, marginBottom: 0 }}>
                      <label>{f.label}</label>
                      {f.type === 'select' ? (
                        <select
                          className="form-input"
                          value={form[f.key] ?? ''}
                          onChange={(e) => setField(f.key, e.target.value)}
                        >
                          <option value="">—</option>
                          {f.options!.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea
                          className="form-input"
                          rows={3}
                          value={form[f.key] ?? ''}
                          onChange={(e) => setField(f.key, e.target.value)}
                          style={{ resize: 'vertical' }}
                        />
                      ) : (
                        <input
                          className="form-input"
                          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                          step={f.type === 'number' ? '0.01' : undefined}
                          value={form[f.key] ?? ''}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '20px 32px', borderTop: '1px solid var(--border-color)', background: '#fcfdfe' }}>
                <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
