import { useState, useRef, useEffect, useCallback } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { ChevronDown } from 'lucide-react';

export interface DateRangeSelection {
  from: Date;
  to: Date;
  label: string;
  isToday: boolean;
}

interface DateRangePickerProps {
  value: DateRangeSelection;
  onChange: (range: DateRangeSelection) => void;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatLabel(from: Date, to: Date): string {
  const today = startOfDay(new Date());
  if (isSameDay(from, today) && isSameDay(to, today)) {
    return today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (isSameDay(from, to)) {
    return from.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const fromStr = from.toLocaleDateString('en-US', opts);
  const toStr = to.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${fromStr} – ${toStr}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

const PRESETS = [
  { label: 'Today', from: () => startOfDay(new Date()), to: () => startOfDay(new Date()), isToday: true },
  { label: 'Yesterday', from: () => daysAgo(1), to: () => daysAgo(1), isToday: false },
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => startOfDay(new Date()), isToday: false },
  { label: 'Last 14 days', from: () => daysAgo(13), to: () => startOfDay(new Date()), isToday: false },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => startOfDay(new Date()), isToday: false },
  { label: 'Last 90 days', from: () => daysAgo(89), to: () => startOfDay(new Date()), isToday: false },
];

export function getDefaultDateRange(): DateRangeSelection {
  const today = startOfDay(new Date());
  return {
    from: today,
    to: today,
    label: formatLabel(today, today),
    isToday: true,
  };
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({ from: value.from, to: value.to });
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
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

  // Sync internal range when external value changes
  useEffect(() => {
    setRange({ from: value.from, to: value.to });
  }, [value.from, value.to]);

  const applyRange = useCallback((from: Date, to: Date, isToday: boolean) => {
    const label = formatLabel(from, to);
    onChange({ from, to, label, isToday });
    setOpen(false);
  }, [onChange]);

  const handleSelect = useCallback((selected: DateRange | undefined) => {
    setRange(selected);
    if (selected?.from && selected?.to) {
      const isToday = isSameDay(selected.from, startOfDay(new Date())) && isSameDay(selected.to, startOfDay(new Date()));
      applyRange(selected.from, selected.to, isToday);
    }
  }, [applyRange]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs sm:text-sm text-ats-text-muted hover:text-ats-text transition-colors cursor-pointer group"
      >
        <span>{value.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''} text-ats-text-muted group-hover:text-ats-text`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-ats-card border border-ats-border rounded-xl shadow-2xl shadow-black/40 flex flex-col sm:flex-row">
          {/* Presets */}
          <div className="flex sm:flex-col gap-1 p-3 border-b sm:border-b-0 sm:border-r border-ats-border sm:min-w-[140px] overflow-x-auto sm:overflow-x-visible">
            {PRESETS.map((p) => {
              const pFrom = p.from();
              const pTo = p.to();
              const active = isSameDay(value.from, pFrom) && isSameDay(value.to, pTo);
              return (
                <button
                  key={p.label}
                  onClick={() => {
                    setRange({ from: pFrom, to: pTo });
                    applyRange(pFrom, pTo, p.isToday);
                  }}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? 'bg-ats-accent text-white'
                      : 'text-ats-text-muted hover:text-ats-text hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendar */}
          <div className="p-3 rdp-dark">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={handleSelect}
              numberOfMonths={1}
              disabled={{ after: new Date() }}
              classNames={{
                root: 'text-ats-text text-sm',
                months: 'flex gap-4',
                month_caption: 'flex justify-center items-center mb-2',
                caption_label: 'text-sm font-semibold text-ats-text',
                nav: 'flex items-center justify-between absolute top-3 left-3 right-3',
                button_previous: 'p-1 rounded hover:bg-white/10 text-ats-text-muted hover:text-ats-text transition-colors',
                button_next: 'p-1 rounded hover:bg-white/10 text-ats-text-muted hover:text-ats-text transition-colors',
                weekdays: 'flex',
                weekday: 'w-9 text-center text-[10px] font-medium text-ats-text-muted uppercase',
                week: 'flex',
                day: 'w-9 h-9 text-center text-sm',
                day_button: 'w-full h-full rounded-md hover:bg-white/10 transition-colors flex items-center justify-center',
                selected: 'bg-ats-accent text-white font-semibold',
                range_start: 'bg-ats-accent text-white rounded-l-md',
                range_end: 'bg-ats-accent text-white rounded-r-md',
                range_middle: 'bg-ats-accent/20 text-ats-text',
                today: 'font-bold text-ats-accent',
                outside: 'text-ats-text-muted/30',
                disabled: 'text-ats-text-muted/20 cursor-not-allowed',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
