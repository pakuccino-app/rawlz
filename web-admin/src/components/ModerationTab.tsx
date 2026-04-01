// web-admin/src/components/ModerationTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface ModerationItem {
  id: string;
  entity_type: 'question' | 'user' | 'vote';
  entity_id: string;
  reason: string;
  priority: number;
  status: string;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
}

export default function ModerationTab() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setIsLoading(true);
    try {
      // Spec: Priorität 3/2/1 absteigend sortiert
      const result = await adminApi('get_moderation_queue', { sort: 'priority_desc' });
      setItems(result.items || []);
    } catch (err) {
      console.error('Load moderation error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Spec: Lösen (resolved=TRUE)
  async function handleResolve(itemId: string) {
    try {
      await adminApi('resolve_moderation', { itemId, resolution: 'resolved' });
      loadItems();
    } catch (err: any) { alert(err.message); }
  }

  // Spec: User sperren → admin_audit_log
  async function handleBanUser(item: ModerationItem) {
    if (!confirm(`User ${item.entity_id.slice(0, 8)}... wirklich sperren?`)) return;
    try {
      await adminApi('ban_user', { userId: item.entity_id, ban: true });
      await adminApi('resolve_moderation', { itemId: item.id, resolution: 'user_banned' });
      loadItems();
    } catch (err: any) { alert(err.message); }
  }

  // Spec: Frage sperren → admin_audit_log
  async function handleBlockQuestion(item: ModerationItem) {
    if (!confirm(`Frage ${item.entity_id.slice(0, 8)}... wirklich sperren?`)) return;
    try {
      await adminApi('block_question', { questionId: item.entity_id });
      await adminApi('resolve_moderation', { itemId: item.id, resolution: 'question_blocked' });
      loadItems();
    } catch (err: any) { alert(err.message); }
  }

  // Spec: Priorität 3/2/1 absteigend (3=hoch)
  const priorityLabel = (p: number) =>
    p === 3 ? <span className="text-red-400 font-semibold">🔴 Hoch</span> :
    p === 2 ? <span className="text-amber-400">🟡 Mittel</span> :
              <span className="text-green-400">🟢 Niedrig</span>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Moderation Queue</h2>
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              {/* Spec: entity_type | reason | priority | resolved | created_at */}
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Typ</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Grund</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Priorität</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Gelöst</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Erstellt</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Laden...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Keine Einträge</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={`hover:bg-gray-700/50 ${item.status === 'resolved' ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <span className="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs">{item.entity_type}</span>
                </td>
                <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{item.reason}</td>
                <td className="px-4 py-3">{priorityLabel(item.priority)}</td>
                {/* Spec: resolved column */}
                <td className="px-4 py-3 text-xs">
                  {item.status === 'resolved'
                    ? <span className="text-green-400">✅ {item.resolved_at ? new Date(item.resolved_at).toLocaleDateString('de-DE') : ''}</span>
                    : <span className="text-gray-500">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString('de-DE')}
                </td>
                <td className="px-4 py-3">
                  {item.status !== 'resolved' && (
                    <div className="flex gap-2">
                      {/* Spec: Lösen */}
                      <button onClick={() => handleResolve(item.id)}
                        className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded border border-green-400/30 hover:bg-green-400/10"
                        title="Lösen">✅ Lösen</button>
                      {/* Spec: User sperren */}
                      {item.entity_type === 'user' && (
                        <button onClick={() => handleBanUser(item)}
                          className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded border border-red-400/30 hover:bg-red-400/10"
                          title="User sperren">🚫 User</button>
                      )}
                      {/* Spec: Frage sperren */}
                      {item.entity_type === 'question' && (
                        <button onClick={() => handleBlockQuestion(item)}
                          className="text-orange-400 hover:text-orange-300 text-xs px-2 py-1 rounded border border-orange-400/30 hover:bg-orange-400/10"
                          title="Frage sperren">🔒 Frage</button>
                      )}
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
