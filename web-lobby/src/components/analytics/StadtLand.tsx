// web-lobby/src/components/analytics/StadtLand.tsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getCityRural } from '../../lib/api';

interface CityItem { citySize: string; total: number; yesPct: number; }
interface GeoItem { geoType: string; total: number; yesPct: number; }

export default function StadtLand() {
  const [citySize, setCitySize] = useState<CityItem[]>([]);
  const [geoType, setGeoType] = useState<GeoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCityRural()
      .then(res => {
        setCitySize(res.citySize ?? []);
        setGeoType(res.geoType ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const citySizeChart = citySize.map(d => ({
    name: d.citySize,
    'Ja %': d.yesPct,
    'Nein %': 100 - d.yesPct,
    Stimmen: d.total,
  }));

  const geoTypeChart = geoType.map(d => ({
    name: d.geoType,
    'Ja %': d.yesPct,
    Stimmen: d.total,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Stadt / Land</h2>
        <p className="text-gray-500 text-sm mt-1">Geografische Verteilung der Abstimmenden · K-Anonymität ≥ 20</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && (
        <div className="space-y-6">
          {/* City size chart */}
          {citySizeChart.length > 0 ? (
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Nach Stadtgröße</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={citySizeChart} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: any, n: string) => [n === 'Stimmen' ? v.toLocaleString('de-DE') : `${v}%`, n]}
                  />
                  <Legend wrapperStyle={{ paddingTop: 16, color: '#9ca3af', fontSize: 12 }} />
                  <Bar dataKey="Ja %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Nein %" fill="#374151" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-6 text-gray-500 text-center">Keine Stadtgröße-Daten</div>
          )}

          {/* Geo type chart */}
          {geoTypeChart.length > 0 ? (
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Nach Region</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={geoTypeChart} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-30} textAnchor="end" interval={0} />
                  <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(v: any, n: string) => [n === 'Stimmen' ? v.toLocaleString('de-DE') : `${v}%`, n]}
                  />
                  <Bar dataKey="Ja %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl p-6 text-gray-500 text-center">Keine Regions-Daten</div>
          )}
        </div>
      )}
    </div>
  );
}
