import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, Megaphone, PenTool, MoreHorizontal } from 'lucide-react';
import MobileMoreSheet from './MobileMoreSheet';

interface Tab {
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  /** Match any route starting with this prefix for active state */
  matchPrefix?: string;
}

const TABS: Tab[] = [
  { label: 'Summary', icon: LayoutDashboard, path: '/summary' },
  { label: 'Operator', icon: Bot, path: '/operator' },
  { label: 'Campaigns', icon: Megaphone, path: '/campaigns', matchPrefix: '/campaigns' },
  { label: 'Creative', icon: PenTool, path: '/creative/analytics', matchPrefix: '/creative' },
];

export default function MobileBottomBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Hide bottom bar when virtual keyboard opens (mobile browsers)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const check = () => {
      // If the visual viewport height is significantly smaller than window height,
      // the virtual keyboard is likely open
      const threshold = window.innerHeight * 0.75;
      setKeyboardOpen(vv.height < threshold);
    };

    vv.addEventListener('resize', check);
    return () => vv.removeEventListener('resize', check);
  }, []);

  if (keyboardOpen) return null;

  const isTabActive = (tab: Tab) => {
    if (tab.matchPrefix) return location.pathname.startsWith(tab.matchPrefix);
    return location.pathname === tab.path;
  };

  const isMoreActive =
    !TABS.some((t) => isTabActive(t)) && location.pathname !== '/';

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-ats-card border-t border-ats-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-stretch h-bottom-bar">
          {TABS.map((tab) => {
            const active = isTabActive(tab);
            return (
              <button
                key={tab.label}
                onClick={() => navigate(tab.path)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative ${
                  active ? 'text-ats-accent' : 'text-ats-text-muted'
                }`}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-ats-accent rounded-full" />
                )}
                <tab.icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          {/* More tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors relative ${
              isMoreActive || moreOpen ? 'text-ats-accent' : 'text-ats-text-muted'
            }`}
          >
            {(isMoreActive || moreOpen) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-ats-accent rounded-full" />
            )}
            <MoreHorizontal size={20} strokeWidth={isMoreActive || moreOpen ? 2.2 : 1.8} />
            <span>More</span>
          </button>
        </div>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
