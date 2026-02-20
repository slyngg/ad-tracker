import { useEffect } from 'react';
import { useSidebarStore } from '../../stores/sidebarStore';
import { useAuthStore } from '../../stores/authStore';
import { NAV_SECTIONS } from '../../lib/routes';
import NavSection from './NavSection';

export default function Sidebar() {
  const { collapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useSidebarStore();
  const logout = useAuthStore((s) => s.logout);

  // Close mobile sidebar on route change via popstate
  useEffect(() => {
    const close = () => setMobileOpen(false);
    window.addEventListener('popstate', close);
    return () => window.removeEventListener('popstate', close);
  }, [setMobileOpen]);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-ats-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <span className="text-ats-accent font-bold text-lg tracking-tight">Optic</span>
            <span className="text-ats-text font-bold text-lg tracking-tight">Data</span>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="text-ats-text-muted hover:text-ats-text p-1.5 rounded-md hover:bg-ats-hover transition-colors hidden lg:block"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '▸▸' : '◂◂'}
        </button>
        {/* Mobile close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="text-ats-text-muted hover:text-ats-text p-1.5 rounded-md hover:bg-ats-hover transition-colors lg:hidden"
        >
          ✕
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV_SECTIONS.map((section) => (
          <NavSection key={section.label} section={section} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-ats-border">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover hover:text-ats-red transition-colors"
        >
          <span className="text-sm w-5 text-center flex-shrink-0">🚪</span>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 bg-ats-card border-r border-ats-border z-30 transition-all duration-200 ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-[280px] bg-ats-card border-r border-ats-border z-50 transform transition-transform duration-200 lg:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
