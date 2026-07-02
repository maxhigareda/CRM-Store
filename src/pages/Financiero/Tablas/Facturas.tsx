import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Loader2, Save, Database, UploadCloud,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  File, FileText, CheckCircle2, ChevronDown, ChevronUp,
  Tag, Plus, Trash2, Check,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { ConfirmModal } from '../../../components/Modals';
import { ComplementosCFDI, DatosCompletos } from '../components/FacturaDetalle';

// Catalogo de categorias (labels) para clasificar facturas.
interface Categoria { id: number; nombre: string; color: string | null }

// Paleta para el selector de color al crear categorias (misma que Etiquetas).
const CAT_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#1e293b', '#6366f1', '#14b8a6',
  '#f43f5e', '#84cc16', '#eab308', '#d946ef', '#0ea5e9', '#64748b', '#475569', '#f97316', '#a855f7', '#22c55e',
];

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

// Tipos de comprobante CFDI (columna `tipo`)
const TIPO_CFDI_OPTIONS: { value: string; label: string }[] = [
  { value: 'I', label: 'I · Ingreso' },
  { value: 'E', label: 'E · Egreso (nota de crédito)' },
  { value: 'P', label: 'P · Pago (REP)' },
  { value: 'N', label: 'N · Nómina' },
  { value: 'T', label: 'T · Traslado' },
];

const selectStyle: React.CSSProperties = {
  background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px',
  padding: '8px 12px', fontSize: '0.875rem', color: 'var(--text-main)', outline: 'none', cursor: 'pointer',
};

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

// Los componentes read-only del detalle (ComplementosCFDI, DatosCompletos) viven
// en ../components/FacturaDetalle y se comparten con el modal de Conciliación.

// ──────────────────────────────────────────────
// PDF extranjeros: n8n (Extract from File + Hermes) devuelve el array JSON; el
// upsert se hace aquí (n8n ya NO inserta). Webhook configurable abajo.
// ──────────────────────────────────────────────
const N8N_PDF_WEBHOOK = 'https://n8n.myinfo.la/webhook/oraculo/clasificador-facturas';

// Solo se persisten columnas reales de `facturas` (whitelist): si n8n agrega
// campos extra del clasificador (ej. categoria_id, confianza, nota) se ignoran y
// no rompen el INSERT. `categoria` SÍ se persiste (= categoria_nombre del clasificador).
const PDF_FACTURA_COLS = [
  'cfdi_uuid', 'tipo_factura', 'tipo', 'formato_origen', 'fecha', 'fecha_timbrado',
  'serie', 'folio', 'emisor', 'rfc_emisor', 'receptor', 'rfc_receptor', 'uso_cfdi',
  'moneda', 'subtotal', 'total', 'forma_pago', 'metodo_pago', 'conceptos', 'categoria',
];

