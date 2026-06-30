import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Loader2, Save, Database, UploadCloud,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  File, FileText, CheckCircle2, ChevronDown, ChevronUp,
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
  options?: string[];
  span2?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: 'tipo_factura',   label: 'Tipo de factura',  type: 'select', options: ['EMITIDA', 'RECIBIDA'] },
  { key: 'formato_origen', label: 'Formato origen',   type: 'select', options: ['XML', 'PDF'] },
  { key: 'tipo',           label: 'Tipo CFDI',        type: 'text' },
  { key: 'fecha',          label: 'Fecha',            type: 'date' },
  { key: 'fecha_timbrado', label: 'Fecha timbrado',   type: 'date' },
  { key: 'serie',          label: 'Serie',            type: 'text' },
  { key: 'folio',          label: 'Folio',            type: 'text' },
  { key: 'emisor',         label: 'Emisor',           type: 'text', span2: true },
  { key: 'rfc_emisor',     label: 'RFC emisor',       type: 'text' },
  { key: 'receptor',       label: 'Receptor',         type: 'text', span2: true },
  { key: 'rfc_receptor',   label: 'RFC receptor',     type: 'text' },
  { key: 'uso_cfdi',       label: 'Uso CFDI',         type: 'text' },
  { key: 'moneda',         label: 'Moneda',           type: 'text' },
  { key: 'subtotal',       label: 'Subtotal',         type: 'number' },
  { key: 'total',          label: 'Total',            type: 'number' },
  { key: 'forma_pago',     label: 'Forma de pago',    type: 'text' },
  { key: 'metodo_pago',    label: 'Método de pago',   type: 'select', options: ['PUE', 'PPD'] },
  { key: 'categoria',      label: 'Categoría',        type: 'text' },
  { key: 'cfdi_uuid',      label: 'UUID CFDI',        type: 'text', span2: true },
  { key: 'conceptos',      label: 'Conceptos',        type: 'textarea', span2: true },
];

const SEARCH_COLUMNS = ['emisor', 'receptor', 'rfc_emisor', 'rfc_receptor', 'folio', 'serie', 'conceptos', 'categoria'];

