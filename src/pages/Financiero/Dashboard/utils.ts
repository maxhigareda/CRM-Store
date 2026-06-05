import Papa from 'papaparse';

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────
export interface Factura {
  uuid: string;
  fecha: string;          // "YYYY-MM-DD HH:mm:ss"
  fechaTimbrado: string;
  tipo: string;           // "I" | "P" | "E"
  serie: string;
  folio: string;
  emisor: string;
  rfcEmisor: string;
  receptor: string;
  rfcReceptor: string;
  usoCfdi: string;
  moneda: string;
  subtotal: number;
  total: number;
  formaPago: string;
  metodoPago: string;
  conceptos: string;
  categoria: string;
  tipoFactura: string;    // "EMITIDA" | "RECIBIDA"
}

export interface KPIs {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  ivaTotal: number;
  numFacturas: number;
  ticketPromedio: number;
}

export interface MonthlySerie {
  month: string;
  ingresos: number;
  gastos: number;
}

export interface CategoriaTotal {
  categoria: string;
  total: number;
}

export interface ProveedorTotal {
  emisor: string;
  total: number;
}

// ──────────────────────────────────────────────
// Parser CSV
// ──────────────────────────────────────────────
export function parseCSV(text: string): Factura[] {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  }) as { data: Record<string, string>[] };

  return result.data
    .filter((row: Record<string, string>) => row['uuid'] || row['UUID'])
    .map((row: Record<string, string>): Factura => ({
      uuid:          row['uuid']           ?? '',
      fecha:         row['fecha']          ?? '',
      fechaTimbrado: row['fecha-timbrado'] ?? '',
      tipo:          row['tipo']           ?? '',
      serie:         row['serie']          ?? '',
      folio:         row['folio']          ?? '',
      emisor:        (row['emisor']        ?? '').trim(),
      rfcEmisor:     row['rfc-emisor']     ?? '',
      receptor:      row['receptor']       ?? '',
      rfcReceptor:   row['rfc-receptor']   ?? '',
      usoCfdi:       row['uso-cfdi']       ?? '',
      moneda:        row['moneda']         ?? '',
      subtotal:      parseFloat(row['subtotal'] ?? '0') || 0,
      total:         parseFloat(row['total']    ?? '0') || 0,
      formaPago:     row['forma-pago']     ?? '',
      metodoPago:    row['metodo-pago']    ?? '',
      conceptos:     row['conceptos']      ?? '',
      categoria:     (row['categoria']     ?? '').trim(),
      tipoFactura:   (row['tipo de factura'] ?? '').trim().toUpperCase(),
    }));
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
/** Filas relevantes: excluye complementos de pago (tipo P y moneda XXX con total 0) */
function facturasMonto(rows: Factura[]): Factura[] {
  return rows.filter((r) => r.tipo !== 'P' && r.moneda !== 'XXX' && r.total > 0);
}

export const formatMXN = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

// ──────────────────────────────────────────────
// Aggregations
// ──────────────────────────────────────────────
export function computeKPIs(rows: Factura[]): KPIs {
  const valid = facturasMonto(rows);

  const emitidas  = valid.filter((r) => r.tipoFactura === 'EMITIDA');
  const recibidas = valid.filter((r) => r.tipoFactura === 'RECIBIDA');

  const totalIngresos = emitidas.reduce((s, r) => s + r.total, 0);
  const totalGastos   = recibidas.reduce((s, r) => s + r.total, 0);
  const ivaTotal      = valid.reduce((s, r) => s + Math.max(0, r.total - r.subtotal), 0);
  const numFacturas   = valid.length;
  const ticketPromedio = numFacturas > 0 ? (totalIngresos + totalGastos) / numFacturas : 0;

  return {
    totalIngresos,
    totalGastos,
    balance: totalIngresos - totalGastos,
    ivaTotal,
    numFacturas,
    ticketPromedio,
  };
}

export function monthlySeries(rows: Factura[]): MonthlySerie[] {
  const valid = facturasMonto(rows);
  const map: Record<string, { ingresos: number; gastos: number }> = {};

  for (const r of valid) {
    const month = r.fecha.slice(0, 7); // "YYYY-MM"
    if (!map[month]) map[month] = { ingresos: 0, gastos: 0 };
    if (r.tipoFactura === 'EMITIDA')   map[month].ingresos += r.total;
    if (r.tipoFactura === 'RECIBIDA')  map[month].gastos   += r.total;
  }

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));
}

export function byCategoria(rows: Factura[], topN = 10): CategoriaTotal[] {
  const valid = facturasMonto(rows).filter((r) => r.tipoFactura === 'RECIBIDA');
  const map: Record<string, number> = {};

  for (const r of valid) {
    const cat = r.categoria || 'Sin categoría';
    map[cat] = (map[cat] ?? 0) + r.total;
  }

  return Object.entries(map)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

export function topProveedores(rows: Factura[], topN = 8): ProveedorTotal[] {
  const valid = facturasMonto(rows).filter((r) => r.tipoFactura === 'RECIBIDA');
  const map: Record<string, number> = {};

  for (const r of valid) {
    const emisor = r.emisor || r.rfcEmisor || 'Desconocido';
    map[emisor] = (map[emisor] ?? 0) + r.total;
  }

  return Object.entries(map)
    .map(([emisor, total]) => ({ emisor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

/** Extrae los meses únicos del dataset (YYYY-MM), ordenados */
export function getMonths(rows: Factura[]): string[] {
  const months = new Set(rows.map((r) => r.fecha.slice(0, 7)).filter(Boolean));
  return Array.from(months).sort();
}
