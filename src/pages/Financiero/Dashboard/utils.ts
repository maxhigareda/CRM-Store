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

// ── Cuentas por cobrar (CxC) ──
// Snapshot actual de facturas EMITIDAS de ingreso con saldo pendiente.
// Responde: ¿quién nos debe?, ¿cuánto entra hoy / al 15 / este mes?
export interface ClienteDeuda { cliente: string; saldo: number; }
export interface BucketTotal { bucket: string; saldo: number; facturas: number; }
export interface FacturaPorCobrar {
  cliente: string;
  fecha: string;          // emisión
  vencimiento: string;    // estimado (fecha + días de crédito)
  saldo: number;          // MXN
  moneda: string;
  estado: string;         // pendiente | parcial
  diasVencido: number;    // >0 = vencida hace N días; <0 = vence en N días
}
export interface CuentasPorCobrar {
  totalPorCobrar: number;       // Σ saldo pendiente (MXN)
  vencido: number;              // saldo cuyo vencimiento ya pasó
  hoy: number;                  // saldo que vence HOY
  hastaDia15: number;           // saldo que vence de hoy al próximo día 15
  esteMes: number;              // saldo que vence de hoy a fin de mes
  numFacturasPendientes: number;
  numClientesDeudores: number;
  porCliente: ClienteDeuda[];   // top deudores
  aging: BucketTotal[];         // antigüedad por fecha de emisión
  cobranza: BucketTotal[];      // por horizonte de vencimiento
  facturas: FacturaPorCobrar[]; // detalle (más vencidas primero)
}

export interface DashboardData {
  totalRegistros: number;
  kpis: KPIs;
  monthly: MonthlySerie[];
  categorias: CategoriaTotal[];
  proveedores: ProveedorTotal[];
  ultimas: UltimaFactura[];
  cxc: CuentasPorCobrar;
  mesesDisponibles: string[];
}

// Forma cruda de cada fila que traemos de Supabase
interface FacturaRow {
  tipo_factura: string | null;
  tipo: string | null;
  fecha: string | null;
  emisor: string | null;
  rfc_emisor: string | null;
  receptor: string | null;
  rfc_receptor: string | null;
  categoria: string | null;
  condiciones_pago: string | null;
  moneda: string | null;
  tipo_cambio: number | null;
  subtotal: number | null;
  total: number | null;
  total_impuestos_trasladados: number | null;
  saldo_pendiente: number | null;       // de la vista v_facturas_conciliacion
  estado_conciliacion: string | null;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
export const formatMXN = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

const num = (v: unknown): number => Number(v) || 0;

// Normaliza un importe a MXN usando el tipo de cambio del comprobante.
const toMXNAmount = (amount: number, moneda: string | null, tc: number | null): number => {
  if (moneda && moneda !== 'MXN' && moneda !== 'XXX' && tc) return amount * num(tc);
  return amount;
};

// Normaliza el total de la fila a MXN.
const toMXN = (r: FacturaRow): number => toMXNAmount(num(r.total), r.moneda, r.tipo_cambio);

// Días de crédito a partir de `condiciones_pago` (texto libre del CFDI/PDF).
// "30 days"/"30 días"/"60" → número; "contado"/"PUE" → 0; sin dato → default.
const DEFAULT_DIAS_CREDITO = 30;
const diasCredito = (cond: string | null): number => {
  if (!cond) return DEFAULT_DIAS_CREDITO;
  const s = cond.toLowerCase();
  if (s.includes('contado') || s.includes('pue') || s.includes('immediate') || s.includes('inmediato')) return 0;
  const m = s.match(/(\d{1,3})/);
  return m ? parseInt(m[1], 10) : DEFAULT_DIAS_CREDITO;
};

const atMidnight = (iso: string): Date => new Date(iso + 'T00:00:00');
const addDays = (d: Date, days: number): Date => { const n = new Date(d); n.setDate(n.getDate() + days); return n; };
const dayDiff = (a: Date, b: Date): number => Math.floor((a.getTime() - b.getTime()) / 86_400_000);

// ──────────────────────────────────────────────
// Fuente de datos: consulta directa a public.facturas + agregación en código.
// Transparente (sin RPC server-side), suficiente para ~miles de filas.
// ──────────────────────────────────────────────
export async function fetchDashboard(mes: string, tipo: string): Promise<DashboardData> {
  // PostgREST topa en 1000 filas por request → paginamos hasta traer todo.
  // Fuente: vista v_facturas_conciliacion (= facturas + saldo/estado calculados).
  const COLS = 'tipo_factura,tipo,fecha,emisor,rfc_emisor,receptor,rfc_receptor,categoria,condiciones_pago,moneda,tipo_cambio,subtotal,total,total_impuestos_trasladados,saldo_pendiente,estado_conciliacion';
  const PAGE = 1000;
  const all: FacturaRow[] = [];
  let count = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count: c } = await supabase
      .from('v_facturas_conciliacion')
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

