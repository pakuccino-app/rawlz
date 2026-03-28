// web-lobby/src/components/analytics/Apathie.tsx
import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getApathy } from '../../lib/api';

interface ApathieItem {
  id: string;
  word: string;
  totalEncounters: number;
  voteRate: number;
  skipRate: number;
  apathyIndex: number;
}

export default function Apathie() {
  const [data, setData] = useState<ApathieItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getApathy({ limit: 30 })
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const chartData = data.slice(0, 15).map(d => ({
    name: d.word.length > 14 ? d.word.slice(0, 12) + '…' : d.word,
    'Abstimmungsrate %': d.voteRate,
    'Skip-Rate %': d.skipRate,
  }));

  const avgApathy = data.length ? Math.round(data.reduce((s, d) => s + d.apathyIndex, 0) / data.length) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Apathie-Index</h2>
        <p className="text-gray-500 text-sm mt-1">Anteil der Nutzer, die eine Frage übersprungen haben</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-white">{data.length}</div>
              <div className="text-gray-500 text-sm mt-1">Fragen analysiert</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-amber-400">{avgApathy}%</div>
              <div className="text-gray-500 text-sm mt-1">Ø Apathie-Index</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-5 text-center">
              <div className="text-3xl font-bold text-emerald-400">
                {data.length ? Math.round(data.reduce((s, d) => s + d.voteRate, 0) / data.length) : 0}%
              </div>
              <div className="text-gray-500 text-sm mt-1">Ø Abstimmungsrate</div>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Abstimmungsrate vs. Skip-Rate</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ bottom: 55 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-40} textAnchor="end" interval={0} />
                <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v: any) => `${v}%`}
                />
                <Bar dataKey="Abstimmungsrate %" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Skip-Rate %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table sorted by apathy */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Frage</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Begegnungen</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Abstimmung %</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Apathie %</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{item.word}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.totalEncounters.toLocaleString('de-DE')}</td>
                    <td className="px-4 py-3 text-emerald-400 text-right font-semibold">{item.voteRate}%</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <span className={item.apathyIndex > 50 ? 'text-red-400' : item.apathyIndex > 30 ? 'text-amber-400' : 'text-gray-400'}>
                        {item.apathyIndex}%
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
