import { useState, useCallback, useEffect } from 'react';
import { setToken, getToken } from '../lib/api';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!getToken());
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // On mount, check if auth is required (dev mode detection)
  useEffect(() => {
    async function checkDevMode() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          // Health endpoint works, now check if auth is needed
          const metricsRes = await fetch('/api/metrics/summary');
          if (metricsRes.ok) {
            // No auth required — dev mode
            setIsAuthenticated(true);
            setChecking(false);
            return;
          }
        }
      } catch {
        // Server not reachable yet, fall through to login
      }
      setChecking(false);
    }
    if (!getToken()) {
      checkDevMode();
    } else {
      setChecking(false);
    }
  }, []);

  const login = useCallback(async (token: string) => {
    setToken(token);
    try {
      const res = await fetch('/api/metrics/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setToken(null);
        setError('Invalid token');
        setIsAuthenticated(false);
        return false;
      }
      setError(null);
      setIsAuthenticated(true);
      return true;
    } catch {
      // If server is unreachable but token was provided, still try
      setError(null);
      setIsAuthenticated(true);
      return true;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setIsAuthenticated(false);
    setError(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    setToken(null);
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, checking, error, login, logout, handleUnauthorized };
}
