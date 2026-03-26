// web-lobby/src/pages/success.tsx
// Checkout success page for Lobby

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function SuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Verify session (optional - webhook handles the activation)
    const timer = setTimeout(() => {
      setIsVerifying(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [sessionId]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Zahlung wird verifiziert...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto text-center">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl text-green-500">✓</span>
        </div>

        <h1 className="text-3xl font-bold mb-4">Willkommen bei RAWLZ Lobby!</h1>
        <p className="text-gray-500 mb-8">
          Ihre Zahlung war erfolgreich. Ihr Zugang ist sofort aktiv.
        </p>

        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 mb-8">
          <h2 className="text-xl font-semibold mb-4">Ihre nächsten Schritte:</h2>
          <ul className="text-left space-y-4">
            <li className="flex items-start">
              <span className="bg-green-100 text-green-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0">1</span>
              <div>
                <strong>Dashboard erkunden</strong>
                <p className="text-sm text-gray-500">Alle Umfrageergebnisse und Trends auf einen Blick</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 text-green-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0">2</span>
              <div>
                <strong>API-Zugang einrichten</strong>
                <p className="text-sm text-gray-500">Integrieren Sie RAWLZ-Daten in Ihre Systeme</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="bg-green-100 text-green-600 w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0">3</span>
              <div>
                <strong>Reports generieren</strong>
                <p className="text-sm text-gray-500">Erstellen Sie PDF-Reports für Ihr Team</p>
              </div>
            </li>
          </ul>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="bg-black text-white px-8 py-4 rounded-xl font-semibold hover:bg-gray-800 transition"
        >
          Zum Dashboard →
        </button>

        <p className="text-sm text-gray-400 mt-6">
          Sie erhalten eine Bestätigungs-E-Mail mit Ihrer Rechnung.
        </p>
      </div>
    </div>
  );
}
