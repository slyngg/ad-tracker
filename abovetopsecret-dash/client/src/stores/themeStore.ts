import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'optic_theme';

function getThemeCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)optic_theme=([^;]*)/);
  return match ? match[1] : null;
}

function setThemeCookie(value: string) {
  const domain = location.hostname.endsWith('optic-data.com') ? '; domain=.optic-data.com' : '';
  document.cookie = `optic_theme=${value}; path=/${domain}; max-age=31536000; SameSite=Lax`;
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getResolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemTheme() : mode;
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  // Update PWA theme-color to match
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#030712' : '#f8fafc');
}

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => {
  // Cookie is the cross-subdomain source of truth (shared between landing + app),
  // so it takes priority over localStorage which is per-origin
  const stored = (getThemeCookie() as ThemeMode) || (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system';
  const resolved = getResolvedTheme(stored);

  // Keep localStorage in sync with cookie
  localStorage.setItem(STORAGE_KEY, stored);

  // Apply on creation
  applyTheme(resolved);

  return {
    mode: stored,
    resolved,

    setMode: (mode: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, mode);
      setThemeCookie(mode);
      const resolved = getResolvedTheme(mode);
      applyTheme(resolved);
      set({ mode, resolved });
    },
  };
});

// Listen for OS theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { mode, setMode } = useThemeStore.getState();
    if (mode === 'system') {
      // Re-apply to pick up the new system preference
      setMode('system');
    }
  });
}
