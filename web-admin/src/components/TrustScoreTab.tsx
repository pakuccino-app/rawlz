// web-admin/src/components/TrustScoreTab.tsx
import React, { useState } from 'react';
import { adminApi } from '../lib/api';

interface User {
  id: string;
  device_hash: string;
  trust_score: number;
  membership_type: string;
  is_banned: boolean;
  created_at: string;
}

interface Vouch {
  id: string;
  voucher_device_hash: string;
  created_at: string;
}

export default function TrustScoreTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [vouches, setVouches] = useState<Vouch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [newScore, setNewScore] = useState('');
  const [reason, setReason] = useState('');

  async function handleSearch() {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const result = await adminApi('search_users', { deviceHash: searchQuery });
      setUsers(result.users || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }

  function selectUser(user: User) {
    setSelectedUser(user);
    setNewScore(user.trust_score.toString());
    // Spec: Aktuelle Vouches anzeigen
    adminApi('get_user_vouches', { userId: user.id })
      .then((r) => setVouches(r.vouches || []))
      .catch(() => setVouches([]));
  }

  async function handleUpdateScore() {
    if (!selectedUser) return;
    try {
      await adminApi('update_trust_score', {
        userId: selectedUser.id,
        newScore: parseInt(newScore),
        reason,
      });
      alert('Trust Score aktualisiert');
      setSelectedUser((prev) => prev ? { ...prev, trust_score: parseInt(newScore) } : null);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleBan(ban: boolean) {
    if (!selectedUser) return;
    try {
      await adminApi('ban_user', { userId: selectedUser.id, ban });
      alert(ban ? 'User gebannt' : 'User entbannt');
      setSelectedUser({ ...selectedUser, is_banned: ban });
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Trust Score Manager</h2>

      {/* Search */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Device Hash suchen..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
        />
        <button
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-amber-500 text-black px-6 py-2 rounded-lg font-semibold"
        >
          {isSearching ? 'Suche...' : 'Suchen'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Results */}
        <div className="bg-gray-800 rounded-lg p-4">
          {users.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              {searchQuery ? 'Keine Ergebnisse' : 'Suche nach Device Hash'}
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  onClick={() => {
                    selectUser(user);
                    setNewScore(user.trust_score.toString());
                  }}
                  className={`p-4 rounded-lg cursor-pointer transition ${
                    selectedUser?.id === user.id
                      ? 'bg-amber-500/20 border border-amber-500'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-white text-sm">{user.device_hash.slice(0, 16)}...</code>
                    <span className={`px-2 py-1 rounded text-xs ${
                      user.is_banned ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                    }`}>
                      {user.is_banned ? 'Gebannt' : 'Aktiv'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400">Trust: <span className="text-white">{user.trust_score}</span></span>
                    <span className="text-gray-400">Typ: <span className="text-white">{user.membership_type}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-gray-800 rounded-lg p-6">
          {selectedUser ? (
            <div>
              <h3 className="text-lg font-bold text-white mb-4">User Details</h3>
              
              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-gray-400 text-sm">Device Hash:</span>
                  <code className="text-white block text-sm">{selectedUser.device_hash}</code>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Mitgliedschaft:</span>
                  <p className="text-white">{selectedUser.membership_type}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Registriert:</span>
                  <p className="text-white">
                    {new Date(selectedUser.created_at).toLocaleString('de-DE')}
                  </p>
                </div>
              </div>

              {/* Trust Score adjustment */}
              <div className="border-t border-gray-700 pt-4 space-y-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Neuer Trust Score</label>
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Grund</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white"
                  />
                </div>
                <button
                  onClick={handleUpdateScore}
                  className="w-full bg-amber-500 text-black py-2 rounded-lg font-semibold"
                >
                  ✏️ Score aktualisieren
                </button>

                <div className="flex gap-3 pt-4">
                  {selectedUser.is_banned ? (
                    <button
                      onClick={() => handleBan(false)}
                      className="flex-1 bg-green-500 text-white py-2 rounded-lg"
                    >
                      ✅ Entbannen
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBan(true)}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg"
                    >
                      🚫 Bannen
                    </button>
                  )}
                  <button className="flex-1 bg-gray-700 text-red-400 py-2 rounded-lg">
                    🗑️ Löschen
                  </button>
                </div>
              </div>

              {/* Spec: Aktuelle Vouches anzeigen */}
              <div className="border-t border-gray-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-400 mb-2">
                  Aktuelle Vouches ({vouches.length})
                </h4>
                {vouches.length === 0 ? (
                  <p className="text-gray-600 text-xs">Keine Vouches vorhanden</p>
                ) : (
                  <ul className="space-y-1">
                    {vouches.map((v) => (
                      <li key={v.id} className="text-xs text-gray-400 font-mono">
                        {v.voucher_device_hash.slice(0, 16)}… · {new Date(v.created_at).toLocaleDateString('de-DE')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-center py-8">
              Wähle einen User aus
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
