import { supabase } from '../../../lib/supabase';

// ──────────────────────────────────────────────
// Tipos (datos ya agregados que devuelve el RPC dashboard_financiero)
// ──────────────────────────────────────────────
export interface KPIs {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  ivaTotal: number;
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
  totalRegistros: number;   // total de filas en public.facturas (sin filtrar)
  kpis: KPIs;
  monthly: MonthlySerie[];
  categorias: CategoriaTotal[];
  proveedores: ProveedorTotal[];
  ultimas: UltimaFactura[];
  mesesDisponibles: string[];
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
export const formatMXN = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const num = (v: unknown): number => Number(v) || 0;

// ──────────────────────────────────────────────
// Fuente de datos: RPC server-side (una sola petición, payload ya agregado)
// ──────────────────────────────────────────────
/**
 * Llama a public.dashboard_financiero(p_mes, p_tipo) y normaliza el JSON.
 * Toda la agregación ocurre en Postgres; aquí solo mapeamos snake_case -> camelCase.
 */
export async function fetchDashboard(mes: string, tipo: string): Promise<DashboardData> {
  const { data, error } = await supabase.rpc('dashboard_financiero', {
    p_mes: mes,
    p_tipo: tipo,
  });
  if (error) throw new Error(error.message);

  const d = (data ?? {}) as any;
  const k = d.kpis ?? {};

  const totalIngresos = num(k.total_ingresos);
  const totalGastos = num(k.total_gastos);
  const numFacturas = num(k.num_facturas);

  return {
    totalRegistros: num(d.total_registros),
    kpis: {
      totalIngresos,
      totalGastos,
      balance: totalIngresos - totalGastos,
      ivaTotal: num(k.iva_total),
      numFacturas,
      ticketPromedio: numFacturas > 0 ? (totalIngresos + totalGastos) / numFacturas : 0,
    },
    monthly: (d.monthly ?? []).map((m: any): MonthlySerie => ({
      month: m.month,
      ingresos: num(m.ingresos),
      gastos: num(m.gastos),
    })),
    categorias: (d.categorias ?? []).map((c: any): CategoriaTotal => ({
      categoria: c.categoria,
      total: num(c.total),
    })),
    proveedores: (d.proveedores ?? []).map((p: any): ProveedorTotal => ({
      emisor: p.emisor,
      total: num(p.total),
    })),
    ultimas: (d.ultimas ?? []).map((u: any): UltimaFactura => ({
      fecha: u.fecha ?? '',
      emisor: (u.emisor ?? '').trim(),
      rfcEmisor: u.rfc_emisor ?? '',
      categoria: (u.categoria ?? '').trim(),
      total: num(u.total),
      tipoFactura: (u.tipo_factura ?? '').trim().toUpperCase(),
    })),
    mesesDisponibles: d.meses_disponibles ?? [],
  };
}
