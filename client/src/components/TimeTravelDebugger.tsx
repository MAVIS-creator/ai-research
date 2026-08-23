import React, { useState } from 'react';
import { History, Play, SkipBack, SkipForward, Radio, Eye } from 'lucide-react';
import { WorkflowEvent, TimeTravelSnapshot } from '../../src/types';

interface TimeTravelDebuggerProps {
  events: WorkflowEvent[];
  currentSequence: number | null;
  onSelectSequence: (seq: number | null) => void;
  snapshot: TimeTravelSnapshot | null;
}

export const TimeTravelDebugger: React.FC<TimeTravelDebuggerProps> = ({
  events,
  currentSequence,
  onSelectSequence,
  snapshot,
}) => {
  const maxSeq = events.length;

  if (maxSeq === 0) {
    return null;
  }

  const isLive = currentSequence === null || currentSequence >= maxSeq;
  const activeSeq = currentSequence || maxSeq;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (val >= maxSeq) {
      onSelectSequence(null); // return to live
    } else {
      onSelectSequence(val);
    }
  };

  const handleStepBack = () => {
    const prev = Math.max(1, activeSeq - 1);
    onSelectSequence(prev);
  };

  const handleStepForward = () => {
    const next = activeSeq + 1;
    if (next >= maxSeq) {
      onSelectSequence(null);
    } else {
      onSelectSequence(next);
    }
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-indigo-500/30 bg-slate-900/60 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
            <History className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-indigo-300">
              Deterministic Time-Travel Replay
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Scrub sequence history to inspect exact past state snapshots
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onSelectSequence(null)}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              isLive
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{isLive ? 'LIVE REAL-TIME' : 'RETURN TO LIVE'}</span>
          </button>
        </div>
      </div>

      {/* Scrubbing Bar */}
      <div className="space-y-2">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleStepBack}
            disabled={activeSeq <= 1}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous Step"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <input
            type="range"
            min={1}
            max={maxSeq}
            value={activeSeq}
            onChange={handleSliderChange}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />

          <button
            onClick={handleStepForward}
            disabled={isLive}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next Step"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono text-indigo-300 px-2 py-1 rounded bg-indigo-950/80 border border-indigo-800/50 whitespace-nowrap">
            Seq #{activeSeq} / {maxSeq}
          </span>
        </div>

        {/* Snapshot Summary Box when Time Traveling */}
        {!isLive && snapshot && (
          <div className="mt-3 p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs font-mono">
            <div className="flex items-center justify-between text-indigo-300 mb-1">
              <span className="font-semibold">{snapshot.eventDescription}</span>
              <span className="text-[10px] text-slate-400">
                {new Date(snapshot.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-[11px] text-slate-300">
              Execution Status: <span className="font-bold text-amber-400">{snapshot.executionStatus}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