// Clave determinista para deduplicar PDFs (no traen cfdi_uuid). Incluye conceptos
// para distinguir las filas de una nómina (mismo folio/emisor/fecha, distinta línea).
const pdfDedupKey = (r: any) =>
  ['PDF', r.emisor ?? '', r.folio ?? '', r.fecha ?? '', r.total ?? '', String(r.conceptos ?? '').slice(0, 80)].join('|');

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
  const [tipoCfdiFilter, setTipoCfdiFilter] = useState('');
  const [monedaFilter, setMonedaFilter]     = useState('');
  const [emisorFilter, setEmisorFilter]     = useState('');
  const [receptorFilter, setReceptorFilter] = useState('');
  const [fechaDesde, setFechaDesde]         = useState('');
  const [fechaHasta, setFechaHasta]         = useState('');

  // Valores distintos para poblar los dropdowns (cargados una vez).
  const [emisores, setEmisores]     = useState<string[]>([]);
  const [receptores, setReceptores] = useState<string[]>([]);
  const [monedas, setMonedas]       = useState<string[]>([]);

  const [editing, setEditing] = useState<Factura | null>(null);
  const [form, setForm]       = useState<Factura>({});
  const [saving, setSaving]   = useState(false);

  // ── Borrado físico (hard-delete) ──
  const [confirmDelete, setConfirmDelete] = useState<Factura | null>(null);
  const [deleting, setDeleting]           = useState(false);

  // ── Categorias (labels) + clasificacion masiva ──
  const [categorias, setCategorias]   = useState<Categoria[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoria, setBulkCategoria] = useState('');
  const [applyingBulk, setApplyingBulk]   = useState(false);

  // Manager de categorias (crear / borrar del catalogo)
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);
  const [catSaving, setCatSaving]     = useState(false);

  const colorFor = (nombre?: string | null) =>
    (nombre && categorias.find((c) => c.nombre === nombre)?.color) || '#64748b';

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

  // ── Cargar valores distintos para los dropdowns (una vez) ──
  useEffect(() => {
    (async () => {
      const PAGE = 1000; // PostgREST topa en 1000 → paginamos hasta traer todo
      const emi = new Set<string>(), rec = new Set<string>(), mon = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('facturas')
          .select('emisor, receptor, moneda')
          .range(from, from + PAGE - 1);
        if (error) break;
        const batch = data ?? [];
        batch.forEach((r: any) => {
          if (r.emisor)   emi.add(r.emisor);
          if (r.receptor) rec.add(r.receptor);
          if (r.moneda)   mon.add(r.moneda);
        });
        if (batch.length < PAGE) break;
      }
      setEmisores([...emi].sort((a, b) => a.localeCompare(b, 'es')));
      setReceptores([...rec].sort((a, b) => a.localeCompare(b, 'es')));
      setMonedas([...mon].sort());
    })();
  }, []);

  // ── Catalogo de categorias ─────────────────
  const fetchCategorias = useCallback(async () => {
    const { data, error } = await supabase
      .from('categorias_factura')
      .select('id, nombre, color')
      .order('nombre');
    if (!error) setCategorias(data || []);
  }, []);

  useEffect(() => { fetchCategorias(); }, [fetchCategorias]);

  const handleCreateCategoria = async () => {
    const nombre = newCatName.trim();
    if (!nombre) return;
    setCatSaving(true);
    const { error } = await supabase
      .from('categorias_factura')
      .insert({ nombre, color: newCatColor });
    setCatSaving(false);
    if (error) {
      showNotification('error', error.code === '23505'
        ? `La categoría "${nombre}" ya existe.`
        : 'No se pudo crear la categoría: ' + error.message);
      return;
    }
    showNotification('success', `Categoría "${nombre}" creada.`);
    setNewCatName(''); setNewCatColor(CAT_COLORS[0]);
    fetchCategorias();
  };

  const handleDeleteCategoria = async (c: Categoria) => {
    const { error } = await supabase.from('categorias_factura').delete().eq('id', c.id);
    if (error) { showNotification('error', 'No se pudo borrar: ' + error.message); return; }
    // Nota: las facturas ya clasificadas con este texto NO se tocan (sin FK).
    showNotification('success', `Categoría "${c.nombre}" eliminada del catálogo.`);
    fetchCategorias();
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('facturas').select('*', { count: 'exact' });

    if (tipoFilter)     q = q.eq('tipo_factura', tipoFilter);
    if (tipoCfdiFilter) q = q.eq('tipo', tipoCfdiFilter);
    if (monedaFilter)   q = q.eq('moneda', monedaFilter);
    if (emisorFilter)   q = q.eq('emisor', emisorFilter);
    if (receptorFilter) q = q.eq('receptor', receptorFilter);
    if (fechaDesde)     q = q.gte('fecha', fechaDesde);
    if (fechaHasta)     q = q.lte('fecha', fechaHasta);

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
  }, [page, sortColumn, sortAsc, search, tipoFilter, tipoCfdiFilter, monedaFilter, emisorFilter, receptorFilter, fechaDesde, fechaHasta, showNotification]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const toggleSort = (col: string) => {
    if (sortColumn === col) setSortAsc((a) => !a);
    else { setSortColumn(col); setSortAsc(true); }
    setPage(0);
  };

  // ── Seleccion de filas (para clasificacion masiva) ──
  const toggleRow = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const pageIds = rows.map((r) => r.id as number);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleAllPage = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  // Aplica una categoria (o la quita si viene null) a todas las filas seleccionadas.
  const applyBulkCategoria = async (categoria: string | null) => {
    if (selectedIds.size === 0) return;
    setApplyingBulk(true);
    const ids = [...selectedIds];
    const { error } = await supabase.from('facturas').update({ categoria }).in('id', ids);
    setApplyingBulk(false);
    if (error) { showNotification('error', 'No se pudo clasificar: ' + error.message); return; }
    showNotification('success',
      categoria
        ? `${ids.length} factura(s) clasificadas como "${categoria}".`
        : `Categoría removida de ${ids.length} factura(s).`);
    setRows((prev) => prev.map((r) => (selectedIds.has(r.id) ? { ...r, categoria } : r)));
    clearSelection();
    setBulkCategoria('');
  };

  const hasFilters =
    !!search || !!tipoFilter || !!tipoCfdiFilter || !!monedaFilter ||
    !!emisorFilter || !!receptorFilter || !!fechaDesde || !!fechaHasta;

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setTipoFilter(''); setTipoCfdiFilter(''); setMonedaFilter('');
    setEmisorFilter(''); setReceptorFilter(''); setFechaDesde(''); setFechaHasta('');
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

  // Borrado físico: la factura deja de existir (y por ende no cuenta en nada).
  const handleDeleteFactura = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from('facturas').delete().eq('id', confirmDelete.id);
    setDeleting(false);
    if (error) { showNotification('error', 'No se pudo eliminar: ' + error.message); return; }
    showNotification('success', 'Factura eliminada permanentemente.');
    setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
    setTotal((t) => Math.max(0, t - 1));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(confirmDelete.id); return n; });
    setConfirmDelete(null);
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

      // PDF → n8n (Extract from File + Hermes) devuelve el array de filas; el
      // upsert se hace AQUÍ con la sesión del usuario (n8n ya no inserta).
      if (pdfs.length > 0) {
        const formData = new FormData();
        pdfs.forEach((file) => formData.append('files', file));
        const response = await fetch(N8N_PDF_WEBHOOK, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Error del servidor (PDF): ${response.statusText}`);

        // Defensivo: aceptar array directo o envuelto ({rows|data}), y string con
        // fences de markdown (Hermes a veces los mete pese a la regla).
        let payload: any = await response.json().catch(() => null);
        if (typeof payload === 'string') {
          payload = JSON.parse(payload.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
        }
        const rawRows: any[] = Array.isArray(payload) ? payload : (payload?.rows ?? payload?.data ?? []);

        const errRows = rawRows.filter((r) => r && r.error);
        const okRows  = rawRows.filter((r) => r && !r.error);

        if (okRows.length > 0) {
          const rows = okRows.map((r) => {
            const row: Record<string, any> = {};
            for (const c of PDF_FACTURA_COLS) if (c in r) row[c] = r[c];
            row.formato_origen = 'PDF';
            row.dedup_key = pdfDedupKey(r);
            return row;
          });
          const { error } = await supabase.from('facturas').upsert(rows, { onConflict: 'dedup_key' });
          if (error) throw new Error(`Upsert PDF: ${error.message}`);
        }
        msgs.push(`${okRows.length} fila(s) de PDF cargada(s)${errRows.length ? ` · ${errRows.length} con error de extracción` : ''}`);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowCatManager(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
          >
            <Tag size={16} />
            Categorías
          </button>
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

      {/* Barra de clasificación masiva */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          marginBottom: '12px', padding: '12px 16px', background: '#eff6ff',
          border: '1px solid #bfdbfe', borderRadius: '12px', animation: 'fadeIn 0.2s ease',
        }}>
          <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.9rem' }}>
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <span style={{ color: '#93c5fd' }}>·</span>
          <span style={{ fontSize: '0.85rem', color: '#334155' }}>Clasificar como</span>
          <select
            value={bulkCategoria}
            onChange={(e) => setBulkCategoria(e.target.value)}
            style={{ ...selectStyle, minWidth: '200px' }}
            disabled={applyingBulk}
          >
            <option value="">Elige una categoría…</option>
            {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={!bulkCategoria || applyingBulk}
            onClick={() => applyBulkCategoria(bulkCategoria)}
          >
            {applyingBulk ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Aplicar
          </button>
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={applyingBulk}
            onClick={() => applyBulkCategoria(null)}
            title="Dejar sin categoría las facturas seleccionadas"
          >
            <X size={15} /> Quitar categoría
          </button>
          {categorias.length === 0 && (
            <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => setShowCatManager(true)}>
              <Plus size={15} /> Crear categoría
            </button>
          )}
          <button
            onClick={clearSelection}
            disabled={applyingBulk}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <X size={15} /> Limpiar selección
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="table-container" style={{ position: 'relative' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Fila 1: búsqueda + dropdowns principales */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', flex: '1 1 280px', maxWidth: '440px' }}>
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
            <select value={tipoFilter} onChange={(e) => { setTipoFilter(e.target.value as any); setPage(0); }} style={{ ...selectStyle, minWidth: '150px' }}>
              <option value="">Emitidas y recibidas</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="RECIBIDA">Recibidas</option>
            </select>
            <select value={tipoCfdiFilter} onChange={(e) => { setTipoCfdiFilter(e.target.value); setPage(0); }} style={{ ...selectStyle, minWidth: '160px' }}>
              <option value="">Todos los CFDI</option>
              {TIPO_CFDI_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={monedaFilter} onChange={(e) => { setMonedaFilter(e.target.value); setPage(0); }} style={{ ...selectStyle, minWidth: '120px' }}>
              <option value="">Toda moneda</option>
              {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {/* Fila 2: emisor, receptor, rango de fecha, limpiar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select value={emisorFilter} onChange={(e) => { setEmisorFilter(e.target.value); setPage(0); }} style={{ ...selectStyle, flex: '1 1 200px', maxWidth: '260px' }}>
              <option value="">Todos los emisores</option>
              {emisores.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={receptorFilter} onChange={(e) => { setReceptorFilter(e.target.value); setPage(0); }} style={{ ...selectStyle, flex: '1 1 200px', maxWidth: '260px' }}>
              <option value="">Todos los receptores</option>
              {receptores.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fecha</span>
              <input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(0); }} style={{ ...selectStyle, padding: '7px 10px' }} title="Desde" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>–</span>
              <input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(0); }} style={{ ...selectStyle, padding: '7px 10px' }} title="Hasta" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                <X size={15} /> Limpiar filtros
              </button>
            )}
          </div>
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
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAllPage}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    title="Seleccionar toda la página"
                  />
                </th>
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
                <tr><td colSpan={COLUMNS.length + 1} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>No se encontraron facturas.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} onClick={() => openEdit(row)} style={{ cursor: 'pointer' }} className="row-clickable">
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
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
                        ) : col.key === 'categoria' ? (
                          row.categoria ? (
                            <span className="badge" style={{ background: `${colorFor(row.categoria)}18`, color: colorFor(row.categoria), fontWeight: 700 }}>
                              {row.categoria}
                            </span>
                          ) : '—'
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
                      {f.key === 'categoria' ? (
                        // Categoria: elegir del catalogo predefinido (no texto libre).
                        // Si la factura ya trae un valor que no esta en el catalogo, se
                        // conserva como opcion para no perderlo.
                        <select className="form-input" value={form.categoria ?? ''} onChange={(e) => setField('categoria', e.target.value)}>
                          <option value="">— Sin categoría —</option>
                          {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                          {form.categoria && !categorias.some((c) => c.nombre === form.categoria) && (
                            <option value={form.categoria}>{form.categoria} (fuera de catálogo)</option>
                          )}
                        </select>
                      ) : f.type === 'select' ? (
                        <select className="form-input" value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)}>
                          <option value="">—</option>
                          {f.options!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea className="form-input" rows={3} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} style={{ resize: 'vertical' }} />
                      ) : (
                        <input className="form-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} step={f.type === 'number' ? '0.01' : undefined} value={form[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} style={f.key === 'cfdi_uuid' ? { textTransform: 'uppercase' } : undefined} />
                      )}
                    </div>
                  ))}
                </div>
                <DatosCompletos factura={editing} skipKeys={new Set(FIELDS.map((f) => f.key))} title="Datos completos del comprobante (origen)" />
                <ComplementosCFDI factura={editing} />
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '20px 32px', borderTop: '1px solid var(--border-color)', background: '#fcfdfe' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(editing)} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                  <Trash2 size={16} /> Eliminar factura
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={closeEdit} disabled={saving}>Cerrar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {saving ? <><Loader2 size={16} className="animate-spin" />Guardando…</> : <><Save size={16} />Guardar cambios</>}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: gestión del catálogo de categorías */}
      {showCatManager && (
        <div className="modal-overlay" onClick={() => setShowCatManager(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Categorías</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Catálogo de etiquetas para clasificar facturas
                </span>
              </div>
              <button className="modal-close" onClick={() => setShowCatManager(false)}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
              {/* Crear nueva */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', letterSpacing: '0.02em' }}>
                  NUEVA CATEGORÍA
                </label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej: Servicios contables"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCategoria(); }}
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  <button
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    disabled={catSaving || !newCatName.trim()}
                    onClick={handleCreateCategoria}
                  >
                    {catSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Crear
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {CAT_COLORS.map((c) => (
                    <div
                      key={c}
                      onClick={() => setNewCatColor(c)}
                      style={{ width: '20px', height: '20px', borderRadius: '5px', backgroundColor: c, border: newCatColor === c ? '2px solid #000' : 'none', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </div>

              {/* Lista */}
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: '10px', letterSpacing: '0.02em' }}>
                {categorias.length} CATEGORÍA{categorias.length !== 1 ? 'S' : ''} REGISTRADA{categorias.length !== 1 ? 'S' : ''}
              </label>
              <div style={{ display: 'grid', gap: '8px' }}>
                {categorias.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                    <span className="badge" style={{ background: `${c.color || '#64748b'}18`, color: c.color || '#64748b', fontWeight: 700 }}>
                      {c.nombre}
                    </span>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '6px', color: '#ef4444' }}
                      title="Eliminar del catálogo (no afecta facturas ya clasificadas)"
                      onClick={() => handleDeleteCategoria(c)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {categorias.length === 0 && (
                  <p style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '0.85rem' }}>
                    Aún no hay categorías. Crea la primera arriba.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de borrado físico de factura */}
      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Eliminar factura"
        message={
          `Esta factura se eliminará de forma permanente y dejará de existir en el módulo Financiero ` +
          `(dashboard, conciliación y totales). Esta acción no se puede deshacer.` +
          (confirmDelete ? ` — Folio ${confirmDelete.serie ?? ''} ${confirmDelete.folio ?? ''} · ${fmtMoney(confirmDelete.total, confirmDelete.moneda)}` : '')
        }
        confirmText={deleting ? 'Eliminando…' : 'Sí, eliminar factura'}
        isDestructive={true}
        onConfirm={handleDeleteFactura}
        onClose={() => { if (!deleting) setConfirmDelete(null); }}
      />
    </div>
  );
}
