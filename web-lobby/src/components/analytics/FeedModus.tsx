// web-lobby/src/components/analytics/FeedModus.tsx
import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getFeedMode } from '../../lib/api';

interface FeedItem { mode: string; count: number; label: string; }

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];

export default function FeedModus() {
  const [data, setData] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFeedMode()
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);

  const chartData = data.map(d => ({ name: d.label, value: d.count }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Feed-Modus</h2>
        <p className="text-gray-500 text-sm mt-1">Verteilung der Feed-Modi bei Fragebegegnungen · K-Anonymität ≥ 20</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && data.length === 0 && (
        <div className="text-gray-500 text-center py-12">Keine Feed-Modus-Daten verfügbar</div>
      )}

      {!isLoading && !error && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Verteilung</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  formatter={(v: any) => [v.toLocaleString('de-DE'), 'Begegnungen']}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats */}
          <div className="space-y-3">
            {data.map((item, idx) => (
              <div key={item.mode} className="bg-gray-800 rounded-xl p-4 flex items-center gap-4">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium">{item.label}</div>
                  <div className="text-gray-500 text-sm">{item.mode}</div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">{item.count.toLocaleString('de-DE')}</div>
                  <div className="text-gray-500 text-xs">
                    {total > 0 ? Math.round((item.count / total) * 100) : 0}%
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
              <span className="text-amber-400 font-medium">Gesamt</span>
              <span className="text-white font-bold">{total.toLocaleString('de-DE')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
