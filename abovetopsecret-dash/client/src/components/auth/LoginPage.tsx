import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const { error, login } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    await login(token.trim());
    setLoading(false);
  };

  return (
    <div className="bg-ats-bg min-h-screen flex items-center justify-center font-sans">
      <div className="bg-ats-card rounded-2xl p-8 w-full max-w-[400px] mx-4 border border-ats-border">
        <h1 className="text-2xl font-extrabold mb-1 text-ats-text">
          <span className="text-ats-accent">Optic</span>Data
        </h1>
        <p className="text-ats-text-muted text-sm mb-6">
          Enter your access token to continue
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Access token"
            autoFocus
            className="w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm font-mono outline-none focus:border-ats-accent mb-3"
          />
          {error && (
            <div className="text-ats-red text-xs mb-3">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className={`w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors ${
              token.trim()
                ? 'bg-ats-accent hover:bg-blue-600 cursor-pointer'
                : 'bg-ats-border cursor-default'
            } ${loading ? 'opacity-70' : ''}`}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
