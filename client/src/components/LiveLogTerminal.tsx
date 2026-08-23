import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Search, Trash2, ArrowDown } from 'lucide-react';

interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  stepId?: string;
  executionId?: string;
}

interface LiveLogTerminalProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LiveLogTerminal: React.FC<LiveLogTerminalProps> = ({ logs, onClear }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'ALL' && log.level.toUpperCase() !== filterLevel) {
      return false;
    }
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-rose-400 bg-rose-950/40 border-rose-800';
      case 'warn':
        return 'text-amber-400 bg-amber-950/40 border-amber-800';
      case 'debug':
        return 'text-cyan-400 bg-cyan-950/40 border-cyan-800';
      default:
        return 'text-emerald-400 bg-emerald-950/40 border-emerald-800';
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-surface-border overflow-hidden flex flex-col h-96">
      {/* Terminal Header */}
      <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono font-bold text-slate-200">
            ENGINE LOG STREAM ({filteredLogs.length})
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Level Filter */}
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none"
          >
            <option value="ALL">ALL LEVELS</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1 text-[11px] font-mono text-slate-200 placeholder-slate-600 focus:outline-none w-36"
            />
          </div>

          <button
            onClick={onClear}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Log Body */}
      <div className="flex-1 p-3 bg-[#080c14] overflow-y-auto font-mono text-[11px] space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-center py-10">No log entries matching filter.</div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div key={idx} className="flex items-start space-x-2 py-0.5 hover:bg-slate-900/60 rounded px-1">
              <span className="text-slate-500 select-none">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`px-1 rounded text-[9px] uppercase border ${getLevelColor(log.level)}`}>
                {log.level}
              </span>
              {log.stepId && (
                <span className="text-slate-400 font-semibold">[{log.stepId}]:</span>
              )}
              <span className="text-slate-200 flex-1 break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};
