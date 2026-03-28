// web-lobby/src/components/analytics/VergleichOverlay.tsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getComparison } from '../../lib/api';

interface CompItem {
  id: string;
  word: string;
  allVoters: { total: number; yesPct: number };
  verifiedVoters?: { total: number; yesPct: number; delta: number };
}

export default function VergleichOverlay() {
  const [data, setData] = useState<CompItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getComparison({ limit: 30 })
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  // Show only items where verified data exists
  const withVerified = data.filter(d => d.verifiedVoters);

  const chartData = withVerified.slice(0, 15).map(d => ({
    name: d.word.length > 14 ? d.word.slice(0, 12) + '…' : d.word,
    'Alle Ja %': d.allVoters.yesPct,
    'Verified Ja %': d.verifiedVoters?.yesPct ?? 0,
    delta: d.verifiedVoters?.delta ?? 0,
  }));

  function deltaColor(delta: number) {
    if (delta > 5) return 'text-emerald-400';
    if (delta < -5) return 'text-red-400';
    return 'text-gray-400';
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Vergleich mit Verified-Overlay</h2>
        <p className="text-gray-500 text-sm mt-1">
          Alle Stimmen vs. verifizierte Stimmen (Trust ≥ 80) · K-Anonymität ≥ 20
        </p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-white">{data.length}</div>
              <div className="text-gray-500 text-sm mt-1">Fragen gesamt</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-emerald-400">{withVerified.length}</div>
              <div className="text-gray-500 text-sm mt-1">Mit Verified-Daten</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-amber-400">
                {withVerified.length > 0
                  ? (withVerified.reduce((s, d) => s + Math.abs(d.verifiedVoters!.delta), 0) / withVerified.length).toFixed(1)
                  : '—'}
              </div>
              <div className="text-gray-500 text-sm mt-1">Ø Δ (Abweichung)</div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">
                Alle vs. Verified – Ja %
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} margin={{ bottom: 55 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-40} textAnchor="end" interval={0} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: any) => `${v}%`}
                  />
                  <Legend wrapperStyle={{ paddingTop: 16, color: '#9ca3af', fontSize: 12 }} />
                  <Bar dataKey="Alle Ja %" fill="#374151" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Verified Ja %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Frage</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Alle (n)</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Alle Ja %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Verified (n)</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Verified Ja %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.allVoters.total.toLocaleString('de-DE')}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.allVoters.yesPct}%</td>
                    <td className="px-4 py-3 text-gray-300 text-right">
                      {item.verifiedVoters?.total.toLocaleString('de-DE') ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-amber-400 text-right font-semibold">
                      {item.verifiedVoters?.yesPct != null ? `${item.verifiedVoters.yesPct}%` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${deltaColor(item.verifiedVoters?.delta ?? 0)}`}>
                      {item.verifiedVoters?.delta != null
                        ? `${item.verifiedVoters.delta > 0 ? '+' : ''}${item.verifiedVoters.delta}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
