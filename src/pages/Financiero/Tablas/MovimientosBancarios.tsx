import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Loader2, Save, Database, UploadCloud,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  File, FileText, CheckCircle2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';

// ──────────────────────────────────────────────
// Definición de la tabla public.movimientos_bancarios
// ──────────────────────────────────────────────
type Movimiento = Record<string, any>;
type FieldType = 'text' | 'number' | 'date' | 'select';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  span2?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: 'banco',           label: 'Banco',           type: 'text' },
  { key: 'cuenta',          label: 'Cuenta',          type: 'text' },
  { key: 'moneda',          label: 'Moneda',          type: 'select', options: ['MXN', 'USD'] },
  { key: 'fecha',           label: 'Fecha',           type: 'date' },
  { key: 'tipo_movimiento', label: 'Tipo movimiento', type: 'select', options: ['CARGO', 'ABONO'] },
  { key: 'monto',           label: 'Monto',           type: 'number' },
  { key: 'saldo',           label: 'Saldo',           type: 'number' },
  { key: 'descripcion',     label: 'Descripción',     type: 'text', span2: true },
  { key: 'referencia',      label: 'Referencia',      type: 'text', span2: true },
  { key: 'archivo_origen',  label: 'Archivo origen',  type: 'text', span2: true },
];

const SEARCH_COLUMNS = ['descripcion', 'referencia', 'banco', 'cuenta', 'archivo_origen'];

const COLUMNS: { key: string; label: string; sortable: boolean; align?: 'right' | 'center' }[] = [
  { key: 'fecha',           label: 'Fecha',       sortable: true },
  { key: 'tipo_movimiento', label: 'Tipo',         sortable: true, align: 'center' },
  { key: 'banco',           label: 'Banco',        sortable: true },
  { key: 'moneda',          label: 'Moneda',       sortable: true, align: 'center' },
  { key: 'descripcion',     label: 'Descripción',  sortable: true },
  { key: 'referencia',      label: 'Referencia',   sortable: true },
  { key: 'monto',           label: 'Monto',        sortable: true, align: 'right' },
  { key: 'saldo',           label: 'Saldo',        sortable: true, align: 'right' },
];

const PAGE_SIZE = 25;
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

const fmtCell = (col: string, row: Movimiento) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return '—';
  if (col === 'monto' || col === 'saldo') return fmtMoney(v, row.moneda);
  return String(v);
};

const sanitize = (s: string) => s.replace(/[(),%*]/g, '').trim();

