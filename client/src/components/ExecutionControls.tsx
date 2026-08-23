import React, { useState } from 'react';
import { Play, Sparkles, AlertOctagon, Terminal, Flame, ShieldAlert, Cpu } from 'lucide-react';
import { WorkflowDefinition } from '../../src/types';

interface ExecutionControlsProps {
  workflows: WorkflowDefinition[];
  selectedWorkflowId: string;
  onSelectWorkflow: (id: string) => void;
  onTriggerExecution: (workflowId: string, initialState: Record<string, any>) => void;
  isExecuting: boolean;
}

export const ExecutionControls: React.FC<ExecutionControlsProps> = ({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onTriggerExecution,
  isExecuting,
}) => {
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [showJsonInput, setShowJsonInput] = useState(false);
  const [customJson, setCustomJson] = useState('{}');

  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);

  const handleLaunch = () => {
    let state: Record<string, any> = {};

    if (showJsonInput) {
      try {
        state = JSON.parse(customJson);
      } catch {
        alert('Invalid JSON in custom state input');
        return;
      }
    } else {
      if (selectedWorkflowId === 'wf_order_fulfillment_saga') {
        state = {
          sku: 'SKU-QUANTUM-GPU-4090',
          quantity: 2,
          amount: 1999.98,
          simulateFailure,
        };
      } else if (selectedWorkflowId === 'wf_research_swarm') {
        state = {
          topic: customTopic.trim() || 'High-Throughput Global Event Streaming with Active-Active Disaster Recovery',
        };
      }
    }

    onTriggerExecution(selectedWorkflowId, state);
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-surface-border mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Workflow Selection Pills */}
        <div className="flex-1">
          <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block mb-2">
            Select Orchestration Blueprint
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {workflows.map(wf => {
              const isSelected = wf.id === selectedWorkflowId;
              let icon = <Cpu className="w-4 h-4 text-emerald-400" />;
              if (wf.id.includes('incident')) icon = <Flame className="w-4 h-4 text-rose-400" />;
              if (wf.id.includes('research')) icon = <Sparkles className="w-4 h-4 text-purple-400" />;
              if (wf.id.includes('order')) icon = <AlertOctagon className="w-4 h-4 text-amber-400" />;
              if (wf.id.includes('security')) icon = <ShieldAlert className="w-4 h-4 text-cyan-400" />;

              return (
                <button
                  key={wf.id}
                  onClick={() => onSelectWorkflow(wf.id)}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    isSelected
                      ? 'bg-slate-800/90 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    {icon}
                    <span className="font-semibold text-xs text-slate-200 line-clamp-1">{wf.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{wf.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Trigger & Modifiers */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:border-l lg:border-slate-800 lg:pl-5">
          {selectedWorkflowId === 'wf_order_fulfillment_saga' && (
            <label className="flex items-center space-x-2 text-xs font-mono text-amber-400 bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-800/50 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateFailure}
                onChange={e => setSimulateFailure(e.target.checked)}
                className="rounded border-amber-600 text-amber-500 focus:ring-0"
              />
              <span>Force Rollback (Demonstrate Saga)</span>
            </label>
          )}

          {selectedWorkflowId === 'wf_research_swarm' && (
            <input
              type="text"
              placeholder="Custom research topic..."
              value={customTopic}
              onChange={e => setCustomTopic(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-64 font-mono"
            />
          )}

          <button
            onClick={handleLaunch}
            disabled={isExecuting}
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-extrabold text-xs uppercase tracking-wider px-5 py-3 rounded-xl shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="w-4 h-4 fill-black" />
            <span>{isExecuting ? 'Orchestrating...' : 'Trigger Execution'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
