import React from 'react';
import { X, Cpu, Clock, AlertTriangle, RotateCcw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { StepExecutionRecord } from '../../src/types';

interface StepDetailModalProps {
  stepRecord: StepExecutionRecord | null;
  onClose: () => void;
}

export const StepDetailModal: React.FC<StepDetailModalProps> = ({ stepRecord, onClose }) => {
  if (!stepRecord) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-surface-border bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">{stepRecord.name}</h2>
              <p className="text-[11px] font-mono text-slate-500">ID: {stepRecord.stepId} | Type: {stepRecord.type}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs text-slate-300">
          {/* Metadata badges */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">STATUS</span>
              <span className="font-bold text-slate-200">{stepRecord.status}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">DURATION</span>
              <span className="font-bold text-indigo-300">{stepRecord.durationMs !== undefined ? `${stepRecord.durationMs}ms` : '---'}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 block">ATTEMPTS</span>
              <span className="font-bold text-slate-200">{stepRecord.attempt || 1}</span>
            </div>
          </div>

          {/* Compensation status if applicable */}
          {stepRecord.compensated && (
            <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/60 text-purple-300 flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-purple-400" />
              <span>Saga Compensation Successfully Executed for this step</span>
            </div>
          )}

          {/* Error display if failed */}
          {stepRecord.error && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300">
              <div className="font-bold mb-1 flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Execution Error:</span>
              </div>
              <p className="text-[11px] break-all">{stepRecord.error}</p>
            </div>
          )}

          {/* Output Payload */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Step Output Payload
            </span>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto text-[11px] text-emerald-300 max-h-48">
              <pre>{JSON.stringify(stepRecord.output, null, 2) || 'null'}</pre>
            </div>
          </div>

          {/* Step Execution Logs */}
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Execution Logs ({stepRecord.logs?.length || 0})
            </span>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1 max-h-40 overflow-y-auto text-[10px]">
              {(!stepRecord.logs || stepRecord.logs.length === 0) ? (
                <div className="text-slate-600">No logs for this step.</div>
              ) : (
                stepRecord.logs.map((log, idx) => (
                  <div key={idx} className="flex items-start space-x-2">
                    <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`uppercase ${log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}`}>
                      [{log.level}]
                    </span>
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
