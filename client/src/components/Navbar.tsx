import React from 'react';
import { Shield, Zap, Radio, RefreshCw, Cpu, Activity } from 'lucide-react';

interface NavbarProps {
  wsConnected: boolean;
  activeRole: 'ADMIN' | 'OPERATOR' | 'VIEWER';
  setActiveRole: (role: 'ADMIN' | 'OPERATOR' | 'VIEWER') => void;
  onRefresh: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  wsConnected,
  activeRole,
  setActiveRole,
  onRefresh,
}) => {
  return (
    <header className="border-b border-surface-border bg-surface/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-cyan-500 to-indigo-500 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#090d16] rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
                NexusFlow
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                v1.2 Core
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Autonomous Multi-Agent & Saga Engine
            </p>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex items-center space-x-4">
          {/* WebSocket Live Status */}
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className={wsConnected ? 'text-slate-300' : 'text-rose-400'}>
              {wsConnected ? 'Live Mesh Sync' : 'Reconnecting...'}
            </span>
          </div>

          {/* RBAC Role Selector */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs">
            <Shield className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1" />
            {(['ADMIN', 'OPERATOR', 'VIEWER'] as const).map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                  activeRole === role
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
            title="Refresh State"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
