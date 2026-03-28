// web-admin/src/components/PushTab.tsx
// Push Notifications mit echtem API-Call zu send-push-notification

import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { Send, Bell, Activity, CreditCard, Loader2 } from 'lucide-react';

interface PushTabProps {
  isSuperAdmin: boolean;
}

interface ActivationLog {
  id: string;
  action: string;
  entity_id: string;
  details: any;
  created_at: string;
}

const API_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function PushTab({ isSuperAdmin }: PushTabProps) {
  const [activeSection, setActiveSection] = useState<'compose' | 'activation' | 'payments'>('compose');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetGroup, setTargetGroup] = useState<'all' | 'supporter' | 'expert' | 'lobby'>('all');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activationLogs, setActivationLogs] = useState<ActivationLog[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);

  useEffect(() => {
    if (activeSection === 'activation') loadActivationLogs();
    if (activeSection === 'payments' && isSuperAdmin) loadPaymentLogs();
  }, [activeSection]);

  async function loadActivationLogs() {
    setIsLogsLoading(true);
    try {
      const result = await adminApi('get_audit_log', { action: 'activate_question', limit: 50 });
      setActivationLogs(result.logs ?? []);
    } catch {
      setActivationLogs([]);
    } finally {
      setIsLogsLoading(false);
    }
  }

  const [paymentLogs, setPaymentLogs] = useState<ActivationLog[]>([]);

  async function loadPaymentLogs() {
    setIsLogsLoading(true);
    try {
      const result = await adminApi('get_audit_log', { action: 'stripe_payment', limit: 50 });
      setPaymentLogs(result.logs ?? []);
    } catch {
      setPaymentLogs([]);
    } finally {
      setIsLogsLoading(false);
    }
  }

  async function handleSend() {
    if (!title || !body) {
      setError('Titel und Text erforderlich');
      return;
    }
    if (title.length > 60) {
      setError('Titel max. 60 Zeichen');
      return;
    }
    if (body.length > 140) {
      setError('Text max. 140 Zeichen');
      return;
    }

    setIsSending(true);
    setError(null);
    setSendResult(null);

    try {
      const result = await adminApi('send_push', {
        title,
        body,
        targetGroup,
      });
      setSendResult({ sent: result.sent ?? 0, failed: result.failed ?? 0 });
      setTitle('');
      setBody('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Push Notifications</h2>

      {/* Section tabs */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { id: 'compose', label: 'Verfassen', icon: Send },
          { id: 'activation', label: 'Aktivierungs-Log', icon: Bell },
          ...(isSuperAdmin ? [{ id: 'payments', label: 'Zahlungs-Events', icon: CreditCard }] : []),
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === id
                ? 'bg-amber-500 text-black'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Compose Section */}
      {activeSection === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-gray-800 rounded-xl p-6 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            {sendResult && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-400 text-sm">
                Gesendet: {sendResult.sent} · Fehler: {sendResult.failed}
              </div>
            )}

            <div>
              <label className="text-gray-400 text-sm block mb-1.5">
                Titel <span className="text-gray-600">(max. 60 Zeichen)</span>
              </label>
              <input
                type="text"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="Nachrichtentitel"
              />
              <div className="text-right text-xs text-gray-500 mt-1">{title.length}/60</div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-1.5">
                Text <span className="text-gray-600">(max. 140 Zeichen)</span>
              </label>
              <textarea
                maxLength={140}
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white resize-none focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="Nachrichtentext"
              />
              <div className="text-right text-xs text-gray-500 mt-1">{body.length}/140</div>
            </div>

            <div>
              <label className="text-gray-400 text-sm block mb-1.5">Zielgruppe</label>
              <select
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value as any)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
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
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl disabled:opacity-50 transition-colors"
            >
              {isSending ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Wird gesendet...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Push senden
                </>
              )}
            </button>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white">Vorschau</h3>

            {/* iOS Preview */}
            <div className="bg-gray-200 rounded-2xl p-4 max-w-xs shadow-lg">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0">R</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-gray-800 text-sm">RAWLZ</span>
                    <span className="text-gray-500 text-xs">jetzt</span>
                  </div>
                  <p className="font-semibold text-gray-800 text-sm leading-tight">{title || 'Titel'}</p>
                  <p className="text-gray-600 text-sm leading-tight mt-0.5">{body || 'Nachrichtentext'}</p>
                </div>
              </div>
            </div>

            {/* Android Preview */}
            <div className="bg-gray-800 rounded-xl p-4 max-w-xs border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 bg-amber-500 rounded flex items-center justify-center text-black font-black text-xs flex-shrink-0">R</div>
                <span className="text-gray-400 text-xs font-medium">RAWLZ</span>
                <span className="text-gray-600 text-xs ml-auto">jetzt</span>
              </div>
              <p className="font-semibold text-white text-sm">{title || 'Titel'}</p>
              <p className="text-gray-300 text-sm mt-0.5">{body || 'Nachrichtentext'}</p>
            </div>

            <div className="bg-gray-800 rounded-xl p-4 text-sm">
              <div className="text-gray-400 mb-2 font-medium">Zielgruppe</div>
              <div className="text-white">
                {targetGroup === 'all' ? 'Alle registrierten Nutzer mit Push-Token' :
                 targetGroup === 'supporter' ? 'Nur Supporter-Mitglieder' :
                 targetGroup === 'expert' ? 'Nur Experten' :
                 'Nur Lobby-Mitglieder'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activation Log */}
      {activeSection === 'activation' && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {isLogsLoading ? (
            <div className="text-gray-500 text-center py-8">Laden...</div>
          ) : activationLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">Keine Aktivierungs-Events</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Zeitpunkt</th>
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Aktion</th>
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {activationLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-3 text-amber-400 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      {log.entity_id ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payment Events (Super Admin only) */}
      {activeSection === 'payments' && isSuperAdmin && (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {isLogsLoading ? (
            <div className="text-gray-500 text-center py-8">Laden...</div>
          ) : paymentLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">Keine Zahlungs-Events</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Zeitpunkt</th>
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Aktion</th>
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {paymentLogs.map(log => (
                  <tr key={log.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('de-DE')}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      {log.details ? JSON.stringify(log.details).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
