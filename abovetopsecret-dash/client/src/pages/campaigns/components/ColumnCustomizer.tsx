import { useState, useRef, useEffect } from 'react';
import { Settings2 } from 'lucide-react';
import { ALL_COLUMNS } from '../types';
import type { ColumnPreset } from '../types';

interface ColumnCustomizerProps {
  visibleColumns: string[];
  preset: ColumnPreset;
  onApplyPreset: (preset: ColumnPreset) => void;
  onToggleColumn: (key: string) => void;
}

const PRESETS: { key: ColumnPreset; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'all', label: 'All Columns' },
  { key: 'custom', label: 'Custom' },
];

export default function ColumnCustomizer({ visibleColumns, preset, onApplyPreset, onToggleColumn }: ColumnCustomizerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-ats-card border-ats-border text-ats-text-muted hover:bg-ats-hover transition-colors"
        title="Customize columns"
      >
        <Settings2 className="w-3.5 h-3.5" />
        Columns
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 bg-ats-card border border-ats-border rounded-xl shadow-xl w-56 py-2">
          {/* Presets */}
          <div className="px-3 pb-2 mb-2 border-b border-ats-border">
            <p className="text-[10px] text-ats-text-muted uppercase tracking-wider mb-1.5">Presets</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.filter(p => p.key !== 'custom').map(p => (
                <button
                  key={p.key}
                  onClick={() => onApplyPreset(p.key)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                    preset === p.key
                      ? 'bg-ats-accent/20 text-ats-accent'
                      : 'bg-ats-bg text-ats-text-muted hover:bg-ats-hover'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Individual columns */}
          <div className="px-1 max-h-60 overflow-y-auto">
            {ALL_COLUMNS.map(col => (
              <label
                key={col.key}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-ats-hover rounded-md cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(col.key)}
                  onChange={() => onToggleColumn(col.key)}
                  className="w-3.5 h-3.5 rounded border-ats-border accent-ats-accent"
                />
                <span className="text-xs text-ats-text">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
