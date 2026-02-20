import { useEffect, ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from './LoginPage';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, checking, checkDevMode } = useAuthStore();

  useEffect(() => {
    checkDevMode();
  }, [checkDevMode]);

  if (checking) {
    return (
      <div className="bg-ats-bg min-h-screen flex items-center justify-center text-ats-text-muted font-mono text-sm">
        Connecting...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <>{children}</>;
}