  // ── Cuentas por cobrar (snapshot actual; NO depende del filtro de mes) ──
  const today = atMidnight(new Date().toISOString().slice(0, 10));
  const y = today.getFullYear(), mo = today.getMonth();
  const finMes = atMidnight(new Date(y, mo + 1, 0).toISOString().slice(0, 10));
  // próximo día 15 (este mes si aún no pasa, si no el del mes siguiente)
  const dia15 = today.getDate() <= 15 ? new Date(y, mo, 15) : new Date(y, mo + 1, 15);
  dia15.setHours(0, 0, 0, 0);
  const en7 = addDays(today, 7);

  let totalPorCobrar = 0, vencido = 0, hoyMonto = 0, hastaDia15 = 0, esteMes = 0;
  const clienteMap = new Map<string, number>();
  const agingMap: Record<string, { s: number; n: number }> = {
    '0–30 días': { s: 0, n: 0 }, '31–60 días': { s: 0, n: 0 }, '61–90 días': { s: 0, n: 0 }, '90+ días': { s: 0, n: 0 },
  };
  const cobranzaMap: Record<string, { s: number; n: number }> = {
    'Vencido': { s: 0, n: 0 }, 'Hoy': { s: 0, n: 0 }, 'Próx. 7 días': { s: 0, n: 0 }, 'Resto del mes': { s: 0, n: 0 }, 'Después': { s: 0, n: 0 },
  };
  const facturasCxC: FacturaPorCobrar[] = [];

  for (const r of all) {
    if (r.tipo_factura !== 'EMITIDA' || r.tipo !== 'I' || !r.fecha) continue;
    const saldoOrig = num(r.saldo_pendiente);
    if (saldoOrig <= 0.005) continue; // ya pagada
    const saldo = toMXNAmount(saldoOrig, r.moneda, r.tipo_cambio);

    totalPorCobrar += saldo;
    const cliente = r.receptor?.trim() || r.rfc_receptor || '—';
    clienteMap.set(cliente, (clienteMap.get(cliente) ?? 0) + saldo);

    // Antigüedad por fecha de emisión
    const diasTrans = dayDiff(today, atMidnight(r.fecha));
    const ab = diasTrans <= 30 ? '0–30 días' : diasTrans <= 60 ? '31–60 días' : diasTrans <= 90 ? '61–90 días' : '90+ días';
    agingMap[ab].s += saldo; agingMap[ab].n++;

    // Vencimiento estimado = emisión + días de crédito (de condiciones_pago)
    const venc = addDays(atMidnight(r.fecha), diasCredito(r.condiciones_pago));
    if (venc < today) { vencido += saldo; cobranzaMap['Vencido'].s += saldo; cobranzaMap['Vencido'].n++; }
    else if (venc.getTime() === today.getTime()) { hoyMonto += saldo; cobranzaMap['Hoy'].s += saldo; cobranzaMap['Hoy'].n++; }
    else if (venc <= en7) { cobranzaMap['Próx. 7 días'].s += saldo; cobranzaMap['Próx. 7 días'].n++; }
    else if (venc <= finMes) { cobranzaMap['Resto del mes'].s += saldo; cobranzaMap['Resto del mes'].n++; }
    else { cobranzaMap['Después'].s += saldo; cobranzaMap['Después'].n++; }

    if (venc >= today && venc <= dia15)  hastaDia15 += saldo;
    if (venc >= today && venc <= finMes) esteMes += saldo;

    facturasCxC.push({
      cliente, fecha: r.fecha, vencimiento: venc.toISOString().slice(0, 10),
      saldo, moneda: r.moneda ?? 'MXN', estado: r.estado_conciliacion ?? 'pendiente',
      diasVencido: dayDiff(today, venc),
    });
  }

  const cxc: CuentasPorCobrar = {
    totalPorCobrar, vencido, hoy: hoyMonto, hastaDia15, esteMes,
    numFacturasPendientes: facturasCxC.length,
    numClientesDeudores: clienteMap.size,
    porCliente: [...clienteMap.entries()].map(([cliente, saldo]) => ({ cliente, saldo })).sort((a, b) => b.saldo - a.saldo).slice(0, 10),
    aging: Object.entries(agingMap).map(([bucket, v]) => ({ bucket, saldo: v.s, facturas: v.n })),
    cobranza: Object.entries(cobranzaMap).map(([bucket, v]) => ({ bucket, saldo: v.s, facturas: v.n })),
    facturas: [...facturasCxC].sort((a, b) => b.diasVencido - a.diasVencido).slice(0, 12),
  };

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
    cxc,
    mesesDisponibles,
  };
}
