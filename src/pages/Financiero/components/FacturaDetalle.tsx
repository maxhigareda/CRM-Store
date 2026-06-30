// Componentes read-only compartidos para mostrar el detalle de una factura (CFDI):
// - <DatosCompletos>: todas las columnas escalares de la fila (dinámico).
// - <ComplementosCFDI>: los JSONB (impuestos, complemento de pago, nómina, relacionados).
// Lo usan el modal de la tabla directa de Facturas y el modal de Conciliación → cero drift.
import React from 'react';

type Factura = Record<string, any>;

// ──────────────────────────────────────────────
// Helpers de formato
// ──────────────────────────────────────────────
export const fmtMoney = (v: any, moneda?: string) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda && /^[A-Z]{3}$/.test(moneda) ? moneda : 'MXN',
    minimumFractionDigits: 2,
  }).format(n);
};

// Los UUID (CFDI y documentos relacionados) siempre se muestran en mayúsculas.
export const upper = (v: any) => (v === null || v === undefined || v === '' ? v : String(v).toUpperCase());

const RAW_LABELS: Record<string, string> = {
  version:                     'Versión CFDI',
  tipo_cambio:                 'Tipo de cambio',
  regimen_fiscal_emisor:       'Régimen fiscal emisor',
  regimen_fiscal_receptor:     'Régimen fiscal receptor',
  domicilio_fiscal_receptor:   'Domicilio fiscal receptor',
  descuento:                   'Descuento',
  condiciones_pago:            'Condiciones de pago',
  exportacion:                 'Exportación',
  lugar_expedicion:            'Lugar de expedición',
  total_impuestos_trasladados: 'Total impuestos trasladados',
  total_impuestos_retenidos:   'Total impuestos retenidos',
  archivo_origen:              'Archivo origen',
  created_at:                  'Registrado en sistema',
};

const RAW_MONEY_KEYS = new Set(['descuento', 'total_impuestos_trasladados', 'total_impuestos_retenidos', 'total', 'subtotal']);
export const JSONB_KEYS = new Set(['impuestos', 'complemento_pago', 'nomina', 'cfdi_relacionados']);

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const fmtRaw = (key: string, value: any, moneda?: string) => {
  if (value === null || value === undefined || value === '') return '—';
  if (RAW_MONEY_KEYS.has(key)) return fmtMoney(value, moneda);
  if (key === 'created_at') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-MX');
  }
  if (key === 'cfdi_uuid') return upper(value);
  return String(value);
};

// ──────────────────────────────────────────────
// Estilos compartidos
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

// ──────────────────────────────────────────────
// Complementos del CFDI (lee las columnas JSONB)
// ──────────────────────────────────────────────
export function ComplementosCFDI({ factura }: { factura: Factura }) {
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
                upper(d.id_documento), [d.serie, d.folio].filter(Boolean).join('-') || '—', d.num_parcialidad,
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
            rows={rel.map((g) => [g.tipo_relacion, (g.uuids ?? []).map(upper).join(', ')])}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Datos escalares de la fila. `skipKeys` excluye columnas ya mostradas en otro
// lugar (ej. el formulario editable de la tabla de Facturas). Sin `skipKeys`
// muestra TODO lo escalar (uso de Conciliación).
// ──────────────────────────────────────────────
export function DatosCompletos({
  factura,
  skipKeys,
  title = 'Datos completos del comprobante',
}: {
  factura: Factura;
  skipKeys?: Set<string>;
  title?: string;
}) {
  const skip = skipKeys ?? new Set<string>();
  const entries = Object.entries(factura).filter(
    ([k, v]) =>
      !skip.has(k) &&
      k !== 'id' &&
      !JSONB_KEYS.has(k) &&
      typeof v !== 'object' &&        // los JSONB / arrays se muestran en ComplementosCFDI
      v !== null && v !== undefined && v !== '',
  );
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>{title}</h4>
      <div style={secStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.02em' }}>
                {RAW_LABELS[k] ?? humanize(k)}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', wordBreak: 'break-word', marginTop: 2 }}>
                {fmtRaw(k, v, factura.moneda)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
