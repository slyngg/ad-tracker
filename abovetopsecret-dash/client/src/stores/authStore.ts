import { create } from 'zustand';

const TOKEN_KEY = 'optic_auth_token';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  checking: boolean;
  error: string | null;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  checkDevMode: () => Promise<void>;
  handleUnauthorized: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  checking: true,
  error: null,

  login: async (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token });
    try {
      const res = await fetch('/api/metrics/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null, isAuthenticated: false, error: 'Invalid token' });
        return false;
      }
      set({ isAuthenticated: true, error: null });
      return true;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, isAuthenticated: false, error: 'Server unreachable' });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, isAuthenticated: false, error: null });
  },

  checkDevMode: async () => {
    if (get().token) {
      set({ checking: false });
      return;
    }
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const metricsRes = await fetch('/api/metrics/summary');
        if (metricsRes.ok) {
          set({ isAuthenticated: true, checking: false });
          return;
        }
      }
    } catch {
      // Server not reachable, fall through to login
    }
    set({ checking: false });
  },

  handleUnauthorized: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, isAuthenticated: false });
  },
}));

export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
