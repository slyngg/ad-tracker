import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useSidebarStore } from '../../stores/sidebarStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import Sidebar from './Sidebar';
import CommandPalette from '../shared/CommandPalette';
import AccountSwitcher from '../shared/AccountSwitcher';
import TourOverlay from '../tour/TourOverlay';
import ConnectionBanner from '../shared/ConnectionBanner';
import SyncBanner from '../shared/SyncBanner';

function ConnectionStatus() {
  const { status } = useWebSocket();

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 text-xs sm:text-[10px] text-ats-text-muted">
        <span className="w-1.5 h-1.5 rounded-full bg-ats-green animate-pulse" />
        Live
      </div>
    );
  }

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-1.5 text-xs sm:text-[10px] text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-[10px] text-ats-text-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-ats-text-muted" />
      Offline
    </div>
  );
}

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
        <div className="ml-auto flex items-center gap-2">
          <AccountSwitcher />
          <ConnectionStatus />
        </div>
      </div>

      {/* Main content */}
      <main
        className={`transition-all duration-200 min-h-screen pt-12 lg:pt-0 ${
          collapsed ? 'lg:ml-sidebar-collapsed' : 'lg:ml-sidebar'
        }`}
      >
        <SyncBanner />
        <ConnectionBanner />
        <Outlet />
      </main>

      <TourOverlay />
    </div>
  );
}
