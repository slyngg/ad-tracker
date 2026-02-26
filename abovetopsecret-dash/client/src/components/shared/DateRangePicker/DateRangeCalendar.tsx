import { DayPicker, type DateRange } from 'react-day-picker';
import { startOfDay } from './presets';

interface DateRangeCalendarProps {
  range: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  isMobile: boolean;
}

export default function DateRangeCalendar({ range, onSelect, isMobile }: DateRangeCalendarProps) {
  const today = startOfDay(new Date());

  return (
    <div className="p-3 rdp-dark">
      <DayPicker
        mode="range"
        selected={range}
        onSelect={onSelect}
        numberOfMonths={isMobile ? 1 : 2}
        pagedNavigation
        captionLayout="dropdown"
        disabled={{ after: today }}
        today={today}
        startMonth={new Date(today.getFullYear() - 2, 0)}
        endMonth={today}
        classNames={{
          root: 'text-ats-text text-sm',
          months: 'flex gap-4',
          month_caption: 'flex justify-center items-center mb-2',
          caption_label: 'text-sm font-semibold text-ats-text',
          dropdowns: 'flex items-center gap-1',
          dropdown: 'bg-transparent text-ats-text text-sm font-semibold border-none outline-none cursor-pointer appearance-none',
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
