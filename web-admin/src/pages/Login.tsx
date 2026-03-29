// web-admin/src/pages/Login.tsx
// Admin login with TOTP support

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { adminLogin, adminTotpVerify, adminTotpSetup, setSessionToken } from '../lib/api';

type LoginStep = 'credentials' | 'totp' | 'totp-setup';

export default function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await adminLogin(email, password);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.needsTotpSetup && result.tempToken) {
        setTempToken(result.tempToken);
        // Get TOTP setup
        const setupResult = await adminTotpSetup(result.tempToken);
        if (setupResult.otpauthUri) {
          setOtpauthUri(setupResult.otpauthUri);
          setManualCode(setupResult.manualCode || '');
          setStep('totp-setup');
        }
      } else if (result.needsTotp && result.tempToken) {
        setTempToken(result.tempToken);
        setStep('totp');
      }
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await adminTotpVerify(tempToken, totpCode);

      if (result.error) {
        setError(result.error);
        return;
      }

      // FIX 5: sessionToken kommt jetzt aus adminTotpVerify zurück
      if (result.success || result.sessionToken) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'TOTP-Verifizierung fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">#RAWLZ</h1>
          <p className="text-gray-400 mt-2">Admin Portal</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Step: Credentials */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentials} className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">E-Mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Passwort</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 text-black font-semibold py-3 rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
            >
              {isLoading ? 'Wird geprüft...' : 'Anmelden'}
            </button>
          </form>
        )}

        {/* Step: TOTP Setup */}
        {step === 'totp-setup' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-2">2FA einrichten</h2>
              <p className="text-gray-400 text-sm">
                Scanne den QR-Code mit deiner Authenticator-App
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg mx-auto w-fit">
              <QRCodeSVG value={otpauthUri} size={200} />
            </div>

            {manualCode && (
              <div className="text-center">
                <p className="text-gray-400 text-sm mb-2">Oder manuell eingeben:</p>
                <code className="bg-gray-800 text-amber-400 px-4 py-2 rounded font-mono text-sm">
                  {manualCode}
                </code>
              </div>
            )}

            <form onSubmit={handleTotp} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Bestätigungscode</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || totpCode.length !== 6}
                className="w-full bg-amber-500 text-black font-semibold py-3 rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
              >
                {isLoading ? 'Wird verifiziert...' : 'Bestätigen'}
              </button>
            </form>
          </div>
        )}

        {/* Step: TOTP */}
        {step === 'totp' && (
          <form onSubmit={handleTotp} className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-2">2FA-Code eingeben</h2>
              <p className="text-gray-400 text-sm">
                Gib den Code aus deiner Authenticator-App ein
              </p>
            </div>

            <div>
              <input
                type="text"
                maxLength={6}
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-4 text-white text-center text-3xl tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full bg-amber-500 text-black font-semibold py-3 rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
            >
              {isLoading ? 'Wird verifiziert...' : 'Anmelden'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
