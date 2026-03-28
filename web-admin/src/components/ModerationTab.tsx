// web-admin/src/components/ModerationTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface ModerationItem {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  priority: number;
  status: string;
  created_at: string;
}

export default function ModerationTab() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_moderation_queue');
      setItems(result.items || []);
    } catch (err) {
      console.error('Load moderation error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResolve(itemId: string, resolution: string) {
    try {
      await adminApi('resolve_moderation', { itemId, resolution });
      loadItems();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const priorityLabel = (p: number) => p === 1 ? '🔴 Hoch' : p === 2 ? '🟡 Mittel' : '🟢 Niedrig';

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Moderation Queue</h2>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Typ</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Grund</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Priorität</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Erstellt</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Laden...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Keine Einträge</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-700/50">
                <td className="px-4 py-3 text-white">{item.entity_type}</td>
                <td className="px-4 py-3 text-gray-300">{item.reason}</td>
                <td className="px-4 py-3">{priorityLabel(item.priority)}</td>
                <td className="px-4 py-3 text-gray-400 text-sm">
                  {new Date(item.created_at).toLocaleString('de-DE')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(item.id, 'approved')}
                      className="text-green-400 hover:text-green-300"
                    >
                      ✅
                    </button>
                    <button
                      onClick={() => handleResolve(item.id, 'rejected')}
                      className="text-red-400 hover:text-red-300"
                    >
                      🚫
                    </button>
                    <button className="text-blue-400 hover:text-blue-300">👁</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
