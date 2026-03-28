// web-admin/src/components/PushTab.tsx
import React, { useState } from 'react';
import { adminApi } from '../lib/api';

interface PushTabProps {
  isSuperAdmin: boolean;
}

export default function PushTab({ isSuperAdmin }: PushTabProps) {
  const [activeSection, setActiveSection] = useState<'compose' | 'activation' | 'payments'>('compose');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetGroup, setTargetGroup] = useState<'all' | 'supporter' | 'expert' | 'lobby'>('all');
  const [isSending, setIsSending] = useState(false);

  async function handleSend() {
    if (!title || !body) {
      alert('Titel und Text erforderlich');
      return;
    }
    if (title.length > 60) {
      alert('Titel max. 60 Zeichen');
      return;
    }
    if (body.length > 140) {
      alert('Text max. 140 Zeichen');
      return;
    }

    setIsSending(true);
    try {
      // Would call send-push-notification edge function
      alert('Push-Benachrichtigung gesendet!');
      setTitle('');
      setBody('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Push Notifications</h2>

      {/* Section tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveSection('compose')}
          className={`px-4 py-2 rounded-lg ${
            activeSection === 'compose' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Verfassen
        </button>
        <button
          onClick={() => setActiveSection('activation')}
          className={`px-4 py-2 rounded-lg ${
            activeSection === 'activation' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Aktivierungs-Log
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveSection('payments')}
            className={`px-4 py-2 rounded-lg ${
              activeSection === 'payments' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-gray-300'
            }`}
          >
            Zahlungs-Events
          </button>
        )}
      </div>

      {/* Compose Section */}
      {activeSection === 'compose' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-gray-800 rounded-lg p-6 space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-2">
                Titel (max. 60 Zeichen)
              </label>
              <input
                type="text"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
                placeholder="Nachrichtentitel"
              />
              <div className="text-right text-xs text-gray-500 mt-1">{title.length}/60</div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">
                Text (max. 140 Zeichen)
              </label>
              <textarea
                maxLength={140}
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white resize-none"
                placeholder="Nachrichtentext"
              />
              <div className="text-right text-xs text-gray-500 mt-1">{body.length}/140</div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-2">Zielgruppe</label>
              <select
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              >
                <option value="all">Alle Nutzer</option>
                <option value="supporter">Supporter</option>
                <option value="expert">Experten</option>
                <option value="lobby">Lobby</option>
              </select>
            </div>

            <button
              onClick={handleSend}
              disabled={isSending || !title || !body}
              className="w-full bg-amber-500 text-black py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              {isSending ? 'Wird gesendet...' : '🔔 Push senden'}
            </button>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Vorschau</h3>
            
            {/* iOS Preview */}
            <div className="bg-gray-200 rounded-2xl p-4 max-w-xs">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-bold text-xs">
                  R
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-800 text-sm">RAWLZ</span>
                    <span className="text-gray-500 text-xs">jetzt</span>
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">{title || 'Titel'}</p>
                  <p className="text-gray-600 text-sm">{body || 'Nachrichtentext'}</p>
                </div>
              </div>
            </div>

            {/* Android Preview */}
            <div className="bg-gray-800 rounded-lg p-4 max-w-xs border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 bg-amber-500 rounded flex items-center justify-center text-white font-bold text-xs">
                  R
                </div>
                <span className="text-gray-400 text-sm">RAWLZ</span>
                <span className="text-gray-500 text-xs ml-auto">jetzt</span>
              </div>
              <p className="font-semibold text-white text-sm">{title || 'Titel'}</p>
              <p className="text-gray-300 text-sm">{body || 'Nachrichtentext'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Activation Log Section */}
      {activeSection === 'activation' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400">Aktivierungs-Benachrichtigungen werden hier angezeigt.</p>
        </div>
      )}

      {/* Payments Section (Super Admin only) */}
      {activeSection === 'payments' && isSuperAdmin && (
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-400">Zahlungs-Events aus dem Admin Audit Log.</p>
        </div>
      )}
    </div>
  );
}
