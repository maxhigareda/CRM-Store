import { useState, useEffect } from 'react';
import { 
  Workflow, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Loader2, 
  RefreshCw, 
  Code2, 
  Building2, 
  Copy, 
  Check, 
  Play, 
  PauseCircle, 
  Trash2, 
  X,
  Calendar,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { ConfirmModal } from '../../../components/Modals';

interface Client {
  id: string;
  name: string;
  reference_name?: string;
}

export const getClientDisplayName = (client?: { name?: string; reference_name?: string } | null) => {
  if (!client) return 'Cliente';
  return client.reference_name || client.name || 'Cliente';
};

interface FlowExecution {
  id: string;
  flow_id: string;
  client_id: string;
  execution_id?: string;
  status: 'queued' | 'running' | 'success' | 'error';
  step_current: number;
  step_total: number;
  step_name?: string;
  error_log?: string;
  payload_input?: any;
  payload_output?: any;
  started_at: string;
  finished_at?: string;
  created_at: string;
}

interface OperationFlow {
  id: string;
  client_id: string;
  name: string;
  n8n_workflow_id?: string;
  description?: string;
  status: 'active' | 'paused' | 'error';
  created_at: string;
  updated_at: string;
  client?: Client;
  latest_execution?: FlowExecution | null;
}

export default function Flujos() {
  const { showNotification } = useNotification();

  // Data States
  const [flows, setFlows] = useState<OperationFlow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filter States
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'error' | 'success' | 'active'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date Filter State (Defaults to Today)
  const getTodayStr = () => new Date().toISOString().slice(0, 10);
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());

  // Accordion Expand States
  const [expandedFlowIds, setExpandedFlowIds] = useState<Set<string>>(new Set());

  // Modals & Panels
  const [showNewFlowModal, setShowNewFlowModal] = useState(false);
  const [showWebhookGuideModal, setShowWebhookGuideModal] = useState(false);
  const [selectedFlowForLogs, setSelectedFlowForLogs] = useState<OperationFlow | null>(null);
  const [flowExecutionsHistory, setFlowExecutionsHistory] = useState<FlowExecution[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [confirmDeleteFlow, setConfirmDeleteFlow] = useState<OperationFlow | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New Flow Form State
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowClientId, setNewFlowClientId] = useState('');
  const [newFlowN8nId, setNewFlowN8nId] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [savingFlow, setSavingFlow] = useState(false);

  // Load Data
  const fetchData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Fetch Clients
      const { data: clientsData, error: clientsErr } = await supabase
        .from('clients')
        .select('id, name, reference_name')
        .order('reference_name', { ascending: true });

      if (clientsErr) throw clientsErr;
      setClients(clientsData || []);

      // 2. Fetch Flows with Client joins
      const { data: flowsData, error: flowsErr } = await supabase
        .from('operation_flows')
        .select(`
          *,
          client:clients(id, name, reference_name)
        `)
        .order('created_at', { ascending: false });

      if (flowsErr) throw flowsErr;

      // 3. Fetch latest execution for each flow
      const flowIds = (flowsData || []).map(f => f.id);
      let latestExecs: Record<string, FlowExecution> = {};

      if (flowIds.length > 0) {
        let query = supabase
          .from('flow_executions')
          .select('*')
          .in('flow_id', flowIds)
          .order('started_at', { ascending: false });

        const { data: execsData, error: execsErr } = await query;

        if (!execsErr && execsData) {
          // Map latest execution per flow
          execsData.forEach((exec: FlowExecution) => {
            if (!latestExecs[exec.flow_id]) {
              latestExecs[exec.flow_id] = exec;
            }
          });
        }
      }

      const combinedFlows: OperationFlow[] = (flowsData || []).map(f => ({
        ...f,
        latest_execution: latestExecs[f.id] || null
      }));

      setFlows(combinedFlows);
    } catch (err: any) {
      console.error('Error loading flows:', err);
      showNotification('error', 'Error al cargar flujos de operaciones: ' + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh interval (every 10 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Date Filter Switcher
  const handleDateModeChange = (mode: 'today' | 'yesterday' | 'custom' | 'all') => {
    setDateFilterMode(mode);
    if (mode === 'today') {
      setSelectedDate(getTodayStr());
    } else if (mode === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setSelectedDate(y.toISOString().slice(0, 10));
    } else if (mode === 'all') {
      setSelectedDate('all');
    }
  };

  // Toggle Accordion Rows
  const toggleExpand = (flowId: string) => {
    setExpandedFlowIds(prev => {
      const next = new Set(prev);
      if (next.has(flowId)) next.delete(flowId);
      else next.add(flowId);
      return next;
    });
  };

  const handleExpandAll = () => {
    if (expandedFlowIds.size === filteredFlows.length) {
      setExpandedFlowIds(new Set());
    } else {
      setExpandedFlowIds(new Set(filteredFlows.map(f => f.id)));
    }
  };

  // Fetch execution history when a flow is selected for logs
  const handleOpenLogs = async (flow: OperationFlow) => {
    setSelectedFlowForLogs(flow);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('flow_id', flow.id)
        .order('started_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setFlowExecutionsHistory(data || []);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al consultar bitácora de ejecuciones.');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Create Flow
  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlowName.trim()) {
      showNotification('error', 'Por favor ingresa un nombre para el flujo.');
      return;
    }
    if (!newFlowClientId) {
      showNotification('error', 'Por favor selecciona un cliente asociado.');
      return;
    }

    setSavingFlow(true);
    try {
      const { data, error } = await supabase
        .from('operation_flows')
        .insert({
          name: newFlowName.trim(),
          client_id: newFlowClientId,
          n8n_workflow_id: newFlowN8nId.trim() || null,
          description: newFlowDescription.trim() || null,
          status: 'active'
        })
        .select(`*, client:clients(id, name, reference_name)`)
        .single();

      if (error) throw error;

      showNotification('success', `Flujo "${newFlowName}" creado exitosamente.`);
      setFlows(prev => [data, ...prev]);
      setShowNewFlowModal(false);
      setNewFlowName('');
      setNewFlowClientId('');
      setNewFlowN8nId('');
      setNewFlowDescription('');
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'Error al crear flujo: ' + err.message);
    } finally {
      setSavingFlow(false);
    }
  };

  // Delete Flow
  const handleDeleteFlow = async () => {
    if (!confirmDeleteFlow) return;
    try {
      const { error } = await supabase
        .from('operation_flows')
        .delete()
        .eq('id', confirmDeleteFlow.id);

      if (error) throw error;

      showNotification('success', 'Flujo eliminado correctamente.');
      setFlows(prev => prev.filter(f => f.id !== confirmDeleteFlow.id));
      if (selectedFlowForLogs?.id === confirmDeleteFlow.id) {
        setSelectedFlowForLogs(null);
      }
      setConfirmDeleteFlow(null);
    } catch (err: any) {
      showNotification('error', 'Error al eliminar flujo: ' + err.message);
    }
  };

  // Toggle Flow Status (Active / Paused)
  const handleToggleFlowStatus = async (flow: OperationFlow) => {
    const newStatus = flow.status === 'active' ? 'paused' : 'active';
    try {
      const { error } = await supabase
        .from('operation_flows')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', flow.id);

      if (error) throw error;

      setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, status: newStatus } : f));
      showNotification('success', `Flujo ${newStatus === 'active' ? 'activado' : 'pausado'}.`);
    } catch (err: any) {
      showNotification('error', 'Error al cambiar estado: ' + err.message);
    }
  };

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filtered Flows
  const filteredFlows = flows.filter(flow => {
    // 1. Client filter
    if (selectedClientId !== 'all' && flow.client_id !== selectedClientId) {
      return false;
    }

    // 2. Date filter (Checks if the latest execution matches the selected date)
    if (selectedDate !== 'all') {
      const execDate = flow.latest_execution?.started_at ? flow.latest_execution.started_at.slice(0, 10) : null;
      if (execDate !== selectedDate) {
        return false;
      }
    }

    // 3. Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = flow.name.toLowerCase().includes(query);
      const matchClient = (flow.client?.reference_name || flow.client?.name || '').toLowerCase().includes(query);
      const matchDesc = flow.description?.toLowerCase().includes(query);
      const matchN8n = flow.n8n_workflow_id?.toLowerCase().includes(query);
      if (!matchName && !matchClient && !matchDesc && !matchN8n) return false;
    }

    // 4. Status filter
    if (statusFilter === 'running') {
      return flow.latest_execution?.status === 'running';
    }
    if (statusFilter === 'error') {
      return flow.latest_execution?.status === 'error';
    }
    if (statusFilter === 'success') {
      return flow.latest_execution?.status === 'success';
    }
    if (statusFilter === 'active') {
      return flow.status === 'active';
    }
    return true;
  });

  // Calculate Metrics for Current Filter
  const totalFlowsCount = flows.length;
  const runningExecutions = filteredFlows.filter(f => f.latest_execution?.status === 'running').length;
  const errorExecutions = filteredFlows.filter(f => f.latest_execution?.status === 'error').length;
  const successfulExecutions = filteredFlows.filter(f => f.latest_execution?.status === 'success').length;

  // Supabase REST endpoint info
  const supabaseUrl = 'https://zzrnpuefuxvnhkipjxqn.supabase.co';
  const restEndpoint = `${supabaseUrl}/rest/v1/flow_executions`;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      
      {/* ── Main Dashboard Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#f3e8ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Workflow size={26} color="#8b5cf6" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Monitor de Flujos de Operaciones</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Seguimiento diario de alta densidad para flujos de N8N por cliente</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.825rem',
              background: autoRefresh ? '#f0fdf4' : '#f1f5f9',
              borderColor: autoRefresh ? '#bbf7d0' : '#cbd5e1',
              color: autoRefresh ? '#16a34a' : '#64748b'
            }}
            title={autoRefresh ? 'Actualización automática activa (10s)' : 'Actualización automática pausada'}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {autoRefresh ? 'Auto (10s)' : 'Manual'}
          </button>

          <button
            onClick={() => setShowWebhookGuideModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6', borderColor: '#ddd6fe', background: '#faf5ff' }}
          >
            <Code2 size={16} />
            Conectar N8N (Webhooks)
          </button>

          <button
            onClick={() => setShowNewFlowModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#8b5cf6', borderColor: '#7c3aed' }}
          >
            <Plus size={16} />
            Nuevo Flujo
          </button>
        </div>
      </div>

      {/* ── KPI Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'white', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <Workflow size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Flujos Visibles</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{filteredFlows.length} <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>/ {totalFlowsCount}</span></div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Loader2 size={18} className={runningExecutions > 0 ? 'animate-spin' : ''} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>En Ejecución</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#2563eb' }}>{runningExecutions}</div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <AlertCircle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Con Error</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{errorExecutions}</div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '14px 18px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Terminados Hoy</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a' }}>{successfulExecutions}</div>
          </div>
        </div>
      </div>

      {/* ── Control Bar: Date Filter + Client Selector + Search + Status Pills ── */}
      <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        
        {/* Row 1: Date Filter Bar (Default: Hoy) */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', fontWeight: 700, color: '#475569' }}>
            <Calendar size={16} color="#8b5cf6" />
            <span>Monitorear Fecha:</span>
          </div>

          <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => handleDateModeChange('today')}
              style={{
                padding: '5px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: dateFilterMode === 'today' ? '#8b5cf6' : 'transparent',
                color: dateFilterMode === 'today' ? 'white' : '#64748b'
              }}
            >
              Hoy ({getTodayStr()})
            </button>
            <button
              onClick={() => handleDateModeChange('yesterday')}
              style={{
                padding: '5px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: dateFilterMode === 'yesterday' ? '#8b5cf6' : 'transparent',
                color: dateFilterMode === 'yesterday' ? 'white' : '#64748b'
              }}
            >
              Ayer
            </button>
            <button
              onClick={() => handleDateModeChange('all')}
              style={{
                padding: '5px 12px',
                fontSize: '0.8rem',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: dateFilterMode === 'all' ? '#8b5cf6' : 'transparent',
                color: dateFilterMode === 'all' ? 'white' : '#64748b'
              }}
            >
              Histórico Completo
            </button>
          </div>

          {/* Date Picker Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="date"
              value={selectedDate === 'all' ? '' : selectedDate}
              onChange={e => {
                if (e.target.value) {
                  setSelectedDate(e.target.value);
                  setDateFilterMode('custom');
                }
              }}
              style={{
                padding: '5px 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                color: '#334155',
                outline: 'none',
                fontWeight: 600
              }}
            />
          </div>

          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={handleExpandAll}
              className="btn btn-secondary"
              style={{ padding: '5px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {expandedFlowIds.size === filteredFlows.length && filteredFlows.length > 0 ? (
                <>
                  <Minimize2 size={13} /> Colapsar Todo
                </>
              ) : (
                <>
                  <Maximize2 size={13} /> Expandir Todo ({filteredFlows.length})
                </>
              )}
            </button>
          </div>
        </div>

        {/* Row 2: Search + Client Dropdown + Status Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Search and Client Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1', minWidth: '300px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Buscar por flujo, cliente o error..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={15} color="#64748b" />
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value)}
                style={{
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.85rem',
                  background: 'white',
                  color: '#334155',
                  outline: 'none',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="all">🏢 Todos los Clientes ({clients.length})</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{getClientDisplayName(c)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter Pills */}
          <div style={{ display: 'flex', gap: '4px', background: '#f8fafc', padding: '3px', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'all' ? 'white' : 'transparent',
                color: statusFilter === 'all' ? '#0f172a' : '#64748b',
                boxShadow: statusFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('running')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'running' ? '#eff6ff' : 'transparent',
                color: statusFilter === 'running' ? '#2563eb' : '#64748b',
                boxShadow: statusFilter === 'running' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              ⚡ En Proceso
            </button>
            <button
              onClick={() => setStatusFilter('error')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'error' ? '#fef2f2' : 'transparent',
                color: statusFilter === 'error' ? '#ef4444' : '#64748b',
                boxShadow: statusFilter === 'error' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              ⚠️ Con Error
            </button>
            <button
              onClick={() => setStatusFilter('success')}
              style={{
                padding: '5px 10px',
                fontSize: '0.75rem',
                fontWeight: 600,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: statusFilter === 'success' ? '#f0fdf4' : 'transparent',
                color: statusFilter === 'success' ? '#16a34a' : '#64748b',
                boxShadow: statusFilter === 'success' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              ✓ Terminados
            </button>
          </div>
        </div>
      </div>

      {/* ── High-Density Table Layout with Accordion ── */}
      {loading ? (
        <div style={{ background: 'white', padding: '50px 20px', borderRadius: '16px', textAlign: 'center', color: '#64748b' }}>
          <Loader2 className="animate-spin" size={30} color="#8b5cf6" style={{ margin: '0 auto 10px' }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Cargando catálogo de flujos de operaciones...</p>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div style={{ background: 'white', padding: '50px 20px', borderRadius: '16px', border: '1px dashed #cbd5e1', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Workflow size={24} color="#8b5cf6" />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>
            No hay flujos ejecutados para la fecha seleccionada ({selectedDate === 'all' ? 'Histórico' : selectedDate})
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', maxWidth: '420px' }}>
            Cambia la fecha de filtro a "Histórico Completo" o ejecuta tus automatizaciones en N8N para ver resultados.
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button
              onClick={() => handleDateModeChange('all')}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
            >
              Ver Histórico Completo
            </button>
            <button
              onClick={() => setShowNewFlowModal(true)}
              className="btn btn-primary"
              style={{ background: '#8b5cf6', borderColor: '#7c3aed', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={14} /> Crear Nuevo Flujo
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.725rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 14px', width: '40px', textAlign: 'center' }}></th>
                  <th style={{ padding: '12px 14px' }}>ESTADO</th>
                  <th style={{ padding: '12px 14px' }}>FLUJO / OBJETIVO</th>
                  <th style={{ padding: '12px 14px' }}>CLIENTE</th>
                  <th style={{ padding: '12px 14px' }}>PASO ACTUAL</th>
                  <th style={{ padding: '12px 14px' }}>HORA / DURACIÓN</th>
                  <th style={{ padding: '12px 14px' }}>RESULTADO / ERROR</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlows.map(flow => {
                  const exec = flow.latest_execution;
                  const isRunning = exec?.status === 'running';
                  const isError = exec?.status === 'error';
                  const isSuccess = exec?.status === 'success';
                  const hasExec = !!exec;
                  const isExpanded = expandedFlowIds.has(flow.id);

                  // Extract error message if any
                  const errorMsg = exec?.error_log || (typeof exec?.payload_output === 'string' ? exec.payload_output : exec?.payload_output?.error?.message || exec?.payload_output?.message);

                  return (
                    <tr key={flow.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td colSpan={8} style={{ padding: 0 }}>
                        {/* ── Main Compact Row ── */}
                        <div 
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 140px 1.4fr 1.1fr 1.1fr 140px 1.4fr 140px',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: isExpanded ? '#faf5ff' : isError ? '#fffdfd' : isRunning ? '#fbfdff' : 'white',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onClick={() => toggleExpand(flow.id)}
                        >
                          {/* Col 0: Accordion Toggle Icon */}
                          <div style={{ display: 'flex', justifyContent: 'center', color: '#8b5cf6' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>

                          {/* Col 1: Status Badge & Mini Stepper */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: isError ? '#fee2e2' : isRunning ? '#dbeafe' : isSuccess ? '#dcfce7' : '#f1f5f9',
                              color: isError ? '#dc2626' : isRunning ? '#2563eb' : isSuccess ? '#15803d' : '#64748b'
                            }}>
                              {isRunning ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : isError ? (
                                <AlertCircle size={11} />
                              ) : isSuccess ? (
                                <CheckCircle2 size={11} />
                              ) : (
                                <Clock size={11} />
                              )}
                              {isError ? 'Error' : isRunning ? 'En Proceso' : isSuccess ? 'Terminado' : 'Standby'}
                            </span>
                          </div>

                          {/* Col 2: Flow Name & N8N ID */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '10px' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{flow.name}</span>
                              {flow.status === 'paused' && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#fef3c7', color: '#b45309' }}>
                                  PAUSADO
                                </span>
                              )}
                            </div>
                            {flow.n8n_workflow_id && (
                              <div style={{ fontSize: '0.7rem', color: '#8b5cf6', fontFamily: 'monospace' }}>
                                {flow.n8n_workflow_id}
                              </div>
                            )}
                          </div>

                          {/* Col 3: Client Company */}
                          <div>
                            <span style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: '#f1f5f9',
                              color: '#334155',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Building2 size={12} color="#64748b" />
                              {getClientDisplayName(flow.client)}
                            </span>
                          </div>

                          {/* Col 4: Current Step */}
                          <div style={{ color: '#475569', fontSize: '0.8rem' }}>
                            {exec?.step_name ? (
                              <div style={{ fontWeight: 600, color: isError ? '#dc2626' : isRunning ? '#2563eb' : '#15803d' }}>
                                {exec.step_name} {exec.step_total > 0 && `(${exec.step_current}/${exec.step_total})`}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </div>

                          {/* Col 5: Time & Duration */}
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {exec ? (
                              <div>
                                <div>{new Date(exec.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                {exec.finished_at && (
                                  <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                                    Duración: {Math.max(1, Math.round((new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime()) / 1000))}s
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Sin ejecuciones</span>
                            )}
                          </div>

                          {/* Col 6: Result / Error Snippet */}
                          <div style={{ paddingRight: '10px' }}>
                            {isError && errorMsg ? (
                              <div style={{
                                color: '#b91c1c',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }} title={String(errorMsg)}>
                                ⚠️ {String(errorMsg)}
                              </div>
                            ) : isSuccess ? (
                              <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={14} /> Concluyó sin errores
                              </span>
                            ) : isRunning ? (
                              <span style={{ color: '#2563eb', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Loader2 size={13} className="animate-spin" /> Procesando en N8N...
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>En espera de ejecución</span>
                            )}
                          </div>

                          {/* Col 7: Actions */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenLogs(flow)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Ver Bitácora de N8N"
                            >
                              <Code2 size={13} />
                              Logs
                            </button>
                            <button
                              onClick={() => handleToggleFlowStatus(flow)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 6px', fontSize: '0.75rem', color: flow.status === 'active' ? '#d97706' : '#16a34a' }}
                              title={flow.status === 'active' ? 'Pausar flujo' : 'Activar flujo'}
                            >
                              {flow.status === 'active' ? <PauseCircle size={14} /> : <Play size={14} />}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteFlow(flow)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 6px', fontSize: '0.75rem', color: '#ef4444' }}
                              title="Eliminar flujo"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* ── Accordion Dropped Down Details ── */}
                        {isExpanded && (
                          <div style={{
                            padding: '16px 20px',
                            background: '#fdfcfe',
                            borderTop: '1px solid #f3e8ff',
                            borderBottom: '2px solid #e9d5ff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px'
                          }}>
                            {/* Stepper Circles */}
                            <div style={{ background: '#ffffff', padding: '14px 20px', borderRadius: '12px', border: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                              
                              {/* Connecting Line */}
                              <div style={{
                                position: 'absolute',
                                left: '40px',
                                right: '40px',
                                top: '16px',
                                height: '3px',
                                background: '#e2e8f0',
                                zIndex: 1
                              }}>
                                <div style={{
                                  height: '100%',
                                  background: isError ? '#ef4444' : isSuccess ? '#16a34a' : isRunning ? '#3b82f6' : '#e2e8f0',
                                  width: isSuccess ? '100%' : isError ? '100%' : isRunning ? '50%' : '0%',
                                  transition: 'width 0.4s ease'
                                }} />
                              </div>

                              {/* Step 1: No iniciado / En Cola */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 2 }}>
                                <div style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  background: hasExec ? '#2563eb' : '#cbd5e1',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  boxShadow: hasExec ? '0 0 0 4px #dbeafe' : 'none'
                                }}>
                                  {hasExec ? <Check size={15} /> : '1'}
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: hasExec ? '#0f172a' : '#94a3b8' }}>
                                  1. En Cola
                                </span>
                              </div>

                              {/* Step 2: Iniciado / En Proceso */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 2 }}>
                                <div style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  background: isRunning ? '#3b82f6' : (isSuccess || isError) ? '#2563eb' : '#cbd5e1',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  boxShadow: isRunning ? '0 0 0 4px #bfdbfe' : (isSuccess || isError) ? '0 0 0 4px #dbeafe' : 'none'
                                }}>
                                  {isRunning ? <Loader2 size={15} className="animate-spin" /> : (isSuccess || isError) ? <Check size={15} /> : '2'}
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: isRunning ? '#2563eb' : (isSuccess || isError) ? '#0f172a' : '#94a3b8' }}>
                                  2. En Proceso
                                </span>
                              </div>

                              {/* Step 3: Resultado (Terminado / Error) */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 2 }}>
                                <div style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '50%',
                                  background: isError ? '#ef4444' : isSuccess ? '#16a34a' : '#cbd5e1',
                                  color: 'white',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  boxShadow: isError ? '0 0 0 4px #fee2e2' : isSuccess ? '0 0 0 4px #dcfce7' : 'none'
                                }}>
                                  {isError ? <AlertCircle size={15} /> : isSuccess ? <Check size={15} /> : '3'}
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isError ? '#ef4444' : isSuccess ? '#16a34a' : '#94a3b8' }}>
                                  {isError ? '3. Marcó Error' : isSuccess ? '3. Terminado' : '3. Finalizado'}
                                </span>
                              </div>
                            </div>

                            {/* Detailed Error Log Box */}
                            {isError && (exec?.error_log || exec?.payload_output?.error || exec?.payload_output?.message) && (
                              <div style={{
                                padding: '12px 14px',
                                background: '#fff1f2',
                                border: '1px solid #fecdd3',
                                borderRadius: '10px',
                                color: '#9f1239',
                                fontSize: '0.8rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: 800, color: '#e11d48', fontSize: '0.75rem', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertCircle size={14} /> Detalle del Log de Error (N8N):
                                  </span>
                                  <button
                                    onClick={() => handleCopy(exec.error_log || JSON.stringify(exec.payload_output?.error || exec.payload_output, null, 2), `err-card-${exec.id}`)}
                                    style={{ border: 'none', background: '#ffe4e6', color: '#be123c', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
                                  >
                                    {copiedKey === `err-card-${exec.id}` ? '✓ Copiado' : 'Copiar Log'}
                                  </button>
                                </div>
                                <pre style={{
                                  fontFamily: 'monospace',
                                  background: '#881337',
                                  color: '#ffffff',
                                  padding: '10px 12px',
                                  borderRadius: '8px',
                                  fontSize: '0.775rem',
                                  lineHeight: 1.45,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  margin: 0
                                }}>
                                  {exec.error_log || (typeof exec.payload_output === 'string' ? exec.payload_output : JSON.stringify(exec.payload_output?.error || exec.payload_output, null, 2))}
                                </pre>
                              </div>
                            )}

                            {/* Meta & Payload Details */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', fontSize: '0.75rem', color: '#64748b' }}>
                              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <span>Flow ID: <strong style={{ fontFamily: 'monospace', color: '#8b5cf6' }}>{flow.id}</strong></span>
                                {exec?.execution_id && <span>N8N Exec: <strong style={{ fontFamily: 'monospace' }}>#{exec.execution_id}</strong></span>}
                                {flow.description && <span>Descripción: <em>{flow.description}</em></span>}
                              </div>

                              <button
                                onClick={() => handleOpenLogs(flow)}
                                className="btn btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#8b5cf6', borderColor: '#ddd6fe' }}
                              >
                                <Code2 size={13} /> Ver Historial Completo de Ejecuciones →
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Registrar Nuevo Flujo ── */}
      {showNewFlowModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '520px',
            maxWidth: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Workflow size={20} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Registrar Nuevo Flujo</h3>
              </div>
              <button onClick={() => setShowNewFlowModal(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <form onSubmit={handleCreateFlow} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>NOMBRE DEL FLUJO *</label>
                <input
                  type="text"
                  required
                  value={newFlowName}
                  onChange={e => setNewFlowName(e.target.value)}
                  placeholder="Ej. Descarga y Conciliación SAT, Sync Inventario..."
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>CLIENTE ASOCIADO *</label>
                <select
                  required
                  value={newFlowClientId}
                  onChange={e => setNewFlowClientId(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: 'white' }}
                >
                  <option value="">-- Selecciona un Cliente --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{getClientDisplayName(c)}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>ID O NOMBRE DE WORKFLOW EN N8N (OPCIONAL)</label>
                <input
                  type="text"
                  value={newFlowN8nId}
                  onChange={e => setNewFlowN8nId(e.target.value)}
                  placeholder="Ej. n8n_wf_sat_01 o el ID de n8n"
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>DESCRIPCIÓN / OBJETIVO DEL FLUJO</label>
                <textarea
                  rows={3}
                  value={newFlowDescription}
                  onChange={e => setNewFlowDescription(e.target.value)}
                  placeholder="Explica brevemente qué automatiza este flujo..."
                  style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowNewFlowModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" disabled={savingFlow} className="btn btn-primary" style={{ background: '#8b5cf6', borderColor: '#7c3aed' }}>
                  {savingFlow ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Guardar Flujo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal / Drawer: Bitácora de Ejecuciones y Logs de Error ── */}
      {selectedFlowForLogs && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            width: '650px',
            maxWidth: '90%',
            height: '100%',
            boxShadow: '-10px 0 25px rgba(0,0,0,0.1)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            overflowY: 'auto'
          }}>
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Code2 size={20} color="#8b5cf6" />
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>Bitácora de Ejecuciones</h3>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Flujo: <strong>{selectedFlowForLogs.name}</strong> • {getClientDisplayName(selectedFlowForLogs.client)}
                </p>
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#8b5cf6', fontFamily: 'monospace' }}>
                  Flow ID: {selectedFlowForLogs.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedFlowForLogs(null)}
                style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* List of past executions */}
            {loadingHistory ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>
                <Loader2 size={24} className="animate-spin" color="#8b5cf6" style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando historial de N8N...</p>
              </div>
            ) : flowExecutionsHistory.length === 0 ? (
              <div style={{ padding: '40px 20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                <Clock size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                <p style={{ margin: 0, fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Aún no hay ejecuciones registradas para este flujo</p>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                  Usa el Webhook de N8N para comenzar a registrar eventos.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {flowExecutionsHistory.map(exec => {
                  const isErr = exec.status === 'error';
                  const isRun = exec.status === 'running';

                  return (
                    <div
                      key={exec.id}
                      style={{
                        borderRadius: '12px',
                        border: isErr ? '1px solid #fecaca' : '1px solid #e2e8f0',
                        background: isErr ? '#fff5f5' : '#f8fafc',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      {/* Exec Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            background: isErr ? '#fee2e2' : isRun ? '#dbeafe' : '#dcfce7',
                            color: isErr ? '#dc2626' : isRun ? '#2563eb' : '#15803d'
                          }}>
                            {isErr ? 'Error' : isRun ? 'En Ejecución' : 'Completado'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(exec.started_at).toLocaleString()}
                          </span>
                        </div>

                        {exec.execution_id && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                            n8n-exec: #{exec.execution_id}
                          </span>
                        )}
                      </div>

                      {/* Error log if present */}
                      {isErr && (exec.error_log || exec.payload_output?.error || exec.payload_output?.message) && (
                        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '12px 14px', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #991b1b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <strong style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <AlertCircle size={14} /> Log del Error / Output:
                            </strong>
                            <button
                              onClick={() => handleCopy(exec.error_log || JSON.stringify(exec.payload_output?.error || exec.payload_output, null, 2), `err-${exec.id}`)}
                              style={{ border: 'none', background: '#991b1b', color: '#fee2e2', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              {copiedKey === `err-${exec.id}` ? <Check size={12} color="#86efac" /> : <Copy size={12} />}
                              {copiedKey === `err-${exec.id}` ? 'Copiado' : 'Copiar'}
                            </button>
                          </div>
                          <div style={{ color: '#ffffff', lineHeight: 1.45 }}>
                            {exec.error_log || (typeof exec.payload_output === 'string' ? exec.payload_output : JSON.stringify(exec.payload_output?.error || exec.payload_output, null, 2))}
                          </div>
                        </div>
                      )}

                      {/* Step Info */}
                      {exec.step_name && (
                        <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                          <strong>Último paso reportado:</strong> {exec.step_name} {exec.step_total > 0 && `(${exec.step_current}/${exec.step_total})`}
                        </div>
                      )}

                      {/* Payload Inspector */}
                      {(exec.payload_input || exec.payload_output) && (
                        <details style={{ fontSize: '0.75rem', color: '#475569' }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#6366f1' }}>Ver Payloads JSON</summary>
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {exec.payload_input && Object.keys(exec.payload_input).length > 0 && (
                              <div>
                                <div style={{ fontWeight: 700 }}>Input:</div>
                                <pre style={{ background: '#0f172a', color: '#38bdf8', padding: '8px', borderRadius: '6px', overflowX: 'auto', margin: '4px 0' }}>
                                  {JSON.stringify(exec.payload_input, null, 2)}
                                </pre>
                              </div>
                            )}
                            {exec.payload_output && Object.keys(exec.payload_output).length > 0 && (
                              <div>
                                <div style={{ fontWeight: 700 }}>Output:</div>
                                <pre style={{ background: '#0f172a', color: '#4ade80', padding: '8px', borderRadius: '6px', overflowX: 'auto', margin: '4px 0' }}>
                                  {JSON.stringify(exec.payload_output, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Guía de Conexión N8N Webhook ── */}
      {showWebhookGuideModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '680px',
            maxWidth: '92%',
            maxHeight: '90vh',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code2 size={20} color="#8b5cf6" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Integración con N8N (HTTP Request / Webhooks)</h3>
              </div>
              <button onClick={() => setShowWebhookGuideModal(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>

            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
              Para que tus flujos de N8N actualicen automáticamente los círculos de proceso y la bitácora de errores, agrega un nodo <strong>HTTP Request</strong> en N8N al iniciar, al finalizar o en el trigger de error.
            </p>

            {/* Endpoint details */}
            <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>1. URL DEL ENDPOINT REST (SUPABASE)</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '8px 12px', borderRadius: '6px', color: '#38bdf8', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <span>POST {restEndpoint}</span>
                <button
                  onClick={() => handleCopy(restEndpoint, 'endpoint')}
                  style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {copiedKey === 'endpoint' ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                </button>
              </div>

              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginTop: '4px' }}>2. HEADERS OBLIGATORIOS EN N8N</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>apikey:</strong> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</span>
                  <button
                    onClick={() => handleCopy('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6cm5wdWVmdXh2bmhraXBqeHFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzQ2NzQsImV4cCI6MjA5MjU1MDY3NH0.0p9l8Fl0iTdL7pxxLFtGEo5HtZXruCnkhQktqTjgghQ', 'anonkey')}
                    style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
                  >
                    {copiedKey === 'anonkey' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  </button>
                </div>
                <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px' }}>
                  <span><strong>Authorization:</strong> Bearer eyJhbGciOiJIUzI1Ni...</span>
                </div>
                <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px' }}>
                  <span><strong>Content-Type:</strong> application/json</span>
                </div>
              </div>
            </div>

            {/* Snippet 1: Al Iniciar el Flujo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>1. Nodo HTTP Request: Al Iniciar Flujo (Status: running)</div>
              <pre style={{ background: '#0f172a', color: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
{`// Body (JSON) en N8N
{
  "flow_id": "TU_FLOW_ID",
  "client_id": "TU_CLIENT_ID",
  "execution_id": "={{ $execution.id }}",
  "status": "running",
  "step_current": 1,
  "step_total": 3,
  "step_name": "Iniciando proceso",
  "started_at": "={{ $now.toISO() }}"
}`}
              </pre>
            </div>

            {/* Snippet 2: Al Terminar con Éxito */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>2. Nodo HTTP Request: Al Finalizar con Éxito (Status: success)</div>
              <pre style={{ background: '#0f172a', color: '#4ade80', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
{`// Body (JSON) en N8N
{
  "flow_id": "TU_FLOW_ID",
  "client_id": "TU_CLIENT_ID",
  "execution_id": "={{ $execution.id }}",
  "status": "success",
  "step_current": 3,
  "step_total": 3,
  "step_name": "Proceso completado exitosamente",
  "finished_at": "={{ $now.toISO() }}"
}`}
              </pre>
            </div>

            {/* Snippet 3: En Caso de Error (Error Trigger / Catch) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>3. Nodo Error Trigger: En Caso de Fallo (Status: error)</div>
              <pre style={{ background: '#450a0a', color: '#fca5a5', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
{`// Body (JSON) en N8N
{
  "flow_id": "TU_FLOW_ID",
  "client_id": "TU_CLIENT_ID",
  "execution_id": "={{ $execution.id }}",
  "status": "error",
  "error_log": "={{ $json.error?.message || $json.message || $json.error || $execution.error?.message || (typeof $json === 'string' ? $json : JSON.stringify($json)) }}",
  "payload_output": "={{ $json }}",
  "finished_at": "={{ $now.toISO() }}"
}`}
              </pre>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowWebhookGuideModal(false)} className="btn btn-primary" style={{ background: '#8b5cf6', borderColor: '#7c3aed' }}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ── */}
      {confirmDeleteFlow && (
        <ConfirmModal
          isOpen={!!confirmDeleteFlow}
          title="¿Eliminar flujo de operaciones?"
          message={`¿Estás seguro de que deseas eliminar permanentemente el flujo "${confirmDeleteFlow.name}" y toda su bitácora de ejecuciones? Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          isDestructive={true}
          onConfirm={handleDeleteFlow}
          onClose={() => setConfirmDeleteFlow(null)}
        />
      )}
    </div>
  );
}
