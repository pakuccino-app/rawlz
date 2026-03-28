// web-lobby/src/components/analytics/VorschlagsAnalyse.tsx
import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getSuggestions } from '../../lib/api';

interface SuggestionItem {
  id: string;
  word: string;
  submissionCount: number;
  status: string;
  language: string;
  notificationSubscribers: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  active: '#10b981',
  blocked: '#ef4444',
  archived: '#6b7280',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  active: 'Aktiv',
  blocked: 'Gesperrt',
  archived: 'Archiviert',
};

export default function VorschlagsAnalyse() {
  const [data, setData] = useState<SuggestionItem[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});
  const [recentCount, setRecentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => { load(); }, [page]);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getSuggestions({ page, limit: 30 });
      setData(res.data ?? []);
      setStatusBreakdown(res.statusBreakdown ?? {});
      setRecentCount(res.recentCount ?? 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  const pieData = Object.entries(statusBreakdown).map(([status, count]) => ({
    name: STATUS_LABELS[status] ?? status,
    value: count,
    status,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Vorschlags-Analyse</h2>
        <p className="text-gray-500 text-sm mt-1">Eingereichte Fragen und deren Status</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-white">{data.length}</div>
              <div className="text-gray-500 text-sm mt-1">Vorschläge</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{recentCount}</div>
              <div className="text-gray-500 text-sm mt-1">Letzte 30 Tage</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-emerald-400">{statusBreakdown.active ?? 0}</div>
              <div className="text-gray-500 text-sm mt-1">Aktiv</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-gray-400">{statusBreakdown.pending ?? 0}</div>
              <div className="text-gray-500 text-sm mt-1">Ausstehend</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status pie */}
            {pieData.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Status-Verteilung</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                      formatter={(v: any) => [v, 'Fragen']}
                    />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top submissions */}
            <div className="bg-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Top Einreichungen</h3>
              <div className="space-y-2">
                {data.slice(0, 8).map(item => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="text-white font-medium truncate block">{item.word}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                      <span className="text-gray-500 text-xs">{item.notificationSubscribers} 🔔</span>
                      <span className="text-amber-400 font-semibold text-sm">{item.submissionCount}×</span>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[item.status] ?? '#6b7280' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Full table */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Frage</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Einreichungen</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Abonnenten</th>
                  <th className="text-center text-gray-400 px-4 py-3 font-medium">Sprache</th>
                  <th className="text-center text-gray-400 px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-amber-400 text-right font-semibold">{item.submissionCount}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.notificationSubscribers}</td>
                    <td className="px-4 py-3 text-gray-500 text-center text-xs uppercase">{item.language}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          backgroundColor: `${STATUS_COLORS[item.status]}20`,
                          color: STATUS_COLORS[item.status] ?? '#6b7280',
                        }}
                      >
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 text-sm bg-gray-800 rounded-lg text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              ← Zurück
            </button>
            <span className="text-sm text-gray-500">Seite {page + 1}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={data.length < 30}
              className="px-4 py-2 text-sm bg-gray-800 rounded-lg text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Weiter →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
