import { supabase } from '../../../lib/supabase';

// ──────────────────────────────────────────────────────────────────────────
// Cuentas por Cobrar (CxC) — datos y cálculo
//
// Fuente: vista `v_cuentas_por_cobrar` (EMITIDAS tipo 'I' con saldo pendiente,
// cruzadas por NOMBRE con `catalogo_dias_credito`). La vista deriva días de
// crédito + fecha/mes estimados de pago; aquí normalizamos a MXN, segregamos lo
// que no tiene término y bucketizamos el saldo por el MES esperado de cobro.
// ──────────────────────────────────────────────────────────────────────────

export interface CatalogoRow {
  id: number;
  cliente: string;
  dias_credito: number;
  created_at: string;
}

// Forma cruda de la vista v_cuentas_por_cobrar
interface CxCViewRow {
  id: number;
  receptor: string | null;
  rfc_receptor: string | null;
  fecha: string | null;
  moneda: string | null;
  tipo_cambio: number | null;
  total: number | null;
  saldo_pendiente: number | null;
  estado_conciliacion: string | null;
  dias_credito: number | null;          // NULL = receptor sin término en catálogo
  fecha_estimada_pago: string | null;   // YYYY-MM-DD (NULL si sin término)
  mes_estimado_pago: string | null;     // YYYY-MM     (NULL si sin término)
}

// Fila normalizada que consume el componente
export interface CxCRow {
  id: number;
  cliente: string;
  fecha: string;                   // emisión (YYYY-MM-DD)
  diasCredito: number | null;      // null = sin término de crédito
  fechaEstimadaPago: string | null;
  mesEstimadoPago: string | null;  // YYYY-MM
  saldo: number;                   // MXN
  moneda: string;
  estado: string;                  // pendiente | parcial
  diasVencido: number;             // >0 vencida hace N días; <0 vence en N días
}

// Saldo segregado de receptores que NO están en el catálogo
export interface CxCSinTermino {
  saldo: number;                   // MXN
  numFacturas: number;
  numClientes: number;
  clientes: { cliente: string; saldo: number }[]; // para completar el catálogo
}

export interface CxCDataset {
  rows: CxCRow[];                  // solo filas CON término (mes calculable)
  sinTermino: CxCSinTermino;
  mesesDisponibles: string[];      // meses estimados de pago (YYYY-MM), desc
  rango: { minDias: number | null; maxDias: number | null }; // del catálogo
  totalConTermino: number;         // Σ saldo MXN con término
}

// Vista mensual (la selecciona el usuario con el filtro de mes)
export interface CxCMes {
  mes: string;                     // YYYY-MM
  totalEsperado: number;           // Σ saldo que se espera cobrar ese mes (MXN)
  numFacturas: number;
  numClientes: number;
  vencido: number;                 // fecha estimada de pago < hoy
  vigente: number;                 // fecha estimada de pago >= hoy
  porCliente: { cliente: string; saldo: number }[]; // desc
  filas: CxCRow[];                 // detalle, más vencidas primero
}

// ── Helpers ────────────────────────────────────────────────────────────────
const num = (v: unknown): number => Number(v) || 0;

const toMXNAmount = (amount: number, moneda: string | null, tc: number | null): number =>
  moneda && moneda !== 'MXN' && moneda !== 'XXX' && tc ? amount * num(tc) : amount;

const atMidnight = (iso: string): Date => new Date(iso + 'T00:00:00');
const dayDiff = (a: Date, b: Date): number => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

export const formatMXN = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

export const mesLabel = (m: string): string => {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
};

