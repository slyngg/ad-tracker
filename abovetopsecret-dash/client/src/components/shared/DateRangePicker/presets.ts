export interface DateRangeSelection {
  from: Date;
  to: Date;
  label: string;
  isToday: boolean;
  presetId?: string;
}

export interface PresetDef {
  id: string;
  label: string;
  from: () => Date;
  to: () => Date;
  isToday: boolean;
}

// ── Date helpers ──────────────────────────────────────────────

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - day);
  return startOfDay(r);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// ── Format helpers ────────────────────────────────────────────

const SHORT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
const SHORT_YEAR: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

export function formatTriggerLabel(sel: DateRangeSelection): string {
  if (sel.presetId && sel.presetId !== 'custom') {
    const preset = PRESETS.find((p) => p.id === sel.presetId);
    if (preset) {
      const rangeStr = isSameDay(sel.from, sel.to)
        ? sel.from.toLocaleDateString('en-US', SHORT_YEAR)
        : `${sel.from.toLocaleDateString('en-US', SHORT)} – ${sel.to.toLocaleDateString('en-US', SHORT_YEAR)}`;
      return `${preset.label}: ${rangeStr}`;
    }
  }
  if (isSameDay(sel.from, sel.to)) {
    return sel.from.toLocaleDateString('en-US', SHORT_YEAR);
  }
  return `${sel.from.toLocaleDateString('en-US', SHORT)} – ${sel.to.toLocaleDateString('en-US', SHORT_YEAR)}`;
}

export function formatDateInput(d: Date): string {
  return d.toLocaleDateString('en-US', SHORT_YEAR);
}

export function parseDateInput(str: string): Date | null {
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return startOfDay(d);
}

export function formatLabel(from: Date, to: Date): string {
  const today = startOfDay(new Date());
  if (isSameDay(from, today) && isSameDay(to, today)) {
    return today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  if (isSameDay(from, to)) {
    return from.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const fromStr = from.toLocaleDateString('en-US', SHORT);
  const toStr = to.toLocaleDateString('en-US', SHORT_YEAR);
  return `${fromStr} – ${toStr}`;
}

// ── Presets ───────────────────────────────────────────────────

export const PRESETS: PresetDef[] = [
  { id: 'today', label: 'Today', from: () => startOfDay(new Date()), to: () => startOfDay(new Date()), isToday: true },
  { id: 'yesterday', label: 'Yesterday', from: () => daysAgo(1), to: () => daysAgo(1), isToday: false },
  { id: 'today_yesterday', label: 'Today and yesterday', from: () => daysAgo(1), to: () => startOfDay(new Date()), isToday: false },
  { id: 'last_7', label: 'Last 7 days', from: () => daysAgo(6), to: () => startOfDay(new Date()), isToday: false },
  { id: 'last_14', label: 'Last 14 days', from: () => daysAgo(13), to: () => startOfDay(new Date()), isToday: false },
  { id: 'last_28', label: 'Last 28 days', from: () => daysAgo(27), to: () => startOfDay(new Date()), isToday: false },
  { id: 'last_30', label: 'Last 30 days', from: () => daysAgo(29), to: () => startOfDay(new Date()), isToday: false },
  { id: 'last_90', label: 'Last 90 days', from: () => daysAgo(89), to: () => startOfDay(new Date()), isToday: false },
  { id: 'this_week', label: 'This week', from: () => startOfWeek(new Date()), to: () => startOfDay(new Date()), isToday: false },
  {
    id: 'last_week',
    label: 'Last week',
    from: () => { const s = startOfWeek(new Date()); s.setDate(s.getDate() - 7); return s; },
    to: () => { const s = startOfWeek(new Date()); s.setDate(s.getDate() - 1); return s; },
    isToday: false,
  },
  { id: 'this_month', label: 'This month', from: () => startOfMonth(new Date()), to: () => startOfDay(new Date()), isToday: false },
  {
    id: 'last_month',
    label: 'Last month',
    from: () => { const d = new Date(); return startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)); },
    to: () => { const d = new Date(); return endOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)); },
    isToday: false,
  },
];

export function matchPreset(from: Date, to: Date): PresetDef | undefined {
  return PRESETS.find((p) => isSameDay(p.from(), from) && isSameDay(p.to(), to));
}

export function getDefaultDateRange(): DateRangeSelection {
  const today = startOfDay(new Date());
  return {
    from: today,
    to: today,
    label: formatLabel(today, today),
    isToday: true,
    presetId: 'today',
  };
}
