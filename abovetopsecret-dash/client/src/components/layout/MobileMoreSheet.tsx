import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Search } from 'lucide-react';
import { NAV_SECTIONS } from '../../lib/routes';

// Sections surfaced by the bottom tab bar — excluded from the "More" sheet
const TAB_BAR_LABELS = new Set(['Summary', 'Operator', 'Campaign Manager', 'Creative']);

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState('');

  // Reset filter when sheet opens
  useEffect(() => {
    if (open) setFilter('');
  }, [open]);

  // Close on route change
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  if (!open) return null;

  const remaining = NAV_SECTIONS.filter((s) => !TAB_BAR_LABELS.has(s.label));

  const lowerFilter = filter.toLowerCase();
  const filtered = remaining
    .map((section) => {
      const sectionMatches = section.label.toLowerCase().includes(lowerFilter);
      if (!section.children) {
        return sectionMatches ? section : null;
      }
      const matchedChildren = sectionMatches
        ? section.children
        : section.children.filter((c) => c.label.toLowerCase().includes(lowerFilter));
      if (matchedChildren.length === 0) return null;
      return { ...section, children: matchedChildren };
    })
    .filter(Boolean) as typeof remaining;

  const handleNav = (path: string) => {
    navigate(path);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-[60] lg:hidden" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[61] lg:hidden bg-ats-card border-t border-ats-border rounded-t-2xl overflow-hidden flex flex-col"
        style={{
          maxHeight: 'calc(100dvh - 48px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ats-border shrink-0">
          <span className="text-sm font-bold text-ats-text">More</span>
          <button
            onClick={onClose}
            className="p-1.5 text-ats-text-muted hover:text-ats-text rounded-md hover:bg-ats-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-ats-border shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ats-text-muted" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search sections..."
              className="w-full pl-8 pr-3 py-2 bg-ats-bg border border-ats-border rounded-lg text-sm text-ats-text placeholder:text-ats-text-muted outline-none focus:border-ats-accent"
            />
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {filtered.map((section) => (
            <div key={section.label}>
              {/* Section header — clickable if it has a direct path */}
              {section.path ? (
                <button
                  onClick={() => handleNav(section.path!)}
                  className="flex items-center gap-2 mb-2 text-sm font-semibold text-ats-text hover:text-ats-accent transition-colors w-full text-left"
                >
                  <section.icon size={16} className="text-ats-text-muted" />
                  {section.label}
                </button>
              ) : (
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-ats-text-muted uppercase tracking-wider">
                  <section.icon size={14} />
                  {section.label}
                </div>
              )}

              {/* Children grid */}
              {section.children && (
                <div className="grid grid-cols-2 gap-1.5">
                  {section.children.map((child) => (
                    <button
                      key={child.path}
                      onClick={() => handleNav(child.path)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-ats-text-secondary hover:bg-ats-hover hover:text-ats-text transition-colors text-left"
                    >
                      <child.icon size={14} className="text-ats-text-muted shrink-0" />
                      <span className="truncate">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center text-sm text-ats-text-muted py-8">
              No sections match "{filter}"
            </div>
          )}
        </div>
      </div>
    </>
  );
}
