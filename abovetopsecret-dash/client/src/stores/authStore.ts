import { create } from 'zustand';

const TOKEN_KEY = 'optic_auth_token';
const USER_KEY = 'optic_user';

interface User {
  id: number;
  email: string;
  displayName: string;
  onboardingCompleted: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  checking: boolean;
  error: string | null;
  register: (email: string, password: string, displayName: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: { displayName?: string; password?: string; currentPassword?: string }) => Promise<boolean>;
  checkAuth: () => Promise<void>;
  handleUnauthorized: () => void;
  markOnboardingComplete: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: (() => {
    try {
      const u = localStorage.getItem(USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  })(),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  checking: true,
  error: null,

  register: async (email: string, password: string, displayName: string) => {
    try {
      set({ error: null });
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Registration failed' });
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      set({ token: data.token, user: data.user, isAuthenticated: true, error: null });
      return true;
    } catch {
      set({ error: 'Server unreachable' });
      return false;
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ error: null });
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Login failed' });
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      set({ token: data.token, user: data.user, isAuthenticated: true, error: null });
      return true;
    } catch {
      set({ error: 'Server unreachable' });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false, error: null });
  },

  fetchProfile: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const user = { id: data.id, email: data.email, displayName: data.displayName, onboardingCompleted: data.onboardingCompleted ?? false };
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        set({ user });
      }
    } catch {
      // Silently fail
    }
  },

  updateProfile: async (data) => {
    const token = get().token;
    if (!token) return false;
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        set({ error: result.error || 'Update failed' });
        return false;
      }
      const existing = get().user;
      const user = { id: result.id, email: result.email, displayName: result.displayName, onboardingCompleted: existing?.onboardingCompleted ?? false };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user, error: null });
      return true;
    } catch {
      set({ error: 'Server unreachable' });
      return false;
    }
  },

  checkAuth: async () => {
    const token = get().token;
    if (token) {
      // Validate existing token
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const user = { id: data.id, email: data.email, displayName: data.displayName, onboardingCompleted: data.onboardingCompleted ?? false };
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          set({ user, isAuthenticated: true, checking: false });
          return;
        }
      } catch {
        // Token invalid or server down
      }
      // Try as legacy token
      try {
        const res = await fetch('/api/metrics/summary', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          set({ isAuthenticated: true, checking: false });
          return;
        }
      } catch {
        // Fall through
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      set({ token: null, user: null, isAuthenticated: false, checking: false });
      return;
    }
    // No token — check if dev mode (no auth required)
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
      // Server not reachable
    }
    set({ checking: false });
  },

  handleUnauthorized: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false });
  },

  markOnboardingComplete: () => {
    const user = get().user;
    if (user) {
      const updated = { ...user, onboardingCompleted: true };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      set({ user: updated });
    }
  },
}));

export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
