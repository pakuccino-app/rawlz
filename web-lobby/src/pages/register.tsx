// web-lobby/src/pages/register.tsx
// Lobby Registration with PATH A (Commercial) and PATH B (Subsidized)
// React + TypeScript for lobby.rawlz.app

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken } from '../lib/supabase';

// Vercel-Proxy für alle EF-Calls (kein Adblock-Problem)
const FN_BASE = '/functions/v1';

async function authFetch(path: string, body: object) {
  const token = await getAccessToken();
  if (!token) throw new Error('Nicht angemeldet. Bitte zuerst einloggen.');
  const res = await fetch(`${FN_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? 'Fehler');
  return data;
}

// Spec: Disclaimer-Komponente — immer sichtbar, gold auf midnight
function Disclaimer() {
  return (
    <div className="w-full bg-[#1A1A2E] text-[#D4AF37] text-center text-xs font-medium py-3 px-4">
      Kein Stimmvorteil – nur Analyse-Tools
    </div>
  );
}

// Types
interface CommercialForm {
  companyName: string;
  companyType: string;
  tradeRegisterNo: string;
  companyWebsite: string;
  contactName: string;
  contactEmail: string;
}

interface SubsidizedForm {
  companyName: string; // Spec: company_name Pflichtfeld
  subsidyOrgType: string;
  tradeRegisterNo: string;
  companyWebsite: string;
  contactName: string;
  contactEmail: string;
  subsidyProofUrl: string;
  subsidyReason: string;  // Spec: max 500 Zeichen
  suggestedAmount?: number;
}

type RegistrationPath = 'select' | 'commercial' | 'subsidized' | 'commercial-checkout' | 'subsidized-submitted';

const COMPANY_TYPES = [
  'GmbH',
  'AG',
  'UG (haftungsbeschränkt)',
  'Einzelunternehmen',
  'OHG',
  'KG',
  'Sonstige',
];

const SUBSIDY_ORG_TYPES = [
  'NGO/Verein (e.V.)',
  'Stiftung',
  'Bildungseinrichtung',
  'Behörde',
  'Journalismus/Medien',
  'Sonstiges',
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [path, setPath] = useState<RegistrationPath>('select');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbyAccountId, setLobbyAccountId] = useState<string | null>(null);

  // Commercial form state
  const [commercialForm, setCommercialForm] = useState<CommercialForm>({
    companyName: '',
    companyType: '',
    tradeRegisterNo: '',
    companyWebsite: '',
    contactName: '',
    contactEmail: '',
  });

  // Subsidized form state
  const [subsidizedForm, setSubsidizedForm] = useState<SubsidizedForm>({
    companyName: '',
    subsidyOrgType: '',
    tradeRegisterNo: '',
    companyWebsite: '',
    contactName: '',
    contactEmail: '',
    subsidyProofUrl: '',
    subsidyReason: '',
    suggestedAmount: undefined,
  });

  // Submit commercial registration
  async function handleCommercialSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const result = await authFetch('register-lobby', {
        accountType: 'commercial',
        ...commercialForm,
      });
      setLobbyAccountId(result.lobbyAccountId);
      setPath('commercial-checkout');
    } catch (err: any) {
      setError(err.message || 'Registrierung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  // Submit subsidized registration
  async function handleSubsidizedSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Spec: max 500 Zeichen für subsidy_reason
    if (subsidizedForm.subsidyReason.length > 500) {
      setError('Begründung darf max. 500 Zeichen haben.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await authFetch('register-lobby', {
        accountType: 'subsidized',
        ...subsidizedForm,
      });
      setPath('subsidized-submitted');
    } catch (err: any) {
      setError(err.message || 'Antrag konnte nicht eingereicht werden.');
    } finally {
      setIsLoading(false);
    }
  }

  // Start Stripe Checkout
  async function handleStartCheckout() {
    if (!lobbyAccountId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await authFetch('create-lobby-checkout', { lobbyAccountId });
      window.location.href = result.checkoutUrl;
    } catch (err: any) {
      setError(err.message || 'Checkout konnte nicht gestartet werden.');
      setIsLoading(false);
    }
  }

  // Render path selection
  if (path === 'select') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Disclaimer />
        <div className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2">
            RAWLZ Lobby Zugang
          </h1>
          <p className="text-gray-500 text-center mb-12">
            Wählen Sie Ihre Zugangsart
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Commercial Path */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">🏢</div>
              <h2 className="text-xl font-bold mb-2">Kommerzieller Zugang</h2>
              <p className="text-gray-500 mb-6">
                Für Unternehmen und kommerzielle Organisationen
              </p>
              
              <div className="bg-gray-100 rounded-xl p-4 mb-6">
                <div className="text-2xl font-bold">€2.400/Jahr</div>
                <div className="text-sm text-gray-500">zzgl. MwSt.</div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">Sofortiger Zugang nach Zahlung</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">Alle Lobby-Features</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">PDF-Report-Generierung</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">API-Zugang</span>
                </li>
              </ul>

              <button
                onClick={() => setPath('commercial')}
                className="w-full bg-black text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition"
              >
                Jetzt registrieren →
              </button>
            </div>

            {/* Subsidized Path */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">🤝</div>
              <h2 className="text-xl font-bold mb-2">Förderantrag stellen</h2>
              <p className="text-gray-500 mb-6">
                Für gemeinnützige Organisationen
              </p>

              <div className="bg-amber-50 rounded-xl p-4 mb-6">
                <div className="text-sm text-amber-800">
                  <strong>Berechtigt:</strong> NGOs, Vereine, Stiftungen,
                  Bildungseinrichtungen, Behörden, unabhängige Medien
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">Reduzierter oder kostenfreier Zugang</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">Prüfung innerhalb von 5 Werktagen</span>
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  <span className="text-sm">Alle Lobby-Features</span>
                </li>
              </ul>

              <button
                onClick={() => setPath('subsidized')}
                className="w-full bg-amber-500 text-white py-4 rounded-xl font-semibold hover:bg-amber-600 transition"
              >
                Förderantrag stellen →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  }

  // Render commercial form
  if (path === 'commercial') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Disclaimer />
        <div className="py-12 px-4">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setPath('select')}
            className="text-gray-500 mb-8 hover:text-black"
          >
            ← Zurück
          </button>

          <h1 className="text-2xl font-bold mb-2">Kommerzielle Registrierung</h1>
          <p className="text-gray-500 mb-8">€2.400/Jahr · Sofortiger Zugang</p>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleCommercialSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Unternehmensname *
              </label>
              <input
                type="text"
                required
                value={commercialForm.companyName}
                onChange={(e) => setCommercialForm({ ...commercialForm, companyName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Rechtsform *
              </label>
              <select
                required
                value={commercialForm.companyType}
                onChange={(e) => setCommercialForm({ ...commercialForm, companyType: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">Bitte wählen...</option>
                {COMPANY_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Handelsregisternummer *
              </label>
              <input
                type="text"
                required
                value={commercialForm.tradeRegisterNo}
                onChange={(e) => setCommercialForm({ ...commercialForm, tradeRegisterNo: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="z.B. HRB 12345"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Unternehmenswebseite *
              </label>
              <input
                type="url"
                required
                value={commercialForm.companyWebsite}
                onChange={(e) => setCommercialForm({ ...commercialForm, companyWebsite: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="https://"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Ansprechpartner (Name) *
              </label>
              <input
                type="text"
                required
                value={commercialForm.contactName}
                onChange={(e) => setCommercialForm({ ...commercialForm, contactName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Ansprechpartner (E-Mail) *
              </label>
              <input
                type="email"
                required
                value={commercialForm.contactEmail}
                onChange={(e) => setCommercialForm({ ...commercialForm, contactEmail: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-black text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition disabled:bg-gray-300"
            >
              {isLoading ? 'Wird verarbeitet...' : 'Weiter zur Zahlung →'}
            </button>
          </form>
        </div>
        </div>
      </div>
    );
  }

  // Render commercial checkout confirmation
  if (path === 'commercial-checkout') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="text-5xl mb-6">💳</div>
          <h1 className="text-2xl font-bold mb-4">Registrierung erfolgreich!</h1>
          <p className="text-gray-500 mb-8">
            Ihr Konto wurde erstellt. Schließen Sie jetzt die Zahlung ab,
            um sofortigen Zugang zu erhalten.
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <div className="bg-gray-100 rounded-xl p-6 mb-8">
            <div className="text-3xl font-bold mb-2">€2.400</div>
            <div className="text-gray-500">Jährliche Lizenz (zzgl. MwSt.)</div>
          </div>

          <button
            onClick={handleStartCheckout}
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-xl font-semibold hover:bg-gray-800 transition disabled:bg-gray-300"
          >
            {isLoading ? 'Wird gestartet...' : 'Jetzt Zugang kaufen – €2.400/Jahr'}
          </button>

          <p className="text-sm text-gray-400 mt-4">
            Sichere Zahlung via Stripe. Kreditkarte oder SEPA-Lastschrift.
          </p>
        </div>
      </div>
    );
  }

  // Render subsidized form
  if (path === 'subsidized') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Disclaimer />
        <div className="py-12 px-4">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setPath('select')}
            className="text-gray-500 mb-8 hover:text-black"
          >
            ← Zurück
          </button>

          <h1 className="text-2xl font-bold mb-2">Förderantrag stellen</h1>
          <p className="text-gray-500 mb-4">Für gemeinnützige Organisationen</p>

          {/* Eligibility notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8">
            <p className="text-sm text-amber-800">
              <strong>Berechtigt sind:</strong> gemeinnützige Organisationen (e.V., gGmbH, Stiftung),
              Bildungseinrichtungen, Behörden, unabhängige Medien/Journalismus.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubsidizedSubmit} className="space-y-6">
            {/* Spec: company_name Pflichtfeld für Path B */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Name der Organisation *
              </label>
              <input
                type="text"
                required
                value={subsidizedForm.companyName}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, companyName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Organisationstyp *
              </label>
              <select
                required
                value={subsidizedForm.subsidyOrgType}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, subsidyOrgType: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Bitte wählen...</option>
                {SUBSIDY_ORG_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Vereinsregister-Nr. / Steuernummer *
              </label>
              <input
                type="text"
                required
                value={subsidizedForm.tradeRegisterNo}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, tradeRegisterNo: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="z.B. VR 12345 oder Steuernummer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Webseite *
              </label>
              <input
                type="url"
                required
                value={subsidizedForm.companyWebsite}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, companyWebsite: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="https://"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Ansprechpartner (Name) *
              </label>
              <input
                type="text"
                required
                value={subsidizedForm.contactName}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, contactName: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Ansprechpartner (E-Mail) *
              </label>
              <input
                type="email"
                required
                value={subsidizedForm.contactEmail}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, contactEmail: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Link zum Gemeinnützigkeitsnachweis
              </label>
              <input
                type="url"
                value={subsidizedForm.subsidyProofUrl}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, subsidyProofUrl: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="https:// (optional)"
              />
              <p className="text-xs text-gray-400 mt-1">
                z.B. Link zum Freistellungsbescheid oder Satzung
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Begründung des Antrags * <span className="text-gray-400">(max. 500 Zeichen)</span>
              </label>
              <textarea
                required
                maxLength={500}
                rows={4}
                value={subsidizedForm.subsidyReason}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, subsidyReason: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                placeholder="Beschreiben Sie kurz Ihre Organisation und warum Sie RAWLZ nutzen möchten..."
              />
              <p className="text-xs text-gray-400 text-right">
                {subsidizedForm.subsidyReason.length}/500
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Vorgeschlagener Beitrag (€/Jahr)
              </label>
              <input
                type="number"
                min="0"
                max="2400"
                value={subsidizedForm.suggestedAmount || ''}
                onChange={(e) => setSubsidizedForm({ ...subsidizedForm, suggestedAmount: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Optional"
              />
              <p className="text-xs text-gray-400 mt-1">
                Falls Sie einen Beitrag leisten können (0 = kostenfrei)
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 text-white py-4 rounded-xl font-semibold hover:bg-amber-600 transition disabled:bg-gray-300"
            >
              {isLoading ? 'Wird eingereicht...' : 'Förderantrag einreichen'}
            </button>
          </form>
        </div>
        </div>
      </div>
    );
  }

  // Render subsidized submission confirmation
  if (path === 'subsidized-submitted') {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl">✓</span>
          </div>

          <h1 className="text-2xl font-bold mb-4">Antrag eingereicht!</h1>
          <p className="text-gray-500 mb-8">
            Wir prüfen Ihren Förderantrag innerhalb von <strong>5 Werktagen</strong>.
            Sie erhalten eine E-Mail, sobald wir entschieden haben.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <h3 className="font-semibold mb-2">Was passiert jetzt?</h3>
            <ol className="text-left text-sm text-gray-600 space-y-2">
              <li>1. Unser Team prüft Ihre Angaben</li>
              <li>2. Bei Rückfragen melden wir uns per E-Mail</li>
              <li>3. Nach Genehmigung erhalten Sie Ihren Zugang</li>
            </ol>
          </div>

          <button
            onClick={() => navigate('/')}
            className="text-amber-600 font-semibold hover:underline"
          >
            Zurück zur Startseite →
          </button>
        </div>
      </div>
    );
  }

  return null;
}
