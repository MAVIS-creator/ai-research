import React from 'react';
import { AlertOctagon, RotateCw, CheckCircle, ShieldAlert } from 'lucide-react';

interface DLQItem {
  executionId: string;
  workflowId: string;
  error: string;
  timestamp: number;
  payload: any;
}

interface DLQManagerProps {
  dlq: DLQItem[];
  onRedrive: (executionId: string) => void;
  activeRole: string;
}

export const DLQManager: React.FC<DLQManagerProps> = ({ dlq, onRedrive, activeRole }) => {
  if (dlq.length === 0) {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center text-slate-500 font-mono text-xs">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
        Dead-Letter Queue is empty. All distributed saga transactions are healthy.
      </div>
    );
  }

  const isAdmin = activeRole === 'ADMIN';

  return (
    <div className="glass-panel p-5 rounded-2xl border border-rose-500/40 bg-rose-950/20 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <AlertOctagon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-rose-300">
              Dead-Letter Queue (DLQ) Manager ({dlq.length})
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Quarantined executions that triggered saga compensations or fatal faults
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {dlq.map((item, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-rose-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
          >
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-bold text-slate-200">{item.workflowId}</span>
                <span className="text-slate-500">ID: {item.executionId}</span>
                <span className="text-[10px] text-slate-400">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-rose-400 text-[11px]">{item.error}</div>
            </div>

            <div>
              <button
                onClick={() => onRedrive(item.executionId)}
                disabled={!isAdmin}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-md shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title={isAdmin ? 'Re-drive execution' : 'Requires ADMIN role'}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Re-Drive Execution</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
