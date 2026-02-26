import { useState, useEffect } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { startOfDay } from './presets';

interface DateRangeCalendarProps {
  range: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  isMobile: boolean;
}

export default function DateRangeCalendar({ range, onSelect, isMobile }: DateRangeCalendarProps) {
  const today = startOfDay(new Date());
  const numMonths = isMobile ? 1 : 2;

  // Controlled month: show the range's "to" month on the right panel
  const [month, setMonth] = useState<Date>(() => {
    const anchor = range?.to ?? range?.from ?? today;
    if (numMonths === 2) {
      return new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    }
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // When range changes (preset click), navigate calendar to show the range
  useEffect(() => {
    const anchor = range?.to ?? range?.from ?? today;
    if (numMonths === 2) {
      setMonth(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1));
    } else {
      setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
  }, [range?.from?.getTime(), range?.to?.getTime(), numMonths]);

  return (
    <div className="p-3 rdp-dark">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={onSelect}
        numberOfMonths={numMonths}
        pagedNavigation
        month={month}
        onMonthChange={setMonth}
        captionLayout="dropdown"
        disabled={{ after: today }}
        today={today}
        startMonth={new Date(today.getFullYear() - 2, 0)}
        endMonth={today}
        classNames={{
          root: 'text-ats-text text-sm',
          months: 'flex gap-4',
          month_caption: 'flex justify-center items-center mb-2',
          caption_label: 'hidden',
          dropdowns: 'flex items-center gap-2',
          dropdown: 'bg-transparent text-ats-text text-sm font-semibold border-none outline-none cursor-pointer',
          dropdown_root: 'relative',
          nav: 'flex items-center justify-between absolute top-3 left-3 right-3',
          button_previous:
            'p-1 rounded hover:bg-white/10 text-ats-text-muted hover:text-ats-text transition-colors',
          button_next:
            'p-1 rounded hover:bg-white/10 text-ats-text-muted hover:text-ats-text transition-colors',
          weekdays: 'flex',
          weekday: 'w-9 text-center text-[10px] font-medium text-ats-text-muted uppercase',
          week: 'flex',
          day: 'w-9 h-9 text-center text-sm',
          day_button:
            'w-full h-full rounded-md hover:bg-white/10 transition-colors flex items-center justify-center',
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
  );
}
