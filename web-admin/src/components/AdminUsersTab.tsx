// web-admin/src/components/AdminUsersTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
}

interface IPWhitelist {
  id: string;
  ip: string;
  description?: string;
  created_at: string;
}

export default function AdminUsersTab() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [ips, setIPs] = useState<IPWhitelist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewAdmin, setShowNewAdmin] = useState(false);
  const [showNewIP, setShowNewIP] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newIP, setNewIP] = useState('');
  const [newIPDesc, setNewIPDesc] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [adminsResult, ipsResult] = await Promise.all([
        adminApi('get_admin_users'),
        adminApi('get_ip_whitelist'),
      ]);
      setAdmins(adminsResult.admins || []);
      setIPs(ipsResult.ips || []);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateAdmin() {
    if (!newEmail || !newName) return;
    try {
      const result = await adminApi('create_admin', { email: newEmail, name: newName });
      alert(`Moderator erstellt! Temporäres Passwort: ${result.tempPassword}`);
      setShowNewAdmin(false);
      setNewEmail('');
      setNewName('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleAddIP() {
    if (!newIP) return;
    try {
      await adminApi('add_ip_whitelist', { ip: newIP, description: newIPDesc });
      setShowNewIP(false);
      setNewIP('');
      setNewIPDesc('');
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (isLoading) {
    return <div className="text-gray-400 text-center py-8">Laden...</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Admin User Management</h2>

      {/* Admin Users */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Administratoren</h3>
          <button
            onClick={() => setShowNewAdmin(true)}
            className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold"
          >
            ➕ Moderator anlegen
          </button>
        </div>

        {/* New admin form */}
        {showNewAdmin && (
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                type="email"
                placeholder="E-Mail"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white"
              />
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateAdmin}
                className="bg-green-500 text-white px-4 py-2 rounded"
              >
                Erstellen
              </button>
              <button
                onClick={() => setShowNewAdmin(false)}
                className="bg-gray-600 text-white px-4 py-2 rounded"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">E-Mail</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Rolle</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Letzter Login</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-white">{admin.name}</td>
                  <td className="px-4 py-3 text-gray-300">{admin.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      admin.role === 'super_admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {admin.role === 'super_admin' ? 'Super Admin' : 'Moderator'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      admin.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {admin.is_active ? 'Aktiv' : 'Deaktiviert'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {admin.last_login_at
                      ? new Date(admin.last_login_at).toLocaleString('de-DE')
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-amber-400 hover:text-amber-300 mr-3">🔑</button>
                    <button className="text-red-400 hover:text-red-300">🚫</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* IP Whitelist */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">IP-Whitelist</h3>
          <button
            onClick={() => setShowNewIP(true)}
            className="bg-amber-500 text-black px-4 py-2 rounded-lg font-semibold"
          >
            ➕ IP hinzufügen
          </button>
        </div>

        {/* New IP form */}
        {showNewIP && (
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                placeholder="IP-Adresse"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white"
              />
              <input
                type="text"
                placeholder="Beschreibung (optional)"
                value={newIPDesc}
                onChange={(e) => setNewIPDesc(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-4 py-2 text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddIP}
                className="bg-green-500 text-white px-4 py-2 rounded"
              >
                Hinzufügen
              </button>
              <button
                onClick={() => setShowNewIP(false)}
                className="bg-gray-600 text-white px-4 py-2 rounded"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">IP-Adresse</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Beschreibung</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Erstellt</th>
                <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {ips.map((ip) => (
                <tr key={ip.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-white font-mono">{ip.ip}</td>
                  <td className="px-4 py-3 text-gray-300">{ip.description || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">
                    {new Date(ip.created_at).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-red-400 hover:text-red-300">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
