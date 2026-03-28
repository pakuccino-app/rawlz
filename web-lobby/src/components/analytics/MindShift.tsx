// web-lobby/src/components/analytics/MindShift.tsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getMindShift } from '../../lib/api';

interface MindItem {
  id: string;
  word: string;
  totalChanges: number;
  yesToNo: number;
  noToYes: number;
  changeRatePct: number;
  trend: string;
}

export default function MindShift() {
  const [data, setData] = useState<MindItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMindShift()
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const chartData = data.slice(0, 12).map(d => ({
    name: d.word.length > 14 ? d.word.slice(0, 12) + '…' : d.word,
    'Ja → Nein': d.yesToNo,
    'Nein → Ja': d.noToYes,
  }));

  function trendColor(trend: string) {
    if (trend === 'richtung_nein') return 'text-red-400';
    if (trend === 'richtung_ja') return 'text-emerald-400';
    return 'text-gray-400';
  }

  function trendLabel(trend: string) {
    if (trend === 'richtung_nein') return '↓ Richtung Nein';
    if (trend === 'richtung_ja') return '↑ Richtung Ja';
    return '↔ Ausgeglichen';
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Mind-Shift</h2>
        <p className="text-gray-500 text-sm mt-1">Nutzer die ihre Meinung geändert haben · K-Anonymität ≥ 20 Änderungen</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && data.length === 0 && (
        <div className="text-gray-500 text-center py-12">Keine Mind-Shift Daten im gewählten Zeitraum</div>
      )}

      {!isLoading && !error && data.length > 0 && (
        <>
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Stimmungsänderungen pro Frage</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ bottom: 55 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-40} textAnchor="end" interval={0} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ paddingTop: 16, color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="Ja → Nein" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Nein → Ja" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Frage</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Ges. Änderungen</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Ja → Nein</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Nein → Ja</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Änderungsrate</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.totalChanges}</td>
                    <td className="px-4 py-3 text-red-400 text-right">{item.yesToNo}</td>
                    <td className="px-4 py-3 text-emerald-400 text-right">{item.noToYes}</td>
                    <td className="px-4 py-3 text-amber-400 text-right font-semibold">{item.changeRatePct}%</td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold ${trendColor(item.trend)}`}>
                      {trendLabel(item.trend)}
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
