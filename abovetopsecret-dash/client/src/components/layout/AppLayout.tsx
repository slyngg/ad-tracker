import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSidebarStore } from '../../stores/sidebarStore';
import Sidebar from './Sidebar';
import CommandPalette from '../shared/CommandPalette';

export default function AppLayout() {
  const { collapsed, toggleMobileOpen } = useSidebarStore();

  return (
    <div className="min-h-screen bg-ats-bg">
      <Sidebar />
      <CommandPalette />

      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-12 bg-ats-card border-b border-ats-border z-20 flex items-center px-4 gap-3">
        <button
          onClick={toggleMobileOpen}
          className="text-ats-text-muted hover:text-ats-text p-1"
        >
          <Menu size={18} />
        </button>
        <span className="text-ats-accent font-bold text-sm">Optic</span>
        <span className="text-ats-text font-bold text-sm">Data</span>
      </div>

      {/* Main content */}
      <main
        className={`transition-all duration-200 min-h-screen pt-12 lg:pt-0 ${
          collapsed ? 'lg:ml-sidebar-collapsed' : 'lg:ml-sidebar'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
