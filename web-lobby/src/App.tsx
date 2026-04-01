// web-lobby/src/App.tsx
// P2-3: ProtectedRoute — prüft Supabase Session + lobby_accounts Status

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login';
import RegisterPage from './pages/register';
import SuccessPage from './pages/success';
import DashboardPage from './pages/dashboard';
import SettingsPage from './pages/settings';
import { supabase } from './lib/supabase';

// Spec: Alle Routen außer /login und /register hinter ProtectedRoute
// Prüft: Supabase Session + lobby_accounts.subscription_status
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'redirect'>('loading');

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus('redirect');
        return;
      }

      // Prüfe lobby_accounts Status
      const { data: la } = await supabase
        .from('lobby_accounts')
        .select('subscription_status')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const validStatuses = ['active', 'trialing', 'subsidized_active'];
      if (!la || !validStatuses.includes(la.subscription_status)) {
        // Kein aktives Abo → Redirect zu /login
        await supabase.auth.signOut();
        setStatus('redirect');
        return;
      }

      setStatus('ok');
    } catch {
      setStatus('redirect');
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Laden...</div>
      </div>
    );
  }

  if (status === 'redirect') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Öffentliche Routen */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/success" element={<SuccessPage />} />

        {/* Geschützte Routen — Session + lobby_accounts Pflicht */}
        <Route path="/dashboard" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><SettingsPage /></ProtectedRoute>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
