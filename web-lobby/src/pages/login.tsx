import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, getSession } from '../lib/supabase';

// Spec: Disclaimer immer sichtbar
function Disclaimer() {
  return (
    <div className="w-full bg-[#1A1A2E] text-[#D4AF37] text-center text-xs font-medium py-3 px-4">
      Kein Stimmvorteil – nur Analyse-Tools
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(({ data }) => {
      if (data.session) navigate('/dashboard');
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    setError(null);

    const { error: authErr } = await signIn(email, password);
    if (authErr) {
      setError('Ungültige E-Mail oder Passwort.');
      setIsLoading(false);
      return;
    }
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Disclaimer />
      <div className="flex items-center justify-center p-4 min-h-[calc(100vh-40px)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white tracking-tight">#RAWLZ</h1>
          <p className="text-amber-400 mt-1 font-medium">Lobby Dashboard</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-6"
        >
          <h2 className="text-xl font-bold text-white">Anmelden</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="name@organisation.de"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Anmelden...' : 'Anmelden'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Noch kein Konto?{' '}
            <a href="/register" className="text-amber-400 hover:text-amber-300 transition-colors">
              Jetzt registrieren
            </a>
          </p>
        </form>
      </div>
      </div>
    </div>
  );
}
