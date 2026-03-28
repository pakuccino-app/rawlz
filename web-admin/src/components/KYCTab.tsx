// web-admin/src/components/KYCTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface LobbyAccount {
  id: string;
  user_id: string;
  account_type: 'commercial' | 'subsidized';
  company_name?: string;
  subsidy_org_type?: string;
  trade_register_no: string;
  contact_email: string;
  contact_name: string;
  subsidy_reason?: string;
  subsidy_proof_url?: string;
  kyc_status: string;
  created_at: string;
  subsidy_valid_until?: string;
}

export default function KYCTab() {
  const [activeSubTab, setActiveSubTab] = useState<'commercial' | 'subsidized'>('commercial');
  const [accounts, setAccounts] = useState<LobbyAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<LobbyAccount | null>(null);
  const [approvalAmount, setApprovalAmount] = useState('0');
  const [validUntil, setValidUntil] = useState('');

  useEffect(() => {
    loadAccounts();
  }, [activeSubTab]);

  async function loadAccounts() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_kyc_queue', { accountType: activeSubTab });
      setAccounts(result.accounts || []);
    } catch (err) {
      console.error('Load KYC error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function daysUntilExpiry(date?: string) {
    if (!date) return null;
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">KYC Queue</h2>

      {/* Sub-tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveSubTab('commercial')}
          className={`px-4 py-2 rounded-lg ${
            activeSubTab === 'commercial'
              ? 'bg-amber-500 text-black'
              : 'bg-gray-700 text-gray-300'
          }`}
        >
          Kommerziell
        </button>
        <button
          onClick={() => setActiveSubTab('subsidized')}
          className={`px-4 py-2 rounded-lg ${
            activeSubTab === 'subsidized'
              ? 'bg-amber-500 text-black'
              : 'bg-gray-700 text-gray-300'
          }`}
        >
          Förderanträge
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-gray-800 rounded-lg p-4">
          {isLoading ? (
            <div className="text-gray-400 text-center py-8">Laden...</div>
          ) : accounts.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Keine Anträge</div>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => {
                const days = daysUntilExpiry(acc.subsidy_valid_until);
                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccount(acc)}
                    className={`p-4 rounded-lg cursor-pointer transition ${
                      selectedAccount?.id === acc.id
                        ? 'bg-amber-500/20 border border-amber-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">
                        {acc.company_name || acc.subsidy_org_type || acc.contact_name}
                      </span>
                      {days !== null && days < 30 && (
                        <span className="text-amber-400 text-xs">
                          ⚠️ Läuft ab in {days} Tagen
                        </span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm">{acc.contact_email}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-gray-800 rounded-lg p-6">
          {selectedAccount ? (
            <div>
              <h3 className="text-xl font-bold text-white mb-4">
                {selectedAccount.company_name || selectedAccount.subsidy_org_type}
              </h3>

              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-gray-400 text-sm">Typ:</span>
                  <p className="text-white">{selectedAccount.account_type}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Registernummer:</span>
                  <p className="text-white">{selectedAccount.trade_register_no}</p>
                </div>
                <div>
                  <span className="text-gray-400 text-sm">Kontakt:</span>
                  <p className="text-white">{selectedAccount.contact_name}</p>
                  <p className="text-gray-300">{selectedAccount.contact_email}</p>
                </div>
                {selectedAccount.subsidy_reason && (
                  <div>
                    <span className="text-gray-400 text-sm">Begründung:</span>
                    <p className="text-white">{selectedAccount.subsidy_reason}</p>
                  </div>
                )}
                {selectedAccount.subsidy_proof_url && (
                  <div>
                    <span className="text-gray-400 text-sm">Nachweis:</span>
                    <a
                      href={selectedAccount.subsidy_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline block"
                    >
                      {selectedAccount.subsidy_proof_url}
                    </a>
                  </div>
                )}
              </div>

              {/* Actions for subsidized */}
              {activeSubTab === 'subsidized' && (
                <div className="border-t border-gray-700 pt-4 space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Betrag (€)</label>
                    <input
                      type="number"
                      min="0"
                      value={approvalAmount}
                      onChange={(e) => setApprovalAmount(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Gültig bis</label>
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button className="flex-1 bg-green-500 text-white py-2 rounded-lg">
                      ✅ Genehmigen
                    </button>
                    <button className="flex-1 bg-red-500 text-white py-2 rounded-lg">
                      ❌ Ablehnen
                    </button>
                  </div>
                </div>
              )}

              {/* Actions for commercial */}
              {activeSubTab === 'commercial' && (
                <div className="flex gap-3">
                  <button className="flex-1 bg-green-500 text-white py-2 rounded-lg">
                    ✅ KYC bestätigen
                  </button>
                  <button className="flex-1 bg-red-500 text-white py-2 rounded-lg">
                    🚫 Zugang sperren
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 text-center py-8">
              Wähle einen Antrag aus
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
