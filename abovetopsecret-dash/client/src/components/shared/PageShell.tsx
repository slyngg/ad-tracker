import { ReactNode } from 'react';
import DateRangePicker from './DateRangePicker';
import { useDateRangeStore } from '../../stores/dateRangeStore';

interface PageShellProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  hideHeaderOnMobile?: boolean;
  compactMobile?: boolean;
  showDatePicker?: boolean;
}

export default function PageShell({ title, subtitle, actions, children, hideHeaderOnMobile, compactMobile, showDatePicker }: PageShellProps) {
  const dateRange = useDateRangeStore((s) => s.dateRange);
  const setDateRange = useDateRangeStore((s) => s.setDateRange);

  return (
    <div className={`${compactMobile ? 'p-0 lg:p-6' : 'px-3 py-3 sm:p-4 lg:p-6'} max-w-[1400px] mx-auto`}>
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-6 ${hideHeaderOnMobile ? 'hidden lg:flex' : ''}`}>
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-ats-text truncate">{title}</h1>
          {showDatePicker ? (
            <div className="flex items-center gap-2 mt-0.5">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              {subtitle && <span className="text-xs sm:text-sm text-ats-text-muted">{subtitle}</span>}
            </div>
          ) : (
            subtitle && <div className="text-xs sm:text-sm text-ats-text-muted mt-0.5">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
