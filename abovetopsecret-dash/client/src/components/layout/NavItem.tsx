import { NavLink as RouterNavLink } from 'react-router-dom';
import { NavLink } from '../../types/navigation';

interface NavItemProps {
  item: NavLink;
  collapsed: boolean;
}

export default function NavItem({ item, collapsed }: NavItemProps) {
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        className="group flex items-center gap-3 px-3 py-2 rounded-lg text-ats-text-muted/50 cursor-not-allowed"
        title="Coming Soon"
      >
        <Icon size={16} className="flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="text-sm truncate">{item.label}</span>
            <span className="ml-auto text-[10px] bg-ats-border/50 text-ats-text-muted px-1.5 py-0.5 rounded">
              Soon
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <RouterNavLink
      to={item.path}
      data-tour={item.tourId}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm relative ${
          isActive
            ? 'bg-ats-accent/10 text-ats-accent font-semibold'
            : 'text-ats-text-secondary hover:bg-ats-hover hover:text-ats-text'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-ats-accent rounded-r" />
          )}
          <Icon size={16} className="flex-shrink-0" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </RouterNavLink>
  );
}
