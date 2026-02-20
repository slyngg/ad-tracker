import { useState, Component, ReactNode } from 'react';
import { useAuth } from './hooks/useAuth';
import Dashboard from './components/Dashboard';

// Error boundary to catch React rendering errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#030712',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}>
          <div style={{
            background: '#111827',
            borderRadius: 16,
            padding: 32,
            width: '100%',
            maxWidth: 400,
            margin: '0 16px',
            border: '1px solid #1f2937',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LoginScreen({ onLogin, error }: { onLogin: (token: string) => Promise<boolean>; error: string | null }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    await onLogin(token.trim());
    setLoading(false);
  };

  return (
    <div style={{
      background: '#030712',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: '#111827',
        borderRadius: 16,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        margin: '0 16px',
        border: '1px solid #1f2937',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: '#f9fafb' }}>
          <span style={{ color: '#3b82f6' }}>AboveTopSecret</span> Dash
        </h1>
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
          Enter your access token to continue
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#030712',
              border: '1px solid #374151',
              borderRadius: 8,
              color: '#f9fafb',
              fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
              marginBottom: 12,
            }}
          />
          {error && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            style={{
              width: '100%',
              padding: '12px',
              background: token.trim() ? '#3b82f6' : '#1f2937',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: token.trim() ? 'pointer' : 'default',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checking, error, login, handleUnauthorized } = useAuth();

  if (checking) {
    return (
      <div style={{
        background: '#030712',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6b7280',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
      }}>
        Connecting...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} error={error} />;
  }

  return (
    <ErrorBoundary>
      <Dashboard onUnauthorized={handleUnauthorized} />
    </ErrorBoundary>
  );
}
