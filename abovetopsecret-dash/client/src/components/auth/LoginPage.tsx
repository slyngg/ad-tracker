import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { error, login, register } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    if (isRegister) {
      await register(email.trim(), password, displayName.trim(), accessCode);
    } else {
      await login(email.trim(), password);
    }
    setLoading(false);
  };

  return (
    <div className="bg-ats-bg min-h-screen flex items-center justify-center font-sans">
      <div className="bg-ats-card rounded-2xl p-8 w-full max-w-[400px] mx-4 border border-ats-border">
        <h1 className="text-2xl font-extrabold mb-1 text-ats-text">
          <span className="text-ats-accent">Optic</span>Data
        </h1>
        <p className="text-ats-text-muted text-sm mb-6">
          {isRegister ? 'Create your account' : 'Sign in to your account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoFocus
            className="w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent"
          />
          {isRegister && (
            <input
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Access code"
              className="w-full px-4 py-3 bg-ats-bg border border-ats-border rounded-lg text-ats-text text-sm outline-none focus:border-ats-accent"
            />
          )}
          {error && (
            <div className="text-ats-red text-xs">{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className={`w-full py-3 rounded-lg text-white text-sm font-semibold transition-colors ${
              email.trim() && password.trim()
                ? 'bg-ats-accent hover:bg-blue-600 cursor-pointer'
                : 'bg-ats-border cursor-default'
            } ${loading ? 'opacity-70' : ''}`}
          >
            {loading ? (isRegister ? 'Creating account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsRegister(!isRegister); useAuthStore.setState({ error: null }); }}
            className="text-ats-accent text-sm hover:underline"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}
