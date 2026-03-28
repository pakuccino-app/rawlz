// web-lobby/src/components/analytics/Divergenz.tsx
import React, { useEffect, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getDivergenz } from '../../lib/api';

interface DivergenzItem {
  id: string;
  word: string;
  totalVotes: number;
  yesPct: number;
  noPct: number;
  divergenzScore: number;
  label: string;
}

const LABEL_COLOR: Record<string, string> = {
  hoch: 'text-red-400 bg-red-400/10',
  mittel: 'text-amber-400 bg-amber-400/10',
  niedrig: 'text-emerald-400 bg-emerald-400/10',
};

export default function Divergenz() {
  const [data, setData] = useState<DivergenzItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDivergenz()
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const scatterData = data.map(d => ({ x: d.yesPct, y: d.divergenzScore, name: d.word, votes: d.totalVotes }));

  function scoreColor(score: number) {
    if (score > 80) return '#ef4444';
    if (score > 50) return '#f59e0b';
    return '#10b981';
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Divergenz-Analyse</h2>
        <p className="text-gray-500 text-sm mt-1">Polarisierungsgrad je Frage – 100 = vollständig gespalten</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4">
            {(['hoch', 'mittel', 'niedrig'] as const).map(l => (
              <div key={l} className="bg-gray-800 rounded-xl p-5 text-center">
                <div className="text-3xl font-bold text-white">
                  {data.filter(d => d.label === l).length}
                </div>
                <div className={`text-sm mt-1 capitalize ${LABEL_COLOR[l].split(' ')[0]}`}>
                  Divergenz: {l}
                </div>
              </div>
            ))}
          </div>

          {/* Scatter chart */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Ja-% vs. Divergenz-Score</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Ja %"
                  domain={[0, 100]}
                  stroke="#9ca3af"
                  fontSize={11}
                  tickFormatter={v => `${v}%`}
                  label={{ value: 'Ja %', position: 'insideBottom', offset: -5, fill: '#9ca3af', fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Divergenz"
                  domain={[0, 100]}
                  stroke="#9ca3af"
                  fontSize={11}
                  label={{ value: 'Divergenz', angle: -90, position: 'insideLeft', offset: 10, fill: '#9ca3af', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(value: any, name: string) => [`${value}${name === 'Ja %' ? '%' : ''}`, name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''}
                />
                <Scatter data={scatterData} fill="#f59e0b">
                  {scatterData.map((entry, idx) => (
                    <Cell key={idx} fill={scoreColor(entry.y)} />
                  ))}
                </Scatter>
              </ScatterChart>
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
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Divergenz-Score</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Level</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.totalVotes.toLocaleString('de-DE')}</td>
                    <td className="px-4 py-3 text-amber-400 text-right font-semibold">{item.yesPct}%</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: scoreColor(item.divergenzScore) }}>
                      {item.divergenzScore}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${LABEL_COLOR[item.label]}`}>
                        {item.label}
                      </span>
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
