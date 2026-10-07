import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy px-4 py-8">
      <div className="grid min-h-[620px] w-full max-w-5xl overflow-hidden rounded-[28px] bg-[#F3F5FA] shadow-2xl md:grid-cols-[0.92fr_1.08fr]">
        <div className="flex flex-col items-center justify-center bg-gradient-to-b from-navy to-navy-deep px-6 py-10 text-center md:items-start md:px-12 md:text-left">
          <img
            src="/brand/rescuewave-logo.png"
            alt="RescueWave"
            className="w-[220px] rounded-2xl object-contain shadow-2xl md:w-[300px]"
          />
          <h1 className="mt-8 font-display text-[25px] font-bold text-white md:text-4xl">Welcome back</h1>
          <p className="mt-2 max-w-sm text-[13px] leading-5 text-white/75 md:text-base md:leading-7">
            Sign in to continue to your admin dashboard.
          </p>
        </div>

        <div className="flex flex-col justify-center px-6 py-8 md:px-14">
          <form onSubmit={onSubmit} className="w-full">
            <label className="mb-1.5 block text-xs font-medium text-[#64748B]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              placeholder="admin@rescuewave.app"
              autoComplete="email"
            />
            <label className="mb-1.5 block text-xs font-medium text-[#64748B]">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy/30"
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {error ? <p className="mb-4 text-xs font-medium text-crimson">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-navy py-3 font-display text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Log In'}
            </button>
          </form>

          <div className="mt-5 rounded-2xl bg-gold-mist p-4">
            <p className="font-display text-sm font-semibold text-[#8A6514]">Admin access required</p>
            <p className="mt-1 text-xs leading-5 text-[#8A6514]">
              Log in with a RescueWave account that has admin access. First admin? Run{' '}
              <code className="font-semibold">node src/admin-cli.js make-admin &lt;email&gt;</code> on the backend.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
