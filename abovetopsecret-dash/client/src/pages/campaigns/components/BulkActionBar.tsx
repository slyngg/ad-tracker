import { useState } from 'react';
import type { Account } from '../types';

interface BulkActionBarProps {
  selectedCount: number;
  accounts: Account[];
  onBulkPause: () => Promise<void>;
  onBulkEnable: () => Promise<void>;
  onBulkAssign: (accountId: number) => Promise<void>;
  onClear: () => void;
}

export default function BulkActionBar({
  selectedCount,
  accounts,
  onBulkPause,
  onBulkEnable,
  onBulkAssign,
  onClear,
}: BulkActionBarProps) {
  const [assignOpen, setAssignOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="bg-ats-accent/10 border border-ats-accent/30 rounded-xl px-4 py-3 mb-3 flex items-center gap-3 flex-wrap">
      <span className="text-sm text-ats-text font-medium">{selectedCount} selected</span>

      <button
        onClick={onBulkPause}
        className="px-3 py-1.5 bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 rounded-lg text-xs font-semibold hover:bg-yellow-500/25 transition-colors"
      >
        Pause All
      </button>
      <button
        onClick={onBulkEnable}
        className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/25 transition-colors"
      >
        Enable All
      </button>

      <div className="relative">
        <button onClick={() => setAssignOpen(p => !p)} className="px-3 py-1.5 bg-ats-accent text-white rounded-lg text-xs font-semibold hover:opacity-90">
          Move to Account
        </button>
        {assignOpen && (
          <div className="absolute left-0 top-9 z-50 bg-ats-card border border-ats-border rounded-lg shadow-xl py-1 min-w-[200px]">
            {accounts.filter(a => a.status === 'active').map(a => (
              <button key={a.id} onClick={() => { onBulkAssign(a.id); setAssignOpen(false); }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-ats-hover text-ats-text">
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={onClear} className="text-xs text-ats-text-muted hover:text-ats-text">Clear</button>
    </div>
  );
}
