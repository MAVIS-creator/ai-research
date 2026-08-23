import React, { useState } from 'react';
import { ShieldAlert, Check, X, UserCheck, AlertCircle } from 'lucide-react';
import { ApprovalGate } from '../../src/types';

interface ApprovalInboxProps {
  approvals: Array<{
    key: string;
    executionId: string;
    stepId: string;
    gate: ApprovalGate;
    requestedAt: number;
    timeoutAt?: number;
  }>;
  onSubmitDecision: (
    executionId: string,
    stepId: string,
    gateId: string,
    decision: 'APPROVE' | 'REJECT',
    inputData?: Record<string, any>,
    comment?: string
  ) => void;
  activeRole: string;
}

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({
  approvals,
  onSubmitDecision,
  activeRole,
}) => {
  const [formData, setFormData] = useState<Record<string, Record<string, any>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  if (approvals.length === 0) {
    return null;
  }

  const handleInputChange = (key: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [field]: value,
      },
    }));
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border-2 border-amber-500/50 bg-amber-950/20 mb-6 shadow-xl shadow-amber-500/10">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40">
          <ShieldAlert className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-amber-300">
            Action Required: Human-in-the-Loop Approval Gates ({approvals.length})
          </h2>
          <p className="text-xs text-slate-300">
            Execution is suspended waiting for authorized operator sign-off
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {approvals.map(app => {
          const currentForm = formData[app.key] || {};
          const currentComment = comments[app.key] || '';
          const isAllowedRole =
            app.gate.requiredRole === 'ANY' ||
            activeRole === 'ADMIN' ||
            activeRole === app.gate.requiredRole;

          return (
            <div
              key={app.key}
              className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-bold text-sm text-slate-100">{app.gate.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                    Role Req: {app.gate.requiredRole}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Exec: {app.executionId.slice(0, 14)}...
                  </span>
                </div>
                <p className="text-xs text-slate-300 mb-3">{app.gate.description}</p>

                {/* Input Schema Parameters */}
                {app.gate.inputSchema && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                    {Object.entries(app.gate.inputSchema).map(([fieldName, spec]: [string, any]) => (
                      <div key={fieldName}>
                        <label className="text-[11px] font-mono text-slate-400 block mb-1">
                          {spec.label || fieldName} {spec.required && <span className="text-rose-400">*</span>}
                        </label>
                        <input
                          type={spec.type === 'number' ? 'number' : 'text'}
                          defaultValue={spec.default !== undefined ? spec.default : ''}
                          onChange={e =>
                            handleInputChange(
                              app.key,
                              fieldName,
                              spec.type === 'number' ? parseFloat(e.target.value) : e.target.value
                            )
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {!isAllowedRole ? (
                  <div className="text-xs font-mono text-rose-400 bg-rose-950/40 px-3 py-2 rounded-lg border border-rose-800">
                    Requires {app.gate.requiredRole} permissions
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        onSubmitDecision(
                          app.executionId,
                          app.stepId,
                          app.gate.gateId,
                          'REJECT',
                          currentForm,
                          currentComment || 'Operator rejected execution gate'
                        )
                      }
                      className="flex items-center justify-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold font-mono transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4 text-rose-400" />
                      <span>REJECT</span>
                    </button>
                    <button
                      onClick={() =>
                        onSubmitDecision(
                          app.executionId,
                          app.stepId,
                          app.gate.gateId,
                          'APPROVE',
                          currentForm,
                          currentComment || 'Authorized'
                        )
                      }
                      className="flex items-center justify-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold font-mono transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>AUTHORIZE & PROCEED</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
