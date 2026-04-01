// web-lobby/src/pages/settings.tsx
// Spec: Company Profile | Subscription-Status | Passwort ändern

import React, { useState, useEffect } from 'react';
import { supabase, getAccessToken } from '../lib/supabase';

const FN_BASE = '/functions/v1';

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: la } = await supabase
        .from('lobby_accounts')
        .select('company_name, company_website, contact_email, subscription_status, account_type')
        .eq('user_id', user.id)
        .maybeSingle();

      if (la) {
        setCompanyName(la.company_name || '');
        setCompanyWebsite(la.company_website || '');
        setContactEmail(la.contact_email || '');
        setSubscriptionStatus(la.subscription_status || '');
        setAccountType(la.account_type || '');
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveProfile() {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nicht angemeldet');
      const { error } = await supabase
        .from('lobby_accounts')
        .update({ company_name: companyName, company_website: companyWebsite, contact_email: contactEmail })
        .eq('user_id', user.id);
      if (error) throw error;
      setMessage({ text: 'Profil gespeichert.', type: 'ok' });
    } catch (e: any) {
      setMessage({ text: e.message, type: 'err' });
    } finally {
      setIsSaving(false);
    }
  }

  // Spec: Rechnungen & Zahlungsdaten → create-billing-portal
  async function handleBillingPortal() {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${FN_BASE}/create-billing-portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch (e: any) {
      setMessage({ text: e.message, type: 'err' });
    }
  }

  // Spec: Passwort ändern
  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Passwörter stimmen nicht überein.', type: 'err' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ text: 'Passwort muss mindestens 8 Zeichen haben.', type: 'err' });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setMessage({ text: error.message, type: 'err' });
    else { setMessage({ text: 'Passwort geändert.', type: 'ok' }); setNewPassword(''); setConfirmPassword(''); }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    trialing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    past_due: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled_legacy: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  const statusLabels: Record<string, string> = {
    active: 'Aktiv', trialing: 'Testphase', past_due: 'Zahlung ausstehend',
    cancelled: 'Gekündigt', cancelled_legacy: 'Abgelaufen',
  };

  if (isLoading) return <div className="text-gray-400 text-center py-12">Laden...</div>;

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-white">Einstellungen</h2>

      {message && (
        <div className={`p-4 rounded-xl text-sm ${message.type === 'ok'
          ? 'bg-green-500/10 border border-green-500/30 text-green-400'
          : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
          {message.text}
        </div>
      )}

      {/* Spec: Company Profile bearbeitbar */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Unternehmensprofil</h3>
        {[
          { label: 'Unternehmensname', value: companyName, setter: setCompanyName },
          { label: 'Website', value: companyWebsite, setter: setCompanyWebsite },
          { label: 'Kontakt-E-Mail', value: contactEmail, setter: setContactEmail },
        ].map(({ label, value, setter }) => (
          <div key={label}>
            <label className="block text-sm text-gray-400 mb-1">{label}</label>
            <input
              value={value}
              onChange={(e) => setter(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        ))}
        <button onClick={handleSaveProfile} disabled={isSaving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-2.5 rounded-xl disabled:opacity-50">
          {isSaving ? 'Speichern...' : 'Speichern'}
        </button>
      </div>

      {/* Spec: Subscription-Status-Banner */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Abonnement</h3>
        <div className="flex items-center gap-3">
          {subscriptionStatus && (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[subscriptionStatus] || 'bg-gray-500/20 text-gray-400'}`}>
              {statusLabels[subscriptionStatus] || subscriptionStatus}
            </span>
          )}
          <span className="text-gray-400 text-sm capitalize">{accountType}</span>
        </div>
        {/* Spec: Rechnungen & Zahlungsdaten → create-billing-portal */}
        <button onClick={handleBillingPortal}
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2.5 rounded-xl text-sm">
          Rechnungen & Zahlungsdaten verwalten
        </button>
      </div>

      {/* Spec: Passwort ändern */}
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 space-y-4">
        <h3 className="text-lg font-semibold text-white">Passwort ändern</h3>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Neues Passwort</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
            placeholder="Mindestens 8 Zeichen" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Passwort bestätigen</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
            placeholder="Passwort wiederholen" />
        </div>
        <button onClick={handleChangePassword} disabled={!newPassword || !confirmPassword}
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2.5 rounded-xl disabled:opacity-50">
          Passwort ändern
        </button>
      </div>
    </div>
  );
}
