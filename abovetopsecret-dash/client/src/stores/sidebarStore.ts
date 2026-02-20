import { create } from 'zustand';

const COLLAPSED_KEY = 'optic_sidebar_collapsed';

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  toggleMobileOpen: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: localStorage.getItem(COLLAPSED_KEY) === 'true',
  mobileOpen: false,

  toggleCollapsed: () =>
    set((s) => {
      const next = !s.collapsed;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return { collapsed: next };
    }),

  setCollapsed: (v: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, String(v));
    set({ collapsed: v });
  },

  setMobileOpen: (v: boolean) => set({ mobileOpen: v }),

  toggleMobileOpen: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}));
