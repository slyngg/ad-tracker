import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import DateRangePresets from './DateRangePresets';
import DateRangeCalendar from './DateRangeCalendar';
import DateRangeBottomBar from './DateRangeBottomBar';
import {
  type DateRangeSelection,
  type PresetDef,
  formatTriggerLabel,
  formatLabel,
  matchPreset,
  isSameDay,
  startOfDay,
} from './presets';

interface DateRangePickerProps {
  value: DateRangeSelection;
  onChange: (range: DateRangeSelection) => void;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 640px)');

  // ── Pending state (local until Update is clicked) ──────────
  const [pendingFrom, setPendingFrom] = useState(value.from);
  const [pendingTo, setPendingTo] = useState(value.to);
  const [pendingPresetId, setPendingPresetId] = useState<string | undefined>(value.presetId);

  // Reset pending state when popover opens
  useEffect(() => {
    if (open) {
      setPendingFrom(value.from);
      setPendingTo(value.to);
      setPendingPresetId(value.presetId);
    }
  }, [open, value.from, value.to, value.presetId]);

  // Close on click outside = cancel
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // ── Derived state ──────────────────────────────────────────
  const pendingRange: DateRange | undefined = useMemo(
    () => ({ from: pendingFrom, to: pendingTo }),
    [pendingFrom, pendingTo],
  );

  const activePreset = useMemo(
    () => matchPreset(pendingFrom, pendingTo),
    [pendingFrom, pendingTo],
  );

  const hasChanges = useMemo(
    () => !isSameDay(pendingFrom, value.from) || !isSameDay(pendingTo, value.to),
    [pendingFrom, pendingTo, value.from, value.to],
  );

  // ── Handlers ───────────────────────────────────────────────
  const handlePresetSelect = useCallback((preset: PresetDef) => {
    const from = preset.from();
    const to = preset.to();
    setPendingFrom(from);
    setPendingTo(to);
    setPendingPresetId(preset.id);
  }, []);

  const handleCalendarSelect = useCallback((selected: DateRange | undefined) => {
    if (selected?.from) {
      setPendingFrom(selected.from);
      setPendingTo(selected.to ?? selected.from);
      // Check if the selection matches a preset
      const matched = matchPreset(selected.from, selected.to ?? selected.from);
      setPendingPresetId(matched?.id);
    }
  }, []);

  const handleDateInputChange = useCallback((from: Date, to: Date) => {
    setPendingFrom(from);
    setPendingTo(to);
    const matched = matchPreset(from, to);
    setPendingPresetId(matched?.id);
  }, []);

  const handleUpdate = useCallback(() => {
    const label = formatLabel(pendingFrom, pendingTo);
    const today = startOfDay(new Date());
    const isToday = isSameDay(pendingFrom, today) && isSameDay(pendingTo, today);
    onChange({
      from: pendingFrom,
      to: pendingTo,
      label,
      isToday,
      presetId: pendingPresetId,
    });
    setOpen(false);
  }, [pendingFrom, pendingTo, pendingPresetId, onChange]);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  // ── Render ─────────────────────────────────────────────────
  const triggerLabel = formatTriggerLabel(value);

  return (
    <div ref={ref} className="relative inline-block">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-ats-text bg-ats-card border border-ats-border hover:border-ats-accent transition-colors cursor-pointer group"
      >
        <CalendarDays size={14} className="text-ats-text-muted group-hover:text-ats-text transition-colors shrink-0" />
        <span className="truncate max-w-[220px] sm:max-w-none">{triggerLabel}</span>
        <ChevronDown
          size={12}
          className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''} text-ats-text-muted group-hover:text-ats-text`}
        />
      </button>

      {/* Popover */}
      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 bg-ats-card border border-ats-border rounded-xl shadow-2xl shadow-black/40 flex flex-col max-w-[calc(100vw-2rem)]"
        >
          <div className="flex flex-col sm:flex-row">
            {/* Preset sidebar */}
            <DateRangePresets
              selectedPresetId={pendingPresetId}
              onSelect={handlePresetSelect}
              isMobile={!isDesktop}
            />

            {/* Calendar */}
            <DateRangeCalendar
              range={pendingRange}
              onSelect={handleCalendarSelect}
              isMobile={!isDesktop}
            />
          </div>

          {/* Bottom bar */}
          <DateRangeBottomBar
            from={pendingFrom}
            to={pendingTo}
            activePreset={activePreset}
            onDateChange={handleDateInputChange}
            onCancel={handleCancel}
            onUpdate={handleUpdate}
            hasChanges={hasChanges}
          />

          {/* Compare placeholder (deferred) */}
          {/* TODO: Compare date range feature */}
        </div>
      )}
    </div>
  );
}
