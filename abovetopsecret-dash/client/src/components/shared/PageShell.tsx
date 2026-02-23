import { ReactNode } from 'react';

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  hideHeaderOnMobile?: boolean;
  compactMobile?: boolean;
}

export default function PageShell({ title, subtitle, actions, children, hideHeaderOnMobile, compactMobile }: PageShellProps) {
  return (
    <div className={`${compactMobile ? 'p-0 lg:p-6' : 'px-3 py-3 sm:p-4 lg:p-6'} max-w-[1400px] mx-auto`}>
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-6 ${hideHeaderOnMobile ? 'hidden lg:flex' : ''}`}>
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold text-ats-text truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-ats-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
