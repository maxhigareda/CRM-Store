import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Loader2, TrendingUp, TrendingDown, Scale, Receipt, Hash, Wallet, Users } from 'lucide-react';
import { useNotification } from '../../../contexts/NotificationContext';
import {
  fetchDashboard,
  formatMXN,
  type DashboardData,
} from './utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

// ──────────────────────────────────────────────
// Paleta de colores del tema
// ──────────────────────────────────────────────
const COLOR_INGRESOS = '#16a34a';
const COLOR_GASTOS   = '#ef4444';
const COLOR_PRIMARY  = '#0070f3';
const DOUGHNUT_PALETTE = [
  '#0070f3', '#06b6d4', '#8b5cf6', '#f59e0b',
  '#ef4444', '#10b981', '#f97316', '#6366f1',
  '#ec4899', '#64748b',
];

// ──────────────────────────────────────────────
// Sub-componente: tarjeta KPI
// ──────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  sub?: string;
}
function KpiCard({ label, value, icon, color, bgColor, sub }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Card contenedor para gráficas
// ──────────────────────────────────────────────
function ChartCard({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: '24px',
      ...style,
    }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: 20 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────
export default function Dashboard() {
  const { showNotification } = useNotification();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtros (se mandan como parámetros al RPC server-side)
  const [mesFilter, setMesFilter] = useState<string>('todos');
  const [tipoFilter, setTipoFilter] = useState<string>('todas');

  // Cada cambio de filtro dispara una petición; Postgres agrega y devuelve el JSON.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDashboard(mesFilter, tipoFilter)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => {
        if (!cancelled) showNotification('error', 'Error al cargar el dashboard: ' + err.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesFilter, tipoFilter]);

  // Loader de página completa solo en la primera carga (aún sin datos).
  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, color: 'var(--text-muted)' }}>
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--primary-color)' }} />
        <p style={{ fontSize: '1rem' }}>Cargando datos del dashboard…</p>
      </div>
    );
  }

  const { kpis, monthly, categorias, proveedores, ultimas: ultimasFacturas, mesesDisponibles: availableMonths, totalRegistros } = data;

  // ── Datos de charts ──
  const monthlyChartData = {
    labels: monthly.map((m) => {
      const [year, mon] = m.month.split('-');
      return new Date(Number(year), Number(mon) - 1).toLocaleString('es-MX', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Ingresos',
        data: monthly.map((m) => m.ingresos),
        backgroundColor: COLOR_INGRESOS + 'cc',
        borderColor: COLOR_INGRESOS,
        borderWidth: 1.5,
        borderRadius: 6,
      },
      {
        label: 'Gastos',
        data: monthly.map((m) => m.gastos),
        backgroundColor: COLOR_GASTOS + 'cc',
        borderColor: COLOR_GASTOS,
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ],
  };

  const categoriaChartData = {
    labels: categorias.map((c) => c.categoria.length > 25 ? c.categoria.slice(0, 23) + '…' : c.categoria),
    datasets: [{
      data: categorias.map((c) => c.total),
      backgroundColor: DOUGHNUT_PALETTE.slice(0, categorias.length),
      borderWidth: 2,
      borderColor: '#ffffff',
    }],
  };

  const proveedorChartData = {
    labels: proveedores.map((p) => p.emisor.length > 30 ? p.emisor.slice(0, 28) + '…' : p.emisor),
    datasets: [{
      label: 'Total gastado',
      data: proveedores.map((p) => p.total),
      backgroundColor: COLOR_PRIMARY + 'cc',
      borderColor: COLOR_PRIMARY,
      borderWidth: 1.5,
      borderRadius: 6,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { font: { family: 'Inter', size: 12 }, boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const v = (ctx.parsed as { y: number | null }).y ?? 0;
            return `${ctx.dataset.label ?? ''}: ${formatMXN(v)}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { color: '#f1f5f9' } },
      y: {
        grid: { color: '#f1f5f9' },
        ticks: {
          callback: (value: string | number) => formatMXN(Number(value)),
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) =>
            `${ctx.label}: ${formatMXN(ctx.parsed as unknown as number)}`,
        },
      },
    },
  };

  const horizontalBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const v = (ctx.parsed as { x: number | null }).x ?? 0;
            return `${ctx.dataset.label ?? ''}: ${formatMXN(v)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#f1f5f9' },
        ticks: { callback: (v: string | number) => formatMXN(Number(v)), font: { size: 10 } },
      },
      y: { grid: { display: false }, ticks: { font: { size: 11, family: 'Inter' } } },
    },
  };

  // ─────────────── Render ───────────────
  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          Dashboard Financiero
          {loading && <Loader2 size={18} className="animate-spin" style={{ color: 'var(--primary-color)' }} />}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Resumen contable de facturas CFDI · {totalRegistros.toLocaleString('es-MX')} registros
        </p>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap',
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)', padding: '16px 20px', boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mes
          </label>
          <select
            value={mesFilter}
            onChange={(e) => setMesFilter(e.target.value)}
            style={{
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
              padding: '6px 12px', fontSize: '0.875rem', color: 'var(--text-main)',
              background: 'white', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="todos">Todos los meses</option>
            {availableMonths.map((m) => {
              const [year, mon] = m.split('-');
              const label = new Date(Number(year), Number(mon) - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
              return <option key={m} value={m}>{label}</option>;
            })}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tipo de factura
          </label>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            style={{
              border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
              padding: '6px 12px', fontSize: '0.875rem', color: 'var(--text-main)',
              background: 'white', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="todas">Todas</option>
            <option value="emitidas">Emitidas (ingresos)</option>
            <option value="recibidas">Recibidas (gastos)</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        <KpiCard
          label="Ingresos totales"
          value={formatMXN(kpis.totalIngresos)}
          icon={<TrendingUp size={18} />}
          color={COLOR_INGRESOS}
          bgColor="#dcfce7"
          sub="Facturas emitidas"
        />
        <KpiCard
          label="Gastos totales"
          value={formatMXN(kpis.totalGastos)}
          icon={<TrendingDown size={18} />}
          color={COLOR_GASTOS}
          bgColor="#fee2e2"
          sub="Facturas recibidas"
        />
        <KpiCard
          label="Nómina"
          value={formatMXN(kpis.nominaTotal)}
          icon={<Users size={18} />}
          color="#f97316"
          bgColor="#ffedd5"
          sub="CFDI nómina emitida"
        />
        <KpiCard
          label="Balance neto"
          value={formatMXN(kpis.balance)}
          icon={<Scale size={18} />}
          color={kpis.balance >= 0 ? COLOR_INGRESOS : COLOR_GASTOS}
          bgColor={kpis.balance >= 0 ? '#dcfce7' : '#fee2e2'}
          sub="Ingresos − Gastos − Nómina"
        />
        <KpiCard
          label="IVA trasladado"
          value={formatMXN(kpis.ivaTotal)}
          icon={<Receipt size={18} />}
          color="#8b5cf6"
          bgColor="#f3e8ff"
          sub="Real (impuestos CFDI)"
        />
        <KpiCard
          label="# Facturas (ventas)"
          value={kpis.numFacturas.toString()}
          icon={<Hash size={18} />}
          color="#0070f3"
          bgColor="#dbeafe"
          sub="Ingresos + Gastos tipo I"
        />
        <KpiCard
          label="Ticket promedio"
          value={formatMXN(kpis.ticketPromedio)}
          icon={<Wallet size={18} />}
          color="#f59e0b"
          bgColor="#fef3c7"
          sub="Por factura"
        />
      </div>

      {/* Gráficas — fila 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Tendencia mensual — Ingresos vs Gastos">
          <div style={{ height: 280 }}>
            {monthly.length > 0
              ? <Bar data={monthlyChartData} options={chartOptions} />
              : <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 80 }}>Sin datos</p>
            }
          </div>
        </ChartCard>

        <ChartCard title="Gastos por categoría">
          <div style={{ height: 280 }}>
            {categorias.length > 0
              ? <Doughnut data={categoriaChartData} options={doughnutOptions} />
              : <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 80 }}>Sin datos</p>
            }
          </div>
        </ChartCard>
      </div>

      {/* Gráficas — fila 2 */}
      <div style={{ marginBottom: 20 }}>
        <ChartCard title="Top proveedores por gasto (RECIBIDAS)">
          <div style={{ height: Math.max(240, proveedores.length * 38) }}>
            {proveedores.length > 0
              ? <Bar data={proveedorChartData} options={horizontalBarOptions} />
              : <p style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 80 }}>Sin datos</p>
            }
          </div>
        </ChartCard>
      </div>

      {/* Tabla últimas facturas */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
            Últimas 10 facturas
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Fecha', 'Emisor', 'Categoría', 'Total', 'Tipo'].map((h) => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontWeight: 700,
                    color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase',
                    letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ultimasFacturas.map((f, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {f.fecha.slice(0, 10)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-main)', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.emisor || f.rfcEmisor}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.categoria || '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                    {formatMXN(f.total)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700,
                      background: f.tipoFactura === 'EMITIDA' ? '#dcfce7' : '#fee2e2',
                      color:      f.tipoFactura === 'EMITIDA' ? '#166534' : '#991b1b',
                    }}>
                      {f.tipoFactura}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
