import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'optic_theme';

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
  const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode) || 'system';
  const resolved = getResolvedTheme(stored);

  // Apply on creation
  applyTheme(resolved);

  return {
    mode: stored,
    resolved,

    setMode: (mode: ThemeMode) => {
      localStorage.setItem(STORAGE_KEY, mode);
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