// Mes actual en formato YYYY-MM (zona local)
export const mesActual = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── Carga del dataset CxC ────────────────────────────────────────────────────
export async function fetchCxC(): Promise<CxCDataset> {
  const COLS =
    'id,receptor,rfc_receptor,fecha,moneda,tipo_cambio,total,saldo_pendiente,estado_conciliacion,dias_credito,fecha_estimada_pago,mes_estimado_pago';
  const PAGE = 1000;
  const raw: CxCViewRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('v_cuentas_por_cobrar')
      .select(COLS)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as CxCViewRow[];
    raw.push(...batch);
    if (batch.length < PAGE) break;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: CxCRow[] = [];
  const sinMap = new Map<string, number>(); // cliente → saldo (sin término)
  let sinSaldo = 0, sinFacturas = 0;

  for (const r of raw) {
    if (!r.fecha) continue;
    const saldo = toMXNAmount(num(r.saldo_pendiente), r.moneda, r.tipo_cambio);
    const cliente = r.receptor?.trim() || r.rfc_receptor || '—';

    if (r.dias_credito == null || !r.fecha_estimada_pago || !r.mes_estimado_pago) {
      sinSaldo += saldo; sinFacturas++;
      sinMap.set(cliente, (sinMap.get(cliente) ?? 0) + saldo);
      continue;
    }

    rows.push({
      id: r.id,
      cliente,
      fecha: r.fecha.slice(0, 10),
      diasCredito: r.dias_credito,
      fechaEstimadaPago: r.fecha_estimada_pago,
      mesEstimadoPago: r.mes_estimado_pago,
      saldo,
      moneda: r.moneda ?? 'MXN',
      estado: r.estado_conciliacion ?? 'pendiente',
      diasVencido: dayDiff(today, atMidnight(r.fecha_estimada_pago)),
    });
  }

  const mesesDisponibles = [...new Set(rows.map((r) => r.mesEstimadoPago!).filter(Boolean))]
    .sort()
    .reverse();

  const dias = rows.map((r) => r.diasCredito!).filter((d) => d != null);
  const rango = {
    minDias: dias.length ? Math.min(...dias) : null,
    maxDias: dias.length ? Math.max(...dias) : null,
  };

  const sinTermino: CxCSinTermino = {
    saldo: sinSaldo,
    numFacturas: sinFacturas,
    numClientes: sinMap.size,
    clientes: [...sinMap.entries()]
      .map(([cliente, saldo]) => ({ cliente, saldo }))
      .sort((a, b) => b.saldo - a.saldo),
  };

  return {
    rows,
    sinTermino,
    mesesDisponibles,
    rango,
    totalConTermino: rows.reduce((s, r) => s + r.saldo, 0),
  };
}

// ── Vista mensual (pura, se memoiza en el componente) ────────────────────────
export function buildMes(rows: CxCRow[], mes: string): CxCMes {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filas = rows.filter((r) => r.mesEstimadoPago === mes);
  const clienteMap = new Map<string, number>();
  let totalEsperado = 0, vencido = 0, vigente = 0;

  for (const r of filas) {
    totalEsperado += r.saldo;
    if (r.diasVencido > 0) vencido += r.saldo; else vigente += r.saldo;
    clienteMap.set(r.cliente, (clienteMap.get(r.cliente) ?? 0) + r.saldo);
  }

  return {
    mes,
    totalEsperado,
    numFacturas: filas.length,
    numClientes: clienteMap.size,
    vencido,
    vigente,
    porCliente: [...clienteMap.entries()]
      .map(([cliente, saldo]) => ({ cliente, saldo }))
      .sort((a, b) => b.saldo - a.saldo),
    filas: [...filas].sort((a, b) => b.diasVencido - a.diasVencido),
  };
}

// ── Catálogo CRUD ────────────────────────────────────────────────────────────
export async function fetchCatalogo(): Promise<CatalogoRow[]> {
  const { data, error } = await supabase
    .from('catalogo_dias_credito')
    .select('*')
    .order('cliente', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CatalogoRow[];
}

export async function addCatalogo(cliente: string, dias: number): Promise<void> {
  const { error } = await supabase
    .from('catalogo_dias_credito')
    .insert([{ cliente: cliente.trim(), dias_credito: dias }]);
  if (error) throw new Error(error.code === '23505' ? 'Ese cliente ya existe en el catálogo.' : error.message);
}

export async function updateCatalogo(id: number, cliente: string, dias: number): Promise<void> {
  const { error } = await supabase
    .from('catalogo_dias_credito')
    .update({ cliente: cliente.trim(), dias_credito: dias })
    .eq('id', id);
  if (error) throw new Error(error.code === '23505' ? 'Ese cliente ya existe en el catálogo.' : error.message);
}

export async function deleteCatalogo(id: number): Promise<void> {
  const { error } = await supabase.from('catalogo_dias_credito').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
