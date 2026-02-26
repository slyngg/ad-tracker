import { useState, useCallback } from 'react';
import { formatDateInput, parseDateInput, startOfDay, type PresetDef } from './presets';

interface DateRangeBottomBarProps {
  from: Date;
  to: Date;
  activePreset: PresetDef | undefined;
  onDateChange: (from: Date, to: Date) => void;
  onCancel: () => void;
  onUpdate: () => void;
  hasChanges: boolean;
}

export default function DateRangeBottomBar({
  from,
  to,
  activePreset,
  onDateChange,
  onCancel,
  onUpdate,
  hasChanges,
}: DateRangeBottomBarProps) {
  const [fromStr, setFromStr] = useState(formatDateInput(from));
  const [toStr, setToStr] = useState(formatDateInput(to));

  // Keep inputs in sync when parent changes
  const syncFrom = formatDateInput(from);
  const syncTo = formatDateInput(to);
  if (fromStr !== syncFrom && document.activeElement?.getAttribute('data-field') !== 'from') {
    setFromStr(syncFrom);
  }
  if (toStr !== syncTo && document.activeElement?.getAttribute('data-field') !== 'to') {
    setToStr(syncTo);
  }

  const handleFromBlur = useCallback(() => {
    const d = parseDateInput(fromStr);
    if (d && d <= to) {
      onDateChange(d, to);
    } else {
      setFromStr(formatDateInput(from));
    }
  }, [fromStr, from, to, onDateChange]);

  const handleToBlur = useCallback(() => {
    const d = parseDateInput(toStr);
    const today = startOfDay(new Date());
    if (d && d >= from && d <= today) {
      onDateChange(from, d);
    } else {
      setToStr(formatDateInput(to));
    }
  }, [toStr, from, to, onDateChange]);

  return (
    <div className="border-t border-ats-border px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: preset indicator */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {activePreset && (
            <>
              <span className="w-2 h-2 rounded-full bg-ats-accent shrink-0" />
              <span className="text-xs font-medium text-ats-text truncate">{activePreset.label}</span>
            </>
          )}
        </div>

        {/* Center: date inputs */}
        <div className="flex items-center gap-1.5 text-xs">
          <input
            data-field="from"
            value={fromStr}
            onChange={(e) => setFromStr(e.target.value)}
            onBlur={handleFromBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleFromBlur()}
            className="w-[110px] px-2 py-1.5 rounded-md bg-white/5 border border-ats-border text-ats-text text-xs text-center focus:outline-none focus:border-ats-accent transition-colors"
          />
          <span className="text-ats-text-muted">–</span>
          <input
            data-field="to"
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            onBlur={handleToBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleToBlur()}
            className="w-[110px] px-2 py-1.5 rounded-md bg-white/5 border border-ats-border text-ats-text text-xs text-center focus:outline-none focus:border-ats-accent transition-colors"
          />
        </div>

        {/* Right: Cancel / Update */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-ats-text-muted hover:text-ats-text hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onUpdate}
            disabled={!hasChanges}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              hasChanges
                ? 'bg-ats-accent text-white hover:bg-ats-accent/90'
                : 'bg-ats-accent/30 text-white/50 cursor-not-allowed'
            }`}
          >
            Update
          </button>
        </div>
      </div>

      {/* Timezone note */}
      <div className="text-[10px] text-ats-text-muted/60">
        Dates are shown in {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')}
      </div>
    </div>
  );
}
