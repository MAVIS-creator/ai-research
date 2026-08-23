import React from 'react';
import { Bot, Sparkles, Terminal, ShieldCheck, Cpu, ArrowRight } from 'lucide-react';
import { WorkflowExecution } from '../../src/types';

interface AgentMeshInspectorProps {
  execution?: WorkflowExecution;
}

export const AgentMeshInspector: React.FC<AgentMeshInspectorProps> = ({ execution }) => {
  if (!execution) return null;

  // Find steps that contain agent traces
  const agentSteps = Object.values(execution.steps).filter(
    s => s.type === 'AGENT' && s.output && (s.output.agentTrace || s.output.tokenUsage)
  );

  if (agentSteps.length === 0) {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center text-slate-500 font-mono text-xs">
        <Bot className="w-8 h-8 mx-auto mb-2 text-slate-600" />
        No active agent reasoning traces in current workflow state.
      </div>
    );
  }

  return (
    <div className="glass-panel p-5 rounded-2xl border border-purple-500/30 bg-purple-950/10 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-purple-300">
              Autonomous Agent Mesh & Reasoning Inspector
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Live ReAct loops, tool execution outputs, and token telemetry
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {agentSteps.map(step => {
          const trace = step.output?.agentTrace || [];
          const tokenUsage = step.output?.tokenUsage;

          return (
            <div
              key={step.stepId}
              className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/20"
            >
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-xs text-slate-100">{step.name}</span>
                  <span className="text-[10px] font-mono text-purple-400 px-2 py-0.5 rounded bg-purple-950/80 border border-purple-800">
                    Step: {step.stepId}
                  </span>
                </div>

                {tokenUsage && (
                  <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
                    <Cpu className="w-3.5 h-3.5 text-purple-400" />
                    <span>Total Tokens: {tokenUsage.totalTokens}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-500">Prompt: {tokenUsage.promptTokens}</span>
                    <span className="text-slate-500">Comp: {tokenUsage.completionTokens}</span>
                  </div>
                )}
              </div>

              {/* Reasoning Trace Steps */}
              <div className="space-y-3">
                {trace.map((item: any, idx: number) => (
                  <div key={idx} className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 text-xs">
                    {/* Iteration & Thought */}
                    <div className="flex items-start space-x-2 mb-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        #{item.iteration}
                      </span>
                      <div className="flex-1">
                        <span className="text-purple-300 font-mono font-semibold">[Thought]: </span>
                        <span className="text-slate-200">{item.thought}</span>
                      </div>
                    </div>

                    {/* Tool Call & Observation */}
                    {item.toolCall && (
                      <div className="ml-6 mt-2 space-y-1.5 font-mono text-[11px]">
                        <div className="text-cyan-400 flex items-center space-x-1">
                          <Terminal className="w-3 h-3" />
                          <span>Tool Call: {item.toolCall.toolName}</span>
                        </div>
                        <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-slate-300 text-[10px] overflow-x-auto">
                          {JSON.stringify(item.toolCall.parameters, null, 2)}
                        </div>

                        {item.observation && (
                          <>
                            <div className="text-emerald-400 flex items-center space-x-1 mt-1.5">
                              <ArrowRight className="w-3 h-3" />
                              <span>Sandboxed Observation:</span>
                            </div>
                            <div className="bg-slate-900/90 p-2 rounded border border-slate-800 text-emerald-300 text-[10px] overflow-x-auto">
                              {JSON.stringify(item.observation, null, 2)}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