const COLUMNS: { key: string; label: string; sortable: boolean; align?: 'right' | 'center' }[] = [
  { key: 'fecha',        label: 'Fecha',     sortable: true },
  { key: 'tipo_factura', label: 'Tipo',      sortable: true, align: 'center' },
  { key: 'serie',        label: 'Serie',     sortable: true },
  { key: 'folio',        label: 'Folio',     sortable: true },
  { key: 'emisor',       label: 'Emisor',    sortable: true },
  { key: 'receptor',     label: 'Receptor',  sortable: true },
  { key: 'moneda',       label: 'Moneda',    sortable: true, align: 'center' },
  { key: 'total',        label: 'Total',     sortable: true, align: 'right' },
  { key: 'categoria',    label: 'Categoría', sortable: true },
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

const fmtCell = (col: string, row: Factura) => {
  const v = row[col];
  if (v === null || v === undefined || v === '') return '—';
  if (col === 'total' || col === 'subtotal') return fmtMoney(v, row.moneda);
  return String(v);
};

const sanitize = (s: string) => s.replace(/[(),%*]/g, '').trim();

// ──────────────────────────────────────────────
// Panel read-only: complementos del CFDI (impuestos, pago, nómina, relacionados)
// Lee directamente las columnas JSONB de la fila.
// ──────────────────────────────────────────────
const secStyle: React.CSSProperties = { marginTop: 8, border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' };
const secHead: React.CSSProperties = { padding: '8px 12px', background: '#f8fafc', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' };
const cell: React.CSSProperties = { padding: '6px 10px', fontSize: '0.78rem', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };
const th: React.CSSProperties = { ...cell, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.68rem', background: '#fcfdfe' };

function MiniTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{headers.map((h, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...cell, textAlign: j === 0 ? 'left' : 'right' }}>{c ?? '—'}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplementosCFDI({ factura }: { factura: Factura }) {
  const imp = factura.impuestos as any[] | null;
  const cp = factura.complemento_pago as any | null;
  const nom = factura.nomina as any | null;
  const rel = factura.cfdi_relacionados as any[] | null;
  if (!imp && !cp && !nom && !rel) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>Complementos del CFDI</h4>

      {imp && imp.length > 0 && (
        <div style={secStyle}>
          <div style={secHead}>Impuestos</div>
          <MiniTable
            headers={['Tipo', 'Impuesto', 'Base', 'Tasa', 'Importe']}
            rows={imp.map((t) => [
              t.tipo, t.impuesto, fmtMoney(t.base, factura.moneda),
              t.tasa_o_cuota != null ? `${(Number(t.tasa_o_cuota) * 100).toFixed(2)}%` : '—',
              fmtMoney(t.importe, factura.moneda),
            ])}
          />
        </div>
      )}

      {cp && Array.isArray(cp.pagos) && cp.pagos.map((p: any, idx: number) => (
        <div key={idx} style={secStyle}>
          <div style={secHead}>
            Pago {cp.pagos.length > 1 ? `#${idx + 1}` : ''} · {p.fecha_pago?.slice(0, 10) ?? '—'} · {fmtMoney(p.monto, p.moneda_p)} {p.moneda_p}
            {p.tipo_cambio_p && p.tipo_cambio_p !== 1 ? ` · TC ${p.tipo_cambio_p}` : ''}
          </div>
          {Array.isArray(p.docs_relacionados) && p.docs_relacionados.length > 0 && (
            <MiniTable
              headers={['Doc. relacionado (UUID)', 'Serie-Folio', 'Parc.', 'Saldo ant.', 'Pagado', 'Saldo insoluto']}
              rows={p.docs_relacionados.map((d: any) => [
                d.id_documento, [d.serie, d.folio].filter(Boolean).join('-') || '—', d.num_parcialidad,
                fmtMoney(d.imp_saldo_ant, d.moneda_dr), fmtMoney(d.imp_pagado, d.moneda_dr), fmtMoney(d.imp_saldo_insoluto, d.moneda_dr),
              ])}
            />
          )}
        </div>
      ))}

      {nom && (
        <div style={secStyle}>
          <div style={secHead}>
            Nómina · {nom.empleado?.num_empleado ? `Emp. ${nom.empleado.num_empleado}` : ''} {nom.empleado?.puesto ?? ''}
            {' · '}Percep. {fmtMoney(nom.total_percepciones)} · Deduc. {fmtMoney(nom.total_deducciones)}
          </div>
          <MiniTable
            headers={['Percepción', 'Gravado', 'Exento']}
            rows={(nom.percepciones ?? []).map((x: any) => [x.concepto, fmtMoney(x.importe_gravado), fmtMoney(x.importe_exento)])}
          />
          {(nom.deducciones ?? []).length > 0 && (
            <MiniTable headers={['Deducción', 'Importe']} rows={(nom.deducciones ?? []).map((x: any) => [x.concepto, fmtMoney(x.importe)])} />
          )}
        </div>
      )}

      {rel && rel.length > 0 && (
        <div style={secStyle}>
          <div style={secHead}>CFDI relacionados</div>
          <MiniTable
            headers={['Tipo relación', 'UUIDs']}
            rows={rel.map((g) => [g.tipo_relacion, (g.uuids ?? []).join(', ')])}
          />
        </div>
      )}
    </div>
  );
}

export default function FacturasTabla() {
  const { showNotification } = useNotification();

  // ── Tabla ──────────────────────────────────
  const [rows, setRows]     = useState<Factura[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage]               = useState(0);
  const [sortColumn, setSortColumn]   = useState('fecha');
  const [sortAsc, setSortAsc]         = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [tipoFilter, setTipoFilter]   = useState<'' | 'EMITIDA' | 'RECIBIDA'>('');

  const [editing, setEditing] = useState<Factura | null>(null);
  const [form, setForm]       = useState<Factura>({});
  const [saving, setSaving]   = useState(false);

  // ── Upload ─────────────────────────────────
  const [showUpload, setShowUpload]     = useState(false);
  const [isDragging, setIsDragging]     = useState(false);
  const [uploadFiles, setUploadFiles]   = useState<File[]>([]);
  const [isUploading, setIsUploading]   = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Debounce búsqueda ──────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('facturas').select('*', { count: 'exact' });

    if (tipoFilter) q = q.eq('tipo_factura', tipoFilter);

    const s = sanitize(search);
    if (s) {
      q = q.or(SEARCH_COLUMNS.map((c) => `${c}.ilike.%${s}%`).join(','));
    }

    q = q.order(sortColumn, { ascending: sortAsc, nullsFirst: false });
    const from = page * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) {
      showNotification('error', 'Error al cargar facturas: ' + error.message);
      setRows([]); setTotal(0);
    } else {
      setRows(data || []); setTotal(count || 0);
    }
    setLoading(false);
  }, [page, sortColumn, sortAsc, search, tipoFilter, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortAsc((a) => !a);
    else { setSortColumn(col); setSortAsc(true); }
    setPage(0);
  };

  const openEdit  = (row: Factura) => { setEditing(row); setForm({ ...row }); };
  const closeEdit = () => { if (saving) return; setEditing(null); setForm({}); };
  const setField  = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);

    const payload: Factura = {};
    for (const f of FIELDS) {
      if (READONLY_KEYS.has(f.key)) continue;
      let v = form[f.key];
      if (v === '' || v === undefined) v = null;
      if (f.type === 'number' && v !== null) { const n = Number(v); v = Number.isNaN(n) ? null : n; }
      payload[f.key] = v;
    }

    const { data, error } = await supabase.from('facturas').update(payload).eq('id', editing.id).select().single();
    setSaving(false);

    if (error) { showNotification('error', 'No se pudo guardar: ' + error.message); return; }
    showNotification('success', 'Factura actualizada correctamente.');
    setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...data } : r)));
    setEditing(null); setForm({});
  };

  // ── Handlers de upload ─────────────────────
  const validateAndAddFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid: File[] = [];
    const invalid: string[] = [];
    Array.from(newFiles).forEach((file) => {
      if (file.type === 'application/pdf' || file.type === 'text/xml' || file.name.endsWith('.xml') || file.name.endsWith('.pdf')) {
        if (!uploadFiles.some((f) => f.name === file.name && f.size === file.size)) valid.push(file);
      } else {
        invalid.push(file.name);
      }
    });
    if (invalid.length > 0) showNotification('error', `Archivos ignorados: ${invalid.join(', ')}. Solo .xml y .pdf`);
    if (valid.length > 0) { setUploadFiles((prev) => [...prev, ...valid]); setUploadSuccess(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); validateAndAddFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndAddFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClassify = async () => {
    if (uploadFiles.length === 0) return;
    setIsUploading(true); setUploadSuccess(false);
    try {
      const xmls = uploadFiles.filter((f) => f.name.toLowerCase().endsWith('.xml'));
      const pdfs = uploadFiles.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      const msgs: string[] = [];

      // XML → Edge Function procesar-cfdi (parseo determinista en código, sin n8n).
      if (xmls.length > 0) {
        const files = await Promise.all(
          xmls.map(async (f) => ({ name: f.name, xml: await f.text() })),
        );
        const { data, error } = await supabase.functions.invoke('procesar-cfdi', { body: { files } });
        if (error) throw new Error(error.message);
        const errCount = data?.errors?.length ?? 0;
        msgs.push(`${data?.inserted ?? 0} XML procesado(s)${errCount ? ` · ${errCount} con error` : ''}`);
      }

      // PDF → sigue en n8n por ahora (migración a código pendiente).
      if (pdfs.length > 0) {
        const formData = new FormData();
        pdfs.forEach((file) => formData.append('files', file));
        const response = await fetch('https://n8n.myinfo.la/webhook/oraculo/clasificador-facturas', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Error del servidor (PDF): ${response.statusText}`);
        msgs.push(`${pdfs.length} PDF enviado(s) a clasificación`);
      }

      showNotification('success', msgs.join(' · ') || 'Sin archivos procesables.');
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
            <h1 className="page-title" style={{ margin: 0 }}>Facturas</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Tabla directa <code>public.facturas</code> · {total.toLocaleString('es-MX')} registros
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowUpload((v) => !v); setUploadSuccess(false); }}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
        >
          <UploadCloud size={16} />
          Subir facturas
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
            <input type="file" multiple accept=".pdf,.xml,application/pdf,text/xml" ref={fileInputRef} onChange={handleFileInputChange} style={{ display: 'none' }} />
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
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>Solo .xml y .pdf</p>
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
                      <div style={{ background: file.name.endsWith('.pdf') ? '#fee2e2' : '#fef9c3', padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                        <File size={16} color={file.name.endsWith('.pdf') ? '#ef4444' : '#ca8a04'} />
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
                <button className="btn btn-primary" onClick={handleClassify} disabled={isUploading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isUploading ? <><Loader2 size={15} className="animate-spin" />Clasificando…</> : `Clasificar ${uploadFiles.length} archivo${uploadFiles.length !== 1 ? 's' : ''}`}
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
              placeholder="Buscar por emisor, receptor, RFC, folio, concepto…"
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
                <tr><td colSpan={COLUMNS.length} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No se encontraron facturas.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} style={{ cursor: 'pointer' }} className="row-clickable">
                    {COLUMNS.map((col) => {
                      const truncate = col.key === 'emisor' || col.key === 'receptor';
                      return (
                      <td
                        key={col.key}
                        title={truncate ? String(row[col.key] ?? '') : undefined}
                        style={{
                          textAlign: col.align || 'left',
                          whiteSpace: 'nowrap',
                          maxWidth: truncate ? '220px' : undefined,
                          overflow: truncate ? 'hidden' : undefined,
                          textOverflow: truncate ? 'ellipsis' : undefined,
                        }}
                      >
                        {col.key === 'tipo_factura' ? (
                          <span className="badge" style={{ background: row.tipo_factura === 'EMITIDA' ? '#dcfce7' : '#dbeafe', color: row.tipo_factura === 'EMITIDA' ? '#166534' : '#1e40af' }}>
                            {row.tipo_factura}
                          </span>
                        ) : fmtCell(col.key, row)}
                      </td>
                      );
                    })}
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
                        <select className="form-input" value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                          <option value="">—</option>
                          {f.options!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea className="form-input" rows={3} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} style={{ resize: 'vertical' }} />
                      ) : (
                        <input className="form-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? '0.01' : undefined} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
                <ComplementosCFDI factura={editing} />
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
