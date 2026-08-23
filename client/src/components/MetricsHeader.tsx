import React from 'react';
import { Activity, CheckCircle2, RotateCcw, Clock, AlertTriangle, Cpu, Flame } from 'lucide-react';

interface MetricsHeaderProps {
  metrics: {
    totalExecutions: number;
    activeExecutions: number;
    completedExecutions: number;
    compensatedExecutions: number;
    failedExecutions: number;
    throughputOpsSec: number;
    latenciesMs: { p50: number; p95: number; p99: number; avg: number };
    dlqDepth: number;
    activeApprovalsCount: number;
    agentTokenUsage: { totalTokens: number; promptTokens: number; completionTokens: number };
  };
}

export const MetricsHeader: React.FC<MetricsHeaderProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      {/* Active Executions */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Active Flow</span>
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
        </div>
        <div className="text-xl font-bold font-mono text-cyan-400">{metrics.activeExecutions}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">In-flight DAG executions</div>
      </div>

      {/* Completed */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Success</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-xl font-bold font-mono text-emerald-400">{metrics.completedExecutions}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Resolved without error</div>
      </div>

      {/* Saga Compensations */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Saga Rollbacks</span>
          <RotateCcw className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-xl font-bold font-mono text-amber-400">{metrics.compensatedExecutions}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Compensated rollbacks</div>
      </div>

      {/* Latency P95 */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">P95 Latency</span>
          <Clock className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-xl font-bold font-mono text-indigo-300">
          {metrics.latenciesMs.p95} <span className="text-xs text-slate-400 font-sans">ms</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">p50: {metrics.latenciesMs.p50}ms | avg: {metrics.latenciesMs.avg}ms</div>
      </div>

      {/* Throughput */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Throughput</span>
          <Flame className="w-4 h-4 text-rose-400" />
        </div>
        <div className="text-xl font-bold font-mono text-rose-300">
          {metrics.throughputOpsSec} <span className="text-xs text-slate-400 font-sans">ops/s</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">Total: {metrics.totalExecutions} runs</div>
      </div>

      {/* Dead-Letter Queue */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">DLQ Depth</span>
          <AlertTriangle className={`w-4 h-4 ${metrics.dlqDepth > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-500'}`} />
        </div>
        <div className={`text-xl font-bold font-mono ${metrics.dlqDepth > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
          {metrics.dlqDepth}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">Dead-letter queue items</div>
      </div>

      {/* Agent Tokens */}
      <div className="glass-panel p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/40">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">AI Tokens</span>
          <Cpu className="w-4 h-4 text-purple-400" />
        </div>
        <div className="text-xl font-bold font-mono text-purple-300">
          {metrics.agentTokenUsage.totalTokens.toLocaleString()}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">Prompt + completion tokens</div>
      </div>
    </div>
  );
};
