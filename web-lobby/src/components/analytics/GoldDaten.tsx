// web-lobby/src/components/analytics/GoldDaten.tsx
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { getGoldData } from '../../lib/api';

interface GoldItem {
  id: string;
  word: string;
  totalVotes: number;
  yesPct: number;
  noPct: number;
  verifiedYesPct?: number;
  verifiedNoPct?: number;
  verifiedTotal?: number;
}

export default function GoldDaten() {
  const [data, setData] = useState<GoldItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => { load(); }, [page]);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getGoldData({ page, limit: 20 });
      setData(res.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  const chartData = data.slice(0, 15).map(d => ({
    name: d.word.length > 18 ? d.word.slice(0, 16) + '…' : d.word,
    'Alle Ja %': d.yesPct,
    'Alle Nein %': d.noPct,
    ...(d.verifiedYesPct != null ? { 'Verified Ja %': d.verifiedYesPct } : {}),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Gold-Daten</h2>
        <p className="text-gray-500 text-sm mt-1">
          Abstimmungsergebnisse aller aktiven Fragen · K-Anonymität ≥ 20
        </p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <>
          {/* Bar chart */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Übersicht – Top 15</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 60, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="name"
                  stroke="#9ca3af"
                  fontSize={11}
                  angle={-40}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(v: any) => `${v}%`}
                />
                <Legend wrapperStyle={{ paddingTop: 16, color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="Alle Ja %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Alle Nein %" fill="#374151" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Verified Ja %" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Frage</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Stimmen</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Ja %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Nein %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Verified Ja %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Verified Ges.</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.totalVotes.toLocaleString('de-DE')}</td>
                    <td className="px-4 py-3 text-amber-400 text-right font-semibold">{item.yesPct}%</td>
                    <td className="px-4 py-3 text-gray-400 text-right">{item.noPct}%</td>
                    <td className="px-4 py-3 text-emerald-400 text-right">
                      {item.verifiedYesPct != null ? `${item.verifiedYesPct}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-right">
                      {item.verifiedTotal != null ? item.verifiedTotal.toLocaleString('de-DE') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
              disabled={data.length < 20}
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
