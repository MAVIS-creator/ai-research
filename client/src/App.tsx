import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { MetricsHeader } from './components/MetricsHeader';
import { ExecutionControls } from './components/ExecutionControls';
import { DAGCanvas } from './components/DAGCanvas';
import { TimeTravelDebugger } from './components/TimeTravelDebugger';
import { ApprovalInbox } from './components/ApprovalInbox';
import { AgentMeshInspector } from './components/AgentMeshInspector';
import { LiveLogTerminal } from './components/LiveLogTerminal';
import { DLQManager } from './components/DLQManager';
import { StepDetailModal } from './components/StepDetailModal';
import {
  WorkflowDefinition,
  WorkflowExecution,
  SystemMetrics,
  WorkflowEvent,
  TimeTravelSnapshot,
} from '../src/types';
import { ListFilter, Clock, CheckCircle2, AlertOctagon, RotateCcw, Activity } from 'lucide-react';

export default function App() {
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [activeRole, setActiveRole] = useState<'ADMIN' | 'OPERATOR' | 'VIEWER'>('ADMIN');
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('wf_incident_remediation');
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  
  const [approvals, setApprovals] = useState<any[]>([]);
  const [dlq, setDlq] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalExecutions: 0,
    activeExecutions: 0,
    completedExecutions: 0,
    failedExecutions: 0,
    compensatedExecutions: 0,
    throughputOpsSec: 0,
    latenciesMs: { p50: 0, p95: 0, p99: 0, avg: 0 },
    dlqDepth: 0,
    activeWorkers: 1,
    activeApprovalsCount: 0,
    uptimeSeconds: 0,
    agentTokenUsage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
  });

  const [logs, setLogs] = useState<Array<{ timestamp: number; level: string; message: string; stepId?: string }>>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [replayingSequence, setReplayingSequence] = useState<number | null>(null);
  const [replayedSnapshot, setReplayedSnapshot] = useState<TimeTravelSnapshot | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const activeExecution = executions.find(e => e.id === activeExecutionId);
  const activeWorkflow = workflows.find(w => w.id === (activeExecution?.workflowId || selectedWorkflowId));

  // Connect WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        addLog('info', 'Connected to NexusFlow Real-Time Streaming Mesh');
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onmessage = evt => {
        try {
          const msg = JSON.parse(evt.data);
          handleWebSocketMessage(msg);
        } catch (e) {
          console.error('WS Parse Error:', e);
        }
      };
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const addLog = (level: string, message: string, stepId?: string) => {
    setLogs(prev => [...prev.slice(-400), { timestamp: Date.now(), level, message, stepId }]);
  };

  const handleWebSocketMessage = (msg: { type: string; data: any; timestamp: number }) => {
    switch (msg.type) {
      case 'EXECUTION_STARTED': {
        const exec: WorkflowExecution = msg.data;
        setExecutions(prev => [exec, ...prev.filter(e => e.id !== exec.id)]);
        setActiveExecutionId(exec.id);
        setSelectedWorkflowId(exec.workflowId);
        addLog('info', `Workflow started: [${exec.workflowName}] ID: ${exec.id}`);
        fetchMetrics();
        break;
      }
      case 'EXECUTION_UPDATED': {
        const exec: WorkflowExecution = msg.data;
        setExecutions(prev => prev.map(e => (e.id === exec.id ? exec : e)));
        fetchApprovals();
        break;
      }
      case 'EXECUTION_COMPLETED': {
        const exec: WorkflowExecution = msg.data;
        setExecutions(prev => prev.map(e => (e.id === exec.id ? exec : e)));
        addLog('info', `Workflow [${exec.workflowName}] completed successfully in ${exec.durationMs}ms`);
        fetchMetrics();
        fetchApprovals();
        break;
      }
      case 'EXECUTION_FAILED': {
        const { execution, error } = msg.data;
        setExecutions(prev => prev.map(e => (e.id === execution.id ? execution : e)));
        addLog('error', `Workflow failed: ${error}`);
        fetchMetrics();
        fetchDLQ();
        break;
      }
      case 'STEP_LOG': {
        addLog(msg.data.level, msg.data.message, msg.data.stepId);
        break;
      }
      case 'APPROVAL_REQUESTED': {
        addLog('warn', `Approval gate requested for step: ${msg.data.stepId}`, msg.data.stepId);
        fetchApprovals();
        break;
      }
      case 'APPROVAL_RESOLVED': {
        addLog('info', `Approval gate resolved: ${msg.data.decision.decision} by ${msg.data.decision.approver}`);
        fetchApprovals();
        break;
      }
      case 'STEP_COMPENSATING': {
        addLog('warn', `[SAGA] Compensating step: ${msg.data.stepName}`, msg.data.stepId);
        break;
      }
      case 'STEP_COMPENSATED': {
        addLog('info', `[SAGA] Step compensated: ${msg.data.stepName}`, msg.data.stepId);
        break;
      }
    }
  };

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      const [wfRes, execRes, metricsRes, appRes, dlqRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/executions'),
        fetch('/api/metrics'),
        fetch('/api/approvals'),
        fetch('/api/dlq'),
      ]);

      if (wfRes.ok) {
        const data = await wfRes.json();
        setWorkflows(data.workflows);
      }
      if (execRes.ok) {
        const data = await execRes.json();
        setExecutions(data.executions);
        if (data.executions.length > 0 && !activeExecutionId) {
          setActiveExecutionId(data.executions[0].id);
        }
      }
      if (metricsRes.ok) {
        const data = await metricsRes.json();
        setMetrics(data);
      }
      if (appRes.ok) {
        const data = await appRes.json();
        setApprovals(data.approvals);
      }
      if (dlqRes.ok) {
        const data = await dlqRes.json();
        setDlq(data.dlq);
      }
    } catch (err) {
      console.warn('Initial fetch error:', err);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics');
      if (res.ok) setMetrics(await res.json());
    } catch {}
  };

  const fetchApprovals = async () => {
    try {
      const res = await fetch('/api/approvals');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals);
      }
    } catch {}
  };

  const fetchDLQ = async () => {
    try {
      const res = await fetch('/api/dlq');
      if (res.ok) {
        const data = await res.json();
        setDlq(data.dlq);
      }
    } catch {}
  };

  const fetchExecutionEvents = async (execId: string) => {
    try {
      const res = await fetch(`/api/executions/${execId}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchMetrics();
      fetchApprovals();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeExecutionId) {
      fetchExecutionEvents(activeExecutionId);
      setReplayingSequence(null);
      setReplayedSnapshot(null);
    }
  }, [activeExecutionId]);

  // Time Travel Sequence Replay
  const handleSelectSequence = async (seq: number | null) => {
    setReplayingSequence(seq);
    if (seq === null || !activeExecutionId) {
      setReplayedSnapshot(null);
      return;
    }

    try {
      const res = await fetch(`/api/executions/${activeExecutionId}/replay/${seq}`);
      if (res.ok) {
        const data = await res.json();
        setReplayedSnapshot(data.snapshot);
      }
    } catch (e) {
      console.error('Replay fetch error:', e);
    }
  };

  // Trigger Execution
  const handleTriggerExecution = async (workflowId: string, initialState: Record<string, any>) => {
    try {
      addLog('info', `Triggering execution for [${workflowId}]...`);
      const res = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId, initialState }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Trigger error: ${err.error || 'Failed'}`);
        return;
      }

      const data = await res.json();
      setActiveExecutionId(data.execution.id);
    } catch (e: any) {
      alert(`Network error: ${e.message}`);
    }
  };

  // Submit Approval
  const handleSubmitApproval = async (
    executionId: string,
    stepId: string,
    gateId: string,
    decision: 'APPROVE' | 'REJECT',
    inputData?: Record<string, any>,
    comment?: string
  ) => {
    try {
      const res = await fetch('/api/approvals/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, stepId, gateId, decision, inputData, comment }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Approval error: ${err.error}`);
        return;
      }

      fetchApprovals();
    } catch (e: any) {
      alert(`Approval error: ${e.message}`);
    }
  };

  // Redrive DLQ
  const handleRedriveDLQ = async (executionId: string) => {
    try {
      const res = await fetch(`/api/dlq/redrive/${executionId}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Redrive error: ${err.error}`);
        return;
      }

      const data = await res.json();
      addLog('info', `Re-driven execution from DLQ: ${data.execution.id}`);
      setActiveExecutionId(data.execution.id);
      fetchDLQ();
      fetchMetrics();
    } catch (e: any) {
      alert(`Redrive error: ${e.message}`);
    }
  };

  // Compute displayed execution state (either live or replayed snapshot)
  const displayedExecution: WorkflowExecution | undefined = React.useMemo(() => {
    if (!activeExecution) return undefined;
    if (!replayedSnapshot) return activeExecution;

    // Overlay snapshot over execution
    const cloned = JSON.parse(JSON.stringify(activeExecution));
    cloned.status = replayedSnapshot.executionStatus;
    cloned.currentState = replayedSnapshot.stateSnapshot;
    cloned.stepOutputs = replayedSnapshot.stepOutputsSnapshot;

    for (const [stepId, status] of Object.entries(replayedSnapshot.stepStatuses)) {
      if (cloned.steps[stepId]) {
        cloned.steps[stepId].status = status;
      }
    }

    return cloned;
  }, [activeExecution, replayedSnapshot]);

  const selectedStepRecord =
    selectedStepId && displayedExecution?.steps[selectedStepId]
      ? displayedExecution.steps[selectedStepId]
      : null;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <Navbar
        wsConnected={wsConnected}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        onRefresh={fetchData}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Real-Time Metrics & Latencies */}
        <MetricsHeader metrics={metrics} />

        {/* Action Controls & Blueprint Launcher */}
        <ExecutionControls
          workflows={workflows}
          selectedWorkflowId={selectedWorkflowId}
          onSelectWorkflow={id => {
            setSelectedWorkflowId(id);
            const matching = executions.find(e => e.workflowId === id);
            if (matching) setActiveExecutionId(matching.id);
          }}
          onTriggerExecution={handleTriggerExecution}
          isExecuting={displayedExecution?.status === 'RUNNING'}
        />

        {/* Human-in-the-Loop Approval Center */}
        <ApprovalInbox
          approvals={approvals}
          onSubmitDecision={handleSubmitApproval}
          activeRole={activeRole}
        />

        {/* Time-Travel Replay Slider */}
        {events.length > 0 && (
          <TimeTravelDebugger
            events={events}
            currentSequence={replayingSequence}
            onSelectSequence={handleSelectSequence}
            snapshot={replayedSnapshot}
          />
        )}

        {/* Main Orchestration Canvas & Execution History */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
          {/* Left / Center 3 Columns: DAG Visualizer */}
          <div className="lg:col-span-3">
            <DAGCanvas
              workflow={activeWorkflow}
              execution={displayedExecution}
              selectedStepId={selectedStepId}
              onSelectStep={stepId => setSelectedStepId(stepId)}
              replayingSequence={replayingSequence}
            />
          </div>

          {/* Right 1 Column: Executions History */}
          <div className="glass-panel p-4 rounded-2xl border border-surface-border flex flex-col h-[480px]">
            <div className="flex items-center space-x-2 pb-3 mb-3 border-b border-slate-800 text-xs font-mono font-bold text-slate-300">
              <ListFilter className="w-4 h-4 text-emerald-400" />
              <span>RECENT RUNS ({executions.length})</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
              {executions.length === 0 ? (
                <div className="text-slate-600 text-center py-10">No execution history.</div>
              ) : (
                executions.map(exec => {
                  const isSelected = exec.id === activeExecutionId;
                  let statusColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
                  if (exec.status === 'RUNNING') statusColor = 'text-cyan-400 bg-cyan-950/60 border-cyan-800 animate-pulse';
                  if (exec.status === 'PAUSED_APPROVAL') statusColor = 'text-amber-400 bg-amber-950/60 border-amber-800';
                  if (exec.status === 'COMPENSATED') statusColor = 'text-purple-400 bg-purple-950/60 border-purple-800';
                  if (exec.status === 'FAILED') statusColor = 'text-rose-400 bg-rose-950/60 border-rose-800';

                  return (
                    <button
                      key={exec.id}
                      onClick={() => {
                        setActiveExecutionId(exec.id);
                        setSelectedWorkflowId(exec.workflowId);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-slate-800 border-emerald-400/80 shadow-md shadow-emerald-500/10'
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[11px] text-slate-200 line-clamp-1">{exec.workflowName}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase ${statusColor}`}>
                          {exec.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>ID: {exec.id.slice(0, 10)}...</span>
                        <span>{exec.durationMs !== undefined ? `${exec.durationMs}ms` : 'active'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* AI Agent Reasoning Mesh & Dead-Letter Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <AgentMeshInspector execution={displayedExecution} />
          <DLQManager dlq={dlq} onRedrive={handleRedriveDLQ} activeRole={activeRole} />
        </div>

        {/* Live Cyber Log Terminal */}
        <LiveLogTerminal logs={logs} onClear={() => setLogs([])} />
      </main>

      {/* Step Detail Inspection Modal */}
      <StepDetailModal
        stepRecord={selectedStepRecord}
        onClose={() => setSelectedStepId(null)}
      />
    </div>
  );
}
