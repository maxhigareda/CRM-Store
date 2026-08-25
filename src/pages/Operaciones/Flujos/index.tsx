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
  X 
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { ConfirmModal } from '../../../components/Modals';

interface Client {
  id: string;
  name: string;
}

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
        .select('id, name')
        .order('name');

      if (clientsErr) throw clientsErr;
      setClients(clientsData || []);

      // 2. Fetch Flows with Client joins
      const { data: flowsData, error: flowsErr } = await supabase
        .from('operation_flows')
        .select(`
          *,
          client:clients(id, name)
        `)
        .order('created_at', { ascending: false });

      if (flowsErr) throw flowsErr;

      // 3. Fetch latest execution for each flow
      const flowIds = (flowsData || []).map(f => f.id);
      let latestExecs: Record<string, FlowExecution> = {};

      if (flowIds.length > 0) {
        const { data: execsData, error: execsErr } = await supabase
          .from('flow_executions')
          .select('*')
          .in('flow_id', flowIds)
          .order('started_at', { ascending: false });

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
        .limit(25);

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
        .select(`*, client:clients(id, name)`)
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
    // Client filter
    if (selectedClientId !== 'all' && flow.client_id !== selectedClientId) {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = flow.name.toLowerCase().includes(query);
      const matchClient = flow.client?.name.toLowerCase().includes(query);
      const matchDesc = flow.description?.toLowerCase().includes(query);
      if (!matchName && !matchClient && !matchDesc) return false;
    }
    // Status filter
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

  // Calculate Metrics
  const totalFlows = flows.length;
  const runningExecutions = flows.filter(f => f.latest_execution?.status === 'running').length;
  const errorExecutions = flows.filter(f => f.latest_execution?.status === 'error').length;
  const successfulExecutions = flows.filter(f => f.latest_execution?.status === 'success').length;

  // Supabase REST endpoint info
  const supabaseUrl = 'https://zzrnpuefuxvnhkipjxqn.supabase.co';
  const restEndpoint = `${supabaseUrl}/rest/v1/flow_executions`;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)' }}>
      
      {/* ── Main Dashboard Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#f3e8ff', padding: '10px', borderRadius: '12px', display: 'flex' }}>
            <Workflow size={26} color="#8b5cf6" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Flujos de Operaciones</h1>
            <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>Monitoreo en tiempo real de automatizaciones de N8N por cliente</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn ${autoRefresh ? 'btn-secondary' : 'btn-secondary'}`}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
            <Workflow size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total de Flujos</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{totalFlows}</div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Loader2 size={20} className={runningExecutions > 0 ? 'animate-spin' : ''} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>En Ejecución</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb' }}>{runningExecutions}</div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Con Error Reciente</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{errorExecutions}</div>
          </div>
        </div>

        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Último Éxito</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#16a34a' }}>{successfulExecutions}</div>
          </div>
        </div>
      </div>

      {/* ── Filters and Client Selector Bar ── */}
      <div style={{ background: 'white', padding: '16px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Search and Client Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1', minWidth: '300px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar por flujo, cliente o descripción..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '0.875rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={16} color="#64748b" />
            <select
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              style={{
                padding: '9px 14px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                fontSize: '0.875rem',
                background: 'white',
                color: '#334155',
                outline: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="all">🏢 Todos los Clientes ({clients.length})</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '4px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'all' ? 'white' : 'transparent',
              color: statusFilter === 'all' ? '#0f172a' : '#64748b',
              boxShadow: statusFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            Todos
          </button>
          <button
            onClick={() => setStatusFilter('running')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'running' ? '#eff6ff' : 'transparent',
              color: statusFilter === 'running' ? '#2563eb' : '#64748b',
              boxShadow: statusFilter === 'running' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            ⚡ En Proceso
          </button>
          <button
            onClick={() => setStatusFilter('error')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'error' ? '#fef2f2' : 'transparent',
              color: statusFilter === 'error' ? '#ef4444' : '#64748b',
              boxShadow: statusFilter === 'error' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            ⚠️ Con Error
          </button>
          <button
            onClick={() => setStatusFilter('success')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: statusFilter === 'success' ? '#f0fdf4' : 'transparent',
              color: statusFilter === 'success' ? '#16a34a' : '#64748b',
              boxShadow: statusFilter === 'success' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            ✓ Terminados
          </button>
        </div>
      </div>

      {/* ── Flows Grid / List with Progress Stepper ── */}
      {loading ? (
        <div style={{ background: 'white', padding: '60px 20px', borderRadius: '16px', textAlign: 'center', color: '#64748b' }}>
          <Loader2 className="animate-spin" size={32} color="#8b5cf6" style={{ margin: '0 auto 12px' }} />
          <p style={{ margin: 0, fontWeight: 600 }}>Cargando catálogo de flujos de operaciones...</p>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div style={{ background: 'white', padding: '60px 20px', borderRadius: '16px', border: '1px dashed #cbd5e1', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Workflow size={28} color="#8b5cf6" />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>No hay flujos registrados</h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', maxWidth: '420px' }}>
            Registra tu primer flujo de N8N asociado a un cliente para monitorear sus ejecuciones, pasos y errores.
          </p>
          <button
            onClick={() => setShowNewFlowModal(true)}
            className="btn btn-primary"
            style={{ marginTop: '8px', background: '#8b5cf6', borderColor: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            Crear Primer Flujo
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredFlows.map(flow => {
            const exec = flow.latest_execution;
            const isRunning = exec?.status === 'running';
            const isError = exec?.status === 'error';
            const isSuccess = exec?.status === 'success';
            const hasExec = !!exec;

            return (
              <div
                key={flow.id}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  border: isError ? '1px solid #fecaca' : isRunning ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  boxShadow: isRunning ? '0 4px 20px -2px rgba(59, 130, 246, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                  padding: '20px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Flow Header Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: isError ? '#fef2f2' : isRunning ? '#eff6ff' : isSuccess ? '#f0fdf4' : '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isError ? '#ef4444' : isRunning ? '#2563eb' : isSuccess ? '#16a34a' : '#64748b'
                    }}>
                      {isRunning ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : isError ? (
                        <AlertCircle size={20} />
                      ) : isSuccess ? (
                        <CheckCircle2 size={20} />
                      ) : (
                        <Workflow size={20} />
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{flow.name}</h3>
                        <span style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Building2 size={12} />
                          {flow.client?.name || 'Cliente'}
                        </span>
                        {flow.status === 'paused' && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: '6px', background: '#fef3c7', color: '#b45309' }}>
                            PAUSADO
                          </span>
                        )}
                      </div>
                      {flow.description && (
                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.825rem' }}>{flow.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Flow Action Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenLogs(flow)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Code2 size={14} />
                      Bitácora / Logs
                    </button>
                    <button
                      onClick={() => handleToggleFlowStatus(flow)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.8rem', color: flow.status === 'active' ? '#d97706' : '#16a34a' }}
                      title={flow.status === 'active' ? 'Pausar monitoreo' : 'Activar monitoreo'}
                    >
                      {flow.status === 'active' ? <PauseCircle size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteFlow(flow)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#ef4444' }}
                      title="Eliminar flujo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* ── Visual Process Stepper (Circles) ── */}
                <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                    
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: hasExec ? '#2563eb' : '#cbd5e1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        boxShadow: hasExec ? '0 0 0 4px #dbeafe' : 'none'
                      }}>
                        {hasExec ? <Check size={16} /> : '1'}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: hasExec ? '#0f172a' : '#94a3b8' }}>
                        1. En Cola
                      </span>
                    </div>

                    {/* Step 2: Iniciado / En Proceso */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isRunning ? '#3b82f6' : (isSuccess || isError) ? '#2563eb' : '#cbd5e1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        boxShadow: isRunning ? '0 0 0 4px #bfdbfe' : (isSuccess || isError) ? '0 0 0 4px #dbeafe' : 'none'
                      }}>
                        {isRunning ? <Loader2 size={16} className="animate-spin" /> : (isSuccess || isError) ? <Check size={16} /> : '2'}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isRunning ? '#2563eb' : (isSuccess || isError) ? '#0f172a' : '#94a3b8' }}>
                        2. En Proceso
                      </span>
                    </div>

                    {/* Step 3: Resultado (Terminado / Error) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isError ? '#ef4444' : isSuccess ? '#16a34a' : '#cbd5e1',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        boxShadow: isError ? '0 0 0 4px #fee2e2' : isSuccess ? '0 0 0 4px #dcfce7' : 'none'
                      }}>
                        {isError ? <AlertCircle size={16} /> : isSuccess ? <Check size={16} /> : '3'}
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isError ? '#ef4444' : isSuccess ? '#16a34a' : '#94a3b8' }}>
                        {isError ? '3. Marcó Error' : isSuccess ? '3. Terminado' : '3. Finalizado'}
                      </span>
                    </div>
                  </div>

                  {/* Execution Meta Subtext */}
                  {exec && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', color: '#64748b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={13} />
                        <span>Iniciado: {new Date(exec.started_at).toLocaleString()}</span>
                        {exec.finished_at && (
                          <span>• Duración: {Math.max(1, Math.round((new Date(exec.finished_at).getTime() - new Date(exec.started_at).getTime()) / 1000))}s</span>
                        )}
                      </div>

                      {exec.step_name && (
                        <div style={{ fontWeight: 600, color: isError ? '#dc2626' : isRunning ? '#2563eb' : '#15803d' }}>
                          Paso: {exec.step_name} {exec.step_total > 0 && `(${exec.step_current}/${exec.step_total})`}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Snippet Box if Failed */}
                  {isError && exec?.error_log && (
                    <div style={{ marginTop: '10px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <AlertCircle size={15} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exec.error_log}
                        </span>
                      </div>
                      <button
                        onClick={() => handleOpenLogs(flow)}
                        style={{ border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      >
                        Ver detalle →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
                    <option key={c.id} value={c.id}>{c.name}</option>
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
                  Flujo: <strong>{selectedFlowForLogs.name}</strong> • {selectedFlowForLogs.client?.name}
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
                      {isErr && exec.error_log && (
                        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '10px 12px', borderRadius: '8px', fontSize: '0.75rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          <strong>Mensaje de Error:</strong>
                          <div style={{ marginTop: '4px' }}>{exec.error_log}</div>
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
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>ENDPOINT REST DE SUPABASE</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '8px 12px', borderRadius: '6px', color: '#38bdf8', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                <span>POST {restEndpoint}</span>
                <button
                  onClick={() => handleCopy(restEndpoint, 'endpoint')}
                  style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  {copiedKey === 'endpoint' ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
                </button>
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
  "execution_id": "{{ $execution.id }}",
  "status": "running",
  "step_current": 1,
  "step_total": 3,
  "step_name": "Iniciando proceso",
  "started_at": "{{ $now.toISOString() }}"
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
  "execution_id": "{{ $execution.id }}",
  "status": "success",
  "step_current": 3,
  "step_total": 3,
  "step_name": "Proceso completado exitosamente",
  "finished_at": "{{ $now.toISOString() }}"
}`}
              </pre>
            </div>

            {/* Snippet 3: En Caso de Error (Error Trigger) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>3. Nodo Error Trigger: En Caso de Fallo (Status: error)</div>
              <pre style={{ background: '#450a0a', color: '#fca5a5', padding: '12px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', margin: 0 }}>
{`// Body (JSON) en N8N
{
  "flow_id": "TU_FLOW_ID",
  "client_id": "TU_CLIENT_ID",
  "execution_id": "{{ $execution.id }}",
  "status": "error",
  "error_log": "{{ $json.error?.message || 'Error en ejecución de N8N' }}",
  "finished_at": "{{ $now.toISOString() }}"
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