export default function MovimientosBancariosTabla() {
  const { showNotification } = useNotification();

  // ── Tabla ──────────────────────────────────
  const [rows, setRows]     = useState<Movimiento[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage]                 = useState(0);
  const [sortColumn, setSortColumn]     = useState('fecha');
  const [sortAsc, setSortAsc]           = useState(false);
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [monedaFilter, setMonedaFilter] = useState<'' | 'MXN' | 'USD'>('');
  const [tipoFilter, setTipoFilter]     = useState<'' | 'CARGO' | 'ABONO'>('');

  const [editing, setEditing] = useState<Movimiento | null>(null);
  const [form, setForm]       = useState<Movimiento>({});
  const [saving, setSaving]   = useState(false);

  // ── Upload ─────────────────────────────────
  const [showUpload, setShowUpload]       = useState(false);
  const [isDragging, setIsDragging]       = useState(false);
  const [uploadFiles, setUploadFiles]     = useState<File[]>([]);
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Debounce búsqueda ──────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('movimientos_bancarios').select('*', { count: 'exact' });

    if (monedaFilter) q = q.eq('moneda', monedaFilter);
    if (tipoFilter)   q = q.eq('tipo_movimiento', tipoFilter);

    const s = sanitize(search);
    if (s) {
      q = q.or(SEARCH_COLUMNS.map((c) => `${c}.ilike.%${s}%`).join(','));
    }

    q = q.order(sortColumn, { ascending: sortAsc, nullsFirst: false });
    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      showNotification('error', 'Error al cargar movimientos: ' + error.message);
      setRows([]); setTotal(0);
    } else {
      setRows(data || []); setTotal(count || 0);
    }
    setLoading(false);
  }, [page, sortColumn, sortAsc, search, monedaFilter, tipoFilter, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortAsc((a) => !a);
    else { setSortColumn(col); setSortAsc(true); }
    setPage(0);
  };

  const openEdit  = (row: Movimiento) => { setEditing(row); setForm({ ...row }); };
  const closeEdit = () => { if (saving) return; setEditing(null); setForm({}); };
  const setField  = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    const payload: Movimiento = {};
    for (const f of FIELDS) {
      if (READONLY_KEYS.has(f.key)) continue;
      let v = form[f.key];
      if (v === '' || v === undefined) v = null;
      if (f.type === 'number' && v !== null) { const n = Number(v); v = Number.isNaN(n) ? null : n; }
      payload[f.key] = v;
    }

    const { data, error } = await supabase.from('movimientos_bancarios').update(payload).eq('id', editing.id).select().single();
    setSaving(false);

    if (error) { showNotification('error', 'No se pudo guardar: ' + error.message); return; }
    showNotification('success', 'Movimiento actualizado correctamente.');
    setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    setEditing(null); setForm({});
  };

  // ── Handlers de upload ─────────────────────
  const validateAndAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid: File[] = [];
    const invalid: string[] = [];
    Array.from(newFiles).forEach((file) => {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        if (!uploadFiles.some((f) => f.name === file.name && f.size === file.size)) valid.push(file);
      } else {
        invalid.push(file.name);
      }
    });
    if (invalid.length > 0) showNotification('error', `Archivos ignorados: ${invalid.join(', ')}. Solo .txt`);
    if (valid.length > 0) { setUploadFiles((prev) => [...prev, ...valid]); setUploadSuccess(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); validateAndAddFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAddFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true); setUploadSuccess(false);
    try {
      const formData = new FormData();
      uploadFiles.forEach((file) => formData.append('files', file));
      const response = await fetch('https://n8n.myinfo.la/webhook/oraculo/normalizador-edos-cuenta', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`Error del servidor: ${response.statusText}`);
      showNotification('success', `${uploadFiles.length} estado(s) de cuenta enviado(s) para procesamiento.`);
      setUploadFiles([]); setUploadSuccess(true);
      fetchRows();
    } catch (error: any) {
      showNotification('error', 'Error al procesar: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd   = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ background: '#eff6ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Database size={20} color="var(--primary-color)" />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Movimientos Bancarios</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Tabla directa <code>public.movimientos_bancarios</code> · {total.toLocaleString('es-MX')} registros
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowUpload((v) => !v); setUploadSuccess(false); }}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <UploadCloud size={16} />
          Subir estados de cuenta
          {showUpload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Panel de upload colapsable */}
      {showUpload && (
        <div style={{ marginBottom: '20px', background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px', animation: 'fadeIn 0.2s ease' }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--primary-color)' : '#cbd5e1'}`,
              borderRadius: '12px',
              padding: '28px 20px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#eff6ff' : 'white',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: uploadFiles.length > 0 || uploadSuccess ? '16px' : 0,
            }}
          >
            <input type="file" multiple accept=".txt,text/plain" ref={fileInputRef} onChange={handleFileInputChange} style={{ display: 'none' }} />
            {uploadSuccess ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <CheckCircle2 size={24} color="#16a34a" />
                <span style={{ fontWeight: 600, color: '#16a34a' }}>¡Archivos enviados! Puedes subir más.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <UploadCloud size={24} color={isDragging ? 'var(--primary-color)' : '#94a3b8'} />
                <div style={{ textAlign: 'left' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>Haz clic o arrastra archivos aquí</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Solo .txt (estados de cuenta BBVA)</p>
                </div>
              </div>
            )}
          </div>

          {uploadFiles.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <FileText size={15} color="var(--text-muted)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {uploadFiles.length} archivo{uploadFiles.length !== 1 ? 's' : ''} listos
                </span>
              </div>
              <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
                {uploadFiles.map((file, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <div style={{ background: '#dbeafe', padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                        <File size={16} color="#2563eb" />
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button onClick={() => setUploadFiles((f) => f.filter((_, idx) => idx !== i))} disabled={isUploading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleUpload} disabled={isUploading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isUploading ? <><Loader2 size={15} className="animate-spin" />Procesando…</> : `Procesar ${uploadFiles.length} archivo${uploadFiles.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="table-container" style={{ position: 'relative' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', flex: '1 1 320px', maxWidth: '440px' }}>
            <Search size={16} color="var(--text-muted)" style={{ marginRight: '8px', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar por descripción, referencia, banco…"
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.875rem', background: 'transparent' }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0, padding: 0, marginLeft: '8px' }}>
                <X size={16} />
              </button>
            )}
          </div>
          <select
            value={monedaFilter}
            onChange={(e) => { setMonedaFilter(e.target.value as any); setPage(0); }}
            style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', minWidth: '140px' }}
          >
            <option value="">Todas las monedas</option>
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
          <select
            value={tipoFilter}
            onChange={(e) => { setTipoFilter(e.target.value as any); setPage(0); }}
            style={{ background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer', minWidth: '140px' }}
          >
            <option value="">Todos los tipos</option>
            <option value="CARGO">Cargos</option>
            <option value="ABONO">Abonos</option>
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
                  <th key={col.key} onClick={() => col.sortable && toggleSort(col.key)} style={{ cursor: col.sortable ? 'pointer' : 'default', textAlign: col.align || 'left', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>
                      {col.label}
                      {col.sortable && (sortColumn === col.key ? (sortAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} style={{ opacity: 0.35 }} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr><td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No se encontraron movimientos.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} style={{ cursor: 'pointer' }} className="row-clickable">
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ textAlign: col.align || 'left', whiteSpace: col.key === 'descripcion' || col.key === 'referencia' ? 'normal' : 'nowrap', maxWidth: col.key === 'descripcion' || col.key === 'referencia' ? '240px' : undefined }}>
                        {col.key === 'tipo_movimiento' ? (
                          <span className="badge" style={{ background: row.tipo_movimiento === 'CARGO' ? '#fee2e2' : '#dcfce7', color: row.tipo_movimiento === 'CARGO' ? '#991b1b' : '#166534' }}>
                            {row.tipo_movimiento}
                          </span>
                        ) : col.key === 'moneda' ? (
                          <span className="badge" style={{ background: row.moneda === 'USD' ? '#f3e8ff' : '#dbeafe', color: row.moneda === 'USD' ? '#6b21a8' : '#1e40af' }}>
                            {row.moneda}
                          </span>
                        ) : fmtCell(col.key, row)}
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
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{rangeStart}–{rangeEnd} de {total.toLocaleString('es-MX')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn btn-secondary" style={{ padding: '8px 12px' }} disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', minWidth: '90px', textAlign: 'center' }}>Página {page + 1} / {totalPages}</span>
          <button className="btn btn-secondary" style={{ padding: '8px 12px' }} disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Modal de edición */}
      {editing && (
        <div className="modal-overlay" onClick={closeEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Editar movimiento</h3>
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
                        <select className="form-input" value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                          <option value="">—</option>
                          {f.options!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input className="form-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? '0.01' : undefined} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '20px 32px', borderTop: '1px solid var(--border-color)', background: '#fcfdfe' }}>
                <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <><Loader2 size={16} className="animate-spin" />Guardando…</> : <><Save size={16} />Guardar cambios</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
