// web-admin/src/components/NominationsTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface Nomination {
  id: string;
  name: string;
  email: string;
  nomination_count: number;
  status: string;
  created_at: string;
}

const THRESHOLD = 25;

export default function NominationsTab() {
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadNominations();
  }, []);

  async function loadNominations() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_nominations');
      setNominations(result.nominations || []);
    } catch (err) {
      console.error('Load nominations error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Spec: EF-16 send-expert-invitation
  async function handleInvite(nominationId: string, email: string) {
    try {
      await adminApi('send_expert_invitation', { nominationId, email });
      alert('Einladung gesendet!');
      loadNominations();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleReject(nominationId: string) {
    if (!confirm('Nominierung ablehnen?')) return;
    try {
      await adminApi('reject_nomination', { nominationId });
      loadNominations();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Experten-Nominierungen</h2>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">E-Mail</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Nominierungen</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Schwelle</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktion</th>            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Laden...</td></tr>
            ) : nominations.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Keine Nominierungen</td></tr>
            ) : nominations.map((nom) => (
              <tr key={nom.id} className="hover:bg-gray-700/50">
                <td className="px-4 py-3 text-white">{nom.name}</td>
                <td className="px-4 py-3 text-gray-300">{nom.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-amber-500 h-2 rounded-full"
                        style={{ width: `${Math.min(100, (nom.nomination_count / THRESHOLD) * 100)}%` }}
                      />
                    </div>
                    <span className="text-white text-sm">{nom.nomination_count}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">{THRESHOLD}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    nom.status === 'invited' ? 'bg-blue-500/20 text-blue-400' :
                    nom.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {nom.status === 'invited' ? 'Eingeladen' :
                     nom.status === 'accepted' ? 'Akzeptiert' : 'Ausstehend'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {nom.nomination_count >= THRESHOLD && nom.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleInvite(nom.id, nom.email)}
                        className="bg-amber-500 text-black px-3 py-1 rounded text-xs font-bold hover:bg-amber-400">
                        📧 Einladen
                      </button>
                      <button
                        onClick={() => handleReject(nom.id)}
                        className="bg-gray-700 text-red-400 px-3 py-1 rounded text-xs hover:bg-gray-600">
                        ❌ Ablehnen
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
