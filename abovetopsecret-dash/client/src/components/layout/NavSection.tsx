import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NavSectionConfig } from '../../types/navigation';
import NavItem from './NavItem';

interface NavSectionProps {
  section: NavSectionConfig;
  collapsed: boolean;
}

export default function NavSection({ section, collapsed }: NavSectionProps) {
  const location = useLocation();

  const isChildActive = section.children?.some((c) => location.pathname === c.path) ?? false;
  const [open, setOpen] = useState(isChildActive);

  // Single link section (no children)
  if (section.path && !section.children) {
    return (
      <NavItem
        item={{ label: section.label, path: section.path, icon: section.icon }}
        collapsed={collapsed}
      />
    );
  }

  // Expandable section with children
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
          isChildActive
            ? 'text-ats-accent'
            : 'text-ats-text-muted hover:bg-ats-hover hover:text-ats-text-secondary'
        }`}
      >
        <span className="text-sm w-5 text-center flex-shrink-0">{section.icon}</span>
        {!collapsed && (
          <>
            <span className="truncate font-medium">{section.label}</span>
            <span className={`ml-auto text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>
              ▸
            </span>
          </>
        )}
      </button>
      {open && !collapsed && section.children && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-ats-border pl-2">
          {section.children.map((child) => (
            <NavItem key={child.path} item={child} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  );
}
