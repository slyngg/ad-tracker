import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, LogOut, Bell } from 'lucide-react';
import { useSidebarStore } from '../../stores/sidebarStore';
import { useAuthStore } from '../../stores/authStore';
import { NAV_SECTIONS } from '../../lib/routes';
import NavSection from './NavSection';

export default function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebarStore();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread notification count
  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/notifications/unread-count', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch { /* ignore */ }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000);
    return () => clearInterval(interval);
  }, []);

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
          className="text-ats-text-muted hover:text-ats-text p-1.5 rounded-md hover:bg-ats-hover transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Notification bell */}
      <div className="px-3 py-2 border-b border-ats-border">
        <a
          href="/settings/notifications"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ats-text-secondary hover:bg-ats-hover hover:text-ats-text transition-colors relative"
        >
          <Bell size={16} className="flex-shrink-0" />
          {!collapsed && <span>Notifications</span>}
          {unreadCount > 0 && (
            <span className="absolute top-1 left-6 min-w-[16px] h-4 bg-ats-red text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </a>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV_SECTIONS.map((section) => (
          <NavSection key={section.label} section={section} collapsed={collapsed} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-ats-border">
        {!collapsed && user && (
          <div className="px-3 py-1 mb-2 text-xs text-ats-text-muted truncate">
            {user.displayName || user.email}
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ats-text-muted hover:bg-ats-hover hover:text-ats-red transition-colors"
        >
          <LogOut size={16} className="flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <aside
      className={`hidden lg:flex flex-col fixed top-0 left-0 bottom-0 bg-ats-card border-r border-ats-border z-30 transition-all duration-200 ${
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
      }`}
    >
      {sidebarContent}
    </aside>
  );
}
