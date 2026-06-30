import { supabase } from '../../../lib/supabase';

// ──────────────────────────────────────────────
// Tipos del dashboard (agregados en código a partir de public.facturas)
// ──────────────────────────────────────────────
export interface KPIs {
  totalIngresos: number;   // ventas: EMITIDA tipo I (MXN)
  totalGastos: number;     // compras: RECIBIDA tipo I (MXN)
  nominaTotal: number;     // EMITIDA tipo N (complemento de nómina)
  balance: number;         // ingresos − gastos − nómina
  ivaTotal: number;        // IVA trasladado real (total_impuestos_trasladados)
  numFacturas: number;
  ticketPromedio: number;
}

export interface MonthlySerie {
  month: string;        // "YYYY-MM"
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

export interface UltimaFactura {
  fecha: string;        // "YYYY-MM-DD"
  emisor: string;
  rfcEmisor: string;
  categoria: string;
  total: number;
  tipoFactura: string;  // "EMITIDA" | "RECIBIDA"
}

export interface DashboardData {
  totalRegistros: number;
  kpis: KPIs;
  monthly: MonthlySerie[];
  categorias: CategoriaTotal[];
  proveedores: ProveedorTotal[];
  ultimas: UltimaFactura[];
  mesesDisponibles: string[];
}

// Forma cruda de cada fila que traemos de Supabase
interface FacturaRow {
  tipo_factura: string | null;
  tipo: string | null;
  fecha: string | null;
  emisor: string | null;
  rfc_emisor: string | null;
  categoria: string | null;
  moneda: string | null;
  tipo_cambio: number | null;
  subtotal: number | null;
  total: number | null;
  total_impuestos_trasladados: number | null;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
export const formatMXN = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const num = (v: unknown): number => Number(v) || 0;

// Normaliza cualquier importe a MXN usando el tipo de cambio del comprobante.
const toMXN = (r: FacturaRow): number => {
  const total = num(r.total);
  if (r.moneda && r.moneda !== 'MXN' && r.moneda !== 'XXX' && r.tipo_cambio) {
    return total * num(r.tipo_cambio);
  }
  return total;
};

// ──────────────────────────────────────────────
// Fuente de datos: consulta directa a public.facturas + agregación en código.
// Transparente (sin RPC server-side), suficiente para ~miles de filas.
// ──────────────────────────────────────────────
export async function fetchDashboard(mes: string, tipo: string): Promise<DashboardData> {
  // PostgREST topa en 1000 filas por request → paginamos hasta traer todo.
  const COLS = 'tipo_factura,tipo,fecha,emisor,rfc_emisor,categoria,moneda,tipo_cambio,subtotal,total,total_impuestos_trasladados';
  const PAGE = 1000;
  const all: FacturaRow[] = [];
  let count = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count: c } = await supabase
      .from('facturas')
      .select(COLS, { count: 'exact' })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (c != null) count = c;
    const batch = (data ?? []) as FacturaRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Meses disponibles (de todo el universo, antes de filtrar)
  const mesesDisponibles = [...new Set(all.map((r) => (r.fecha ?? '').slice(0, 7)).filter(Boolean))]
    .sort()
    .reverse();

  // Filtros
  const rows = all.filter((r) => {
    if (mes !== 'todos' && (r.fecha ?? '').slice(0, 7) !== mes) return false;
    if (tipo === 'emitidas' && r.tipo_factura !== 'EMITIDA') return false;
    if (tipo === 'recibidas' && r.tipo_factura !== 'RECIBIDA') return false;
    return true;
  });

  const esIngreso = (r: FacturaRow) => r.tipo_factura === 'EMITIDA' && r.tipo === 'I';
  const esGasto   = (r: FacturaRow) => r.tipo_factura === 'RECIBIDA' && r.tipo === 'I';
  const esNomina  = (r: FacturaRow) => r.tipo_factura === 'EMITIDA' && r.tipo === 'N';

  let totalIngresos = 0, totalGastos = 0, nominaTotal = 0, ivaTotal = 0, numFacturas = 0;
  const monthlyMap = new Map<string, { ingresos: number; gastos: number }>();
  const categoriaMap = new Map<string, number>();
  const proveedorMap = new Map<string, number>();

  for (const r of rows) {
    const mxn = toMXN(r);
    const mesKey = (r.fecha ?? '').slice(0, 7);
    if (!monthlyMap.has(mesKey)) monthlyMap.set(mesKey, { ingresos: 0, gastos: 0 });

    if (esIngreso(r)) {
      totalIngresos += mxn;
      numFacturas++;
      ivaTotal += num(r.total_impuestos_trasladados);
      monthlyMap.get(mesKey)!.ingresos += mxn;
    } else if (esGasto(r)) {
      totalGastos += mxn;
      numFacturas++;
      monthlyMap.get(mesKey)!.gastos += mxn;
      categoriaMap.set(r.categoria?.trim() || 'Sin categoría', (categoriaMap.get(r.categoria?.trim() || 'Sin categoría') ?? 0) + mxn);
      const prov = r.emisor?.trim() || r.rfc_emisor || '—';
      proveedorMap.set(prov, (proveedorMap.get(prov) ?? 0) + mxn);
    } else if (esNomina(r)) {
      nominaTotal += mxn;
    }
  }

  const monthly: MonthlySerie[] = [...monthlyMap.entries()]
    .filter(([m]) => m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ingresos: v.ingresos, gastos: v.gastos }));

  const categorias: CategoriaTotal[] = [...categoriaMap.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const proveedores: ProveedorTotal[] = [...proveedorMap.entries()]
    .map(([emisor, total]) => ({ emisor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const ultimas: UltimaFactura[] = [...rows]
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
    .slice(0, 10)
    .map((r) => ({
      fecha: r.fecha ?? '',
      emisor: (r.emisor ?? '').trim(),
      rfcEmisor: r.rfc_emisor ?? '',
      categoria: (r.categoria ?? '').trim(),
      total: toMXN(r),
      tipoFactura: (r.tipo_factura ?? '').trim().toUpperCase(),
    }));

  return {
    totalRegistros: count ?? all.length,
    kpis: {
      totalIngresos,
      totalGastos,
      nominaTotal,
      balance: totalIngresos - totalGastos - nominaTotal,
      ivaTotal,
      numFacturas,
      ticketPromedio: numFacturas > 0 ? (totalIngresos + totalGastos) / numFacturas : 0,
    },
    monthly,
    categorias,
    proveedores,
    ultimas,
    mesesDisponibles,
  };
}
