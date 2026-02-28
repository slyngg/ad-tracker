import { useState } from 'react';
import {
  X,
  DollarSign,
  History,
  Loader2,
  TrendingDown,
  TrendingUp,
  ArrowDown,
  ArrowUp,
  Pause,
  Play,
} from 'lucide-react';
import { fmt$ } from '../formatters';
import type { ActivityLogEntry } from '../types';

interface BudgetModalProps {
  platform: string;
  entityId: string;
  currentBudget?: number;
  onClose: () => void;
  onSubmit: (newBudget: number) => Promise<void>;
  onLoadActivityLog: (entityId: string) => Promise<ActivityLogEntry[]>;
}

export default function BudgetModal({
  platform,
  entityId,
  currentBudget,
  onClose,
  onSubmit,
  onLoadActivityLog,
}: BudgetModalProps) {
  const [budgetValue, setBudgetValue] = useState(currentBudget ? String(currentBudget) : '');
  const [budgetTab, setBudgetTab] = useState<'adjust' | 'history'>('adjust');
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const newVal = parseFloat(budgetValue) || 0;
  const diff = currentBudget !== undefined ? newVal - currentBudget : 0;
  const diffPct = currentBudget ? ((diff / currentBudget) * 100) : 0;

  async function handleSubmit() {
    const val = parseFloat(budgetValue);
    if (isNaN(val) || val < 5) { alert('Minimum $5.00'); return; }
    setSaving(true);
    try {
      await onSubmit(val);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function loadLog() {
    setActivityLogLoading(true);
    try {
      const log = await onLoadActivityLog(entityId);
      setActivityLog(log);
    } catch {
      setActivityLog([]);
    } finally {
      setActivityLogLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-ats-card border border-ats-border rounded-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="text-base font-bold text-ats-text">Daily Budget</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-ats-bg text-ats-text-muted hover:text-ats-text"><X className="w-4 h-4" /></button>
        </div>

        {/* Current budget display */}
        {currentBudget !== undefined && (
          <div className="mx-6 mb-4 p-3 rounded-xl bg-ats-bg border border-ats-border">
            <p className="text-[11px] text-ats-text-muted uppercase tracking-wider mb-1">Current Budget</p>
            <p className="text-2xl font-bold text-ats-text font-mono">{fmt$(currentBudget)}</p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex mx-6 mb-4 bg-ats-bg rounded-lg p-0.5 border border-ats-border">
          <button
            onClick={() => setBudgetTab('adjust')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${budgetTab === 'adjust' ? 'bg-ats-card text-ats-text shadow-sm' : 'text-ats-text-muted hover:text-ats-text'}`}
          >
            <DollarSign className="w-3 h-3" />Adjust
          </button>
          <button
            onClick={() => { setBudgetTab('history'); loadLog(); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${budgetTab === 'history' ? 'bg-ats-card text-ats-text shadow-sm' : 'text-ats-text-muted hover:text-ats-text'}`}
          >
            <History className="w-3 h-3" />History
          </button>
        </div>

        {/* Adjust tab */}
        {budgetTab === 'adjust' && (
          <div className="px-6 pb-5">
            <label className="text-[11px] text-ats-text-muted uppercase tracking-wider mb-1.5 block">New Budget</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ats-text-muted">$</span>
              <input type="number" min="5" step="1" value={budgetValue} onChange={e => setBudgetValue(e.target.value)} placeholder="50" autoFocus
                className="w-full pl-7 pr-3 py-2.5 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text focus:outline-none focus:border-ats-accent" />
            </div>

            {/* Change preview */}
            {currentBudget !== undefined && newVal > 0 && newVal !== currentBudget && (
              <div className={`mb-3 p-2.5 rounded-lg border text-xs ${diff < 0 ? 'border-red-500/20 bg-red-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
                <div className="flex items-center gap-1.5">
                  {diff < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-400" /> : <TrendingUp className="w-3.5 h-3.5 text-green-400" />}
                  <span className={diff < 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                    {diff > 0 ? '+' : ''}{fmt$(diff)} ({diff > 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                  </span>
                  <span className="text-ats-text-muted ml-auto">{fmt$(currentBudget)} → {fmt$(newVal)}</span>
                </div>
              </div>
            )}

            {/* Quick adjust - decrease */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[-50, -25, -10, -5].map(amt => (
                <button key={amt} onClick={() => {
                  const cur = parseFloat(budgetValue) || 0;
                  const next = Math.max(5, cur + amt);
                  setBudgetValue(String(Math.round(next * 100) / 100));
                }}
                  className="py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/10">
                  {amt}
                </button>
              ))}
            </div>
            {/* Quick adjust - increase */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[5, 10, 25, 50].map(amt => (
                <button key={amt} onClick={() => {
                  const cur = parseFloat(budgetValue) || 0;
                  const next = Math.max(5, cur + amt);
                  setBudgetValue(String(Math.round(next * 100) / 100));
                }}
                  className="py-1.5 rounded-lg text-xs font-semibold border border-green-500/30 text-green-400 hover:bg-green-500/10">
                  +{amt}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-ats-text-muted mb-4">Minimum $5.00</p>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm text-ats-text-muted hover:text-ats-text">Cancel</button>
              <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-ats-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? 'Saving...' : 'Update Budget'}
              </button>
            </div>
          </div>
        )}

        {/* History tab */}
        {budgetTab === 'history' && (
          <div className="px-6 pb-5">
            {activityLogLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-ats-text-muted" />
              </div>
            ) : activityLog.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-8 h-8 text-ats-text-muted/40 mx-auto mb-2" />
                <p className="text-sm text-ats-text-muted">No activity yet</p>
                <p className="text-[11px] text-ats-text-muted/60 mt-1">Budget changes and pause/resume events will appear here</p>
              </div>
            ) : (
              <div className="space-y-0 max-h-80 overflow-y-auto">
                {activityLog.map((entry, i) => {
                  const date = new Date(entry.created_at);
                  const isPause = entry.action === 'pause';
                  const isResume = entry.action === 'resume';

                  if (isPause || isResume) {
                    return (
                      <div key={entry.id} className={`flex items-center gap-3 py-3 ${i > 0 ? 'border-t border-ats-border/50' : ''}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isPause ? 'bg-yellow-500/10' : 'bg-emerald-500/10'}`}>
                          {isPause ? <Pause className="w-3 h-3 text-yellow-400" /> : <Play className="w-3 h-3 text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-semibold ${isPause ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {isPause ? 'Paused' : 'Resumed'}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] text-ats-text-muted">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                          <p className="text-[10px] text-ats-text-muted/60">{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    );
                  }

                  // Budget change
                  const change = entry.old_budget != null && entry.new_budget != null ? entry.new_budget - entry.old_budget : null;
                  const changePct = entry.old_budget ? ((change! / entry.old_budget) * 100) : null;
                  const isDecrease = change != null && change < 0;
                  const isIncrease = change != null && change > 0;
                  return (
                    <div key={entry.id} className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-ats-border/50' : ''}`}>
                      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isDecrease ? 'bg-red-500/10' : isIncrease ? 'bg-green-500/10' : 'bg-ats-bg'}`}>
                        {isDecrease ? <ArrowDown className="w-3 h-3 text-red-400" /> : isIncrease ? <ArrowUp className="w-3 h-3 text-green-400" /> : <DollarSign className="w-3 h-3 text-ats-text-muted" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-semibold text-ats-text font-mono">{entry.new_budget != null ? fmt$(entry.new_budget) : '—'}</span>
                          {change != null && (
                            <span className={`text-[11px] font-semibold ${isDecrease ? 'text-red-400' : 'text-green-400'}`}>
                              {change > 0 ? '+' : ''}{fmt$(change)}{changePct != null ? ` (${change > 0 ? '+' : ''}${changePct.toFixed(1)}%)` : ''}
                            </span>
                          )}
                        </div>
                        {entry.old_budget != null && (
                          <p className="text-[11px] text-ats-text-muted">from {fmt$(entry.old_budget)}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[11px] text-ats-text-muted">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        <p className="text-[10px] text-ats-text-muted/60">{date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
