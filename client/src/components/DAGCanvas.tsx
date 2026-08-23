import React, { useMemo } from 'react';
import {
  WorkflowExecution,
  WorkflowDefinition,
  StepStatus,
  StepType,
} from '../../src/types';
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  Bot,
  ShieldAlert,
  HelpCircle,
  FastForward,
  Cpu,
  Layers,
} from 'lucide-react';

interface DAGCanvasProps {
  workflow?: WorkflowDefinition;
  execution?: WorkflowExecution;
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  replayingSequence?: number | null;
}

interface NodePosition {
  id: string;
  name: string;
  type: StepType;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  dependencies: string[];
}

export const DAGCanvas: React.FC<DAGCanvasProps> = ({
  workflow,
  execution,
  selectedStepId,
  onSelectStep,
  replayingSequence,
}) => {
  if (!workflow) {
    return (
      <div className="h-96 flex items-center justify-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 text-slate-500 font-mono text-sm">
        Select or trigger a workflow to inspect execution graph
      </div>
    );
  }

  // Calculate topological levels for layered node layout
  const { nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
    const steps = workflow.steps;
    const levels = new Map<string, number>();

    // Compute levels based on longest path from roots
    const computeLevel = (stepId: string): number => {
      if (levels.has(stepId)) return levels.get(stepId)!;
      const step = steps.find(s => s.id === stepId);
      if (!step || step.dependencies.length === 0) {
        levels.set(stepId, 0);
        return 0;
      }
      const maxParentLevel = Math.max(...step.dependencies.map(d => computeLevel(d)));
      const lvl = maxParentLevel + 1;
      levels.set(stepId, lvl);
      return lvl;
    };

    steps.forEach(s => computeLevel(s.id));

    // Group steps by level
    const levelGroups = new Map<number, string[]>();
    for (const [id, lvl] of levels.entries()) {
      if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
      levelGroups.get(lvl)!.push(id);
    }

    const NODE_WIDTH = 230;
    const NODE_HEIGHT = 100;
    const HORIZONTAL_GAP = 120;
    const VERTICAL_GAP = 40;

    const maxLevel = Math.max(...Array.from(levels.values()), 0);
    const computedNodes: NodePosition[] = [];
    const computedEdges: Array<{ from: NodePosition; to: NodePosition; isRunning: boolean; isCompleted: boolean }> = [];

    const nodePosMap = new Map<string, NodePosition>();

    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const stepIdsInLevel = levelGroups.get(lvl) || [];
      const totalHeight = stepIdsInLevel.length * NODE_HEIGHT + (stepIdsInLevel.length - 1) * VERTICAL_GAP;
      const startY = Math.max(40, (400 - totalHeight) / 2);

      stepIdsInLevel.forEach((stepId, idx) => {
        const step = steps.find(s => s.id === stepId)!;
        const x = 50 + lvl * (NODE_WIDTH + HORIZONTAL_GAP);
        const y = startY + idx * (NODE_HEIGHT + VERTICAL_GAP);

        const nodePos: NodePosition = {
          id: stepId,
          name: step.name,
          type: step.type,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          level: lvl,
          dependencies: step.dependencies,
        };

        computedNodes.push(nodePos);
        nodePosMap.set(stepId, nodePos);
      });
    }

    // Build edges with execution states
    computedNodes.forEach(node => {
      node.dependencies.forEach(depId => {
        const parentNode = nodePosMap.get(depId);
        if (parentNode) {
          const parentRecord = execution?.steps[depId];
          const currentRecord = execution?.steps[node.id];
          const isCompleted = parentRecord?.status === 'COMPLETED';
          const isRunning = currentRecord?.status === 'RUNNING' || currentRecord?.status === 'WAITING_APPROVAL';

          computedEdges.push({
            from: parentNode,
            to: node,
            isRunning,
            isCompleted,
          });
        }
      });
    });

    const cWidth = Math.max(900, 100 + (maxLevel + 1) * (NODE_WIDTH + HORIZONTAL_GAP));
    const cHeight = Math.max(450, ...computedNodes.map(n => n.y + n.height + 60));

    return { nodes: computedNodes, edges: computedEdges, canvasWidth: cWidth, canvasHeight: cHeight };
  }, [workflow, execution]);

  const getStatusBadge = (status?: StepStatus) => {
    switch (status) {
      case 'COMPLETED':
        return { color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: CheckCircle, label: 'COMPLETED' };
      case 'RUNNING':
        return { color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse', icon: Play, label: 'RUNNING' };
      case 'WAITING_APPROVAL':
        return { color: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-bounce', icon: ShieldAlert, label: 'APPROVAL REQ' };
      case 'RETRYING':
        return { color: 'bg-orange-500/20 text-orange-400 border-orange-500/40', icon: RotateCcw, label: 'RETRYING' };
      case 'FAILED':
        return { color: 'bg-rose-500/20 text-rose-400 border-rose-500/40', icon: XCircle, label: 'FAILED' };
      case 'COMPENSATING':
        return { color: 'bg-purple-500/20 text-purple-400 border-purple-500/40 animate-pulse', icon: RotateCcw, label: 'COMPENSATING' };
      case 'COMPENSATED':
        return { color: 'bg-purple-900/40 text-purple-300 border-purple-700/50', icon: RotateCcw, label: 'COMPENSATED' };
      case 'SKIPPED':
        return { color: 'bg-slate-800 text-slate-400 border-slate-700', icon: FastForward, label: 'SKIPPED' };
      default:
        return { color: 'bg-slate-900 text-slate-500 border-slate-800', icon: Clock, label: 'PENDING' };
    }
  };

  const getTypeIcon = (type: StepType) => {
    switch (type) {
      case 'AGENT':
        return <Bot className="w-4 h-4 text-purple-400" />;
      case 'APPROVAL_GATE':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case 'PARALLEL_GROUP':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      default:
        return <Cpu className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="relative w-full overflow-x-auto overflow-y-hidden border border-surface-border rounded-2xl bg-[#0b101d] shadow-2xl p-4">
      {/* Canvas Header & Legend */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/80 text-xs font-mono text-slate-400">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-slate-200 uppercase tracking-wider">
            DAG Topology & Execution Mesh
          </span>
          {replayingSequence && (
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Time-Travel Snapshot: Seq #{replayingSequence}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4 text-[11px]">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Success</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Active</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>Approval</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span>Compensated</span>
          </span>
        </div>
      </div>

      <div style={{ width: canvasWidth, height: canvasHeight, minHeight: 420 }} className="relative">
        {/* SVG Connector Cables */}
        <svg
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
          style={{ width: canvasWidth, height: canvasHeight }}
        >
          <defs>
            <linearGradient id="edge-gradient-active" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="edge-gradient-complete" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          {edges.map((edge, idx) => {
            const startX = edge.from.x + edge.from.width;
            const startY = edge.from.y + edge.from.height / 2;
            const endX = edge.to.x;
            const endY = edge.to.y + edge.to.height / 2;

            const cX1 = startX + (endX - startX) * 0.5;
            const cY1 = startY;
            const cX2 = startX + (endX - startX) * 0.5;
            const cY2 = endY;

            const pathData = `M ${startX} ${startY} C ${cX1} ${cY1}, ${cX2} ${cY2}, ${endX} ${endY}`;

            return (
              <g key={`edge-${idx}`}>
                {/* Background Shadow Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#1a253c"
                  strokeWidth="3"
                />
                {/* Active or Completed Stream Line */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={edge.isRunning ? 'url(#edge-gradient-active)' : edge.isCompleted ? 'url(#edge-gradient-complete)' : '#1e293b'}
                  strokeWidth={edge.isRunning ? '3.5' : edge.isCompleted ? '2.5' : '1.5'}
                  strokeDasharray={edge.isRunning ? '6 4' : 'none'}
                  className={edge.isRunning ? 'animate-shimmer' : ''}
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const stepRecord = execution?.steps[node.id];
          const badge = getStatusBadge(stepRecord?.status);
          const Icon = badge.icon;
          const isSelected = selectedStepId === node.id;
          const progress = stepRecord?.progress || 0;

          return (
            <div
              key={node.id}
              onClick={() => onSelectStep(node.id)}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              className={`absolute z-10 cursor-pointer rounded-xl p-3 flex flex-col justify-between transition-all duration-200 ${
                isSelected
                  ? 'bg-slate-900 border-2 border-emerald-400 shadow-xl shadow-emerald-500/20 scale-105'
                  : 'bg-slate-900/90 border border-slate-800 hover:border-slate-600 hover:bg-slate-850 hover:shadow-lg'
              }`}
            >
              {/* Node Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded-md bg-slate-800/80 border border-slate-700">
                    {getTypeIcon(node.type)}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 tracking-wider uppercase">
                    {node.type}
                  </span>
                </div>
                <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${badge.color}`}>
                  <Icon className="w-3 h-3" />
                  <span>{badge.label}</span>
                </div>
              </div>

              {/* Node Title */}
              <div className="my-1">
                <div className="text-xs font-semibold text-slate-100 line-clamp-1" title={node.name}>
                  {node.name}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  ID: {node.id}
                </div>
              </div>

              {/* Node Footer / Progress & Timing */}
              <div>
                {stepRecord?.status === 'RUNNING' && (
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mb-1 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>
                    {stepRecord?.durationMs !== undefined ? `${stepRecord.durationMs}ms` : '---'}
                  </span>
                  {stepRecord?.attempt && stepRecord.attempt > 1 && (
                    <span className="text-amber-400">Try #{stepRecord.attempt}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
