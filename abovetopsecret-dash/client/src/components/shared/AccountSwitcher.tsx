import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { useAccountStore } from '../../stores/accountStore';

export default function AccountSwitcher() {
  const { accounts, selectedAccountIds, setSelectedAccountIds, clearFilters, loadAccounts } = useAccountStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Don't render if fewer than 2 accounts
  if (accounts.length < 2) return null;

  const selectedNames = accounts
    .filter((a) => selectedAccountIds.includes(a.id))
    .map((a) => a.name);

  const label = selectedAccountIds.length === 0
    ? 'All Accounts'
    : selectedNames.length <= 2
      ? selectedNames.join(', ')
      : `${selectedNames.length} accounts`;

  function toggle(id: number) {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((x) => x !== id)
      : [...selectedAccountIds, id];
    setSelectedAccountIds(next);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-ats-text bg-ats-card border border-ats-border hover:border-ats-accent transition-colors"
      >
        {selectedAccountIds.length > 0 && (
          <span className="w-2 h-2 rounded-full bg-ats-accent" />
        )}
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-64 bg-ats-card border border-ats-border rounded-xl shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-ats-border flex items-center justify-between">
            <span className="text-xs font-semibold text-ats-text-muted uppercase tracking-wider">Accounts</span>
            {selectedAccountIds.length > 0 && (
              <button
                onClick={() => { clearFilters(); }}
                className="text-[10px] text-ats-accent hover:underline flex items-center gap-1"
              >
                <X size={10} /> Clear
              </button>
            )}
          </div>
          {accounts.map((acct) => {
            const selected = selectedAccountIds.includes(acct.id);
            return (
              <button
                key={acct.id}
                onClick={() => toggle(acct.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-ats-bg transition-colors text-left"
              >
                <span
                  className="w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: acct.color || '#6b7280',
                    backgroundColor: selected ? (acct.color || '#6b7280') : 'transparent',
                  }}
                >
                  {selected && <Check size={8} className="text-white" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-ats-text truncate">{acct.name}</div>
                  <div className="text-[10px] text-ats-text-muted">{acct.platform}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
