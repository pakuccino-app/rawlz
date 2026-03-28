// web-lobby/src/components/analytics/Heatmap.tsx
import React, { useEffect, useState } from 'react';
import { getHeatmap } from '../../lib/api';

interface HeatCell { citySize: string; geoType: string; total: number; yesPct: number; }

const CITY_SIZES = ['Metropole', 'Großstadt', 'Mittelstadt', 'Kleinstadt', 'Dorf'];
const GEO_TYPES = ['West', 'Ost', 'Nord', 'Süd', 'Mitte'];

function heatColor(pct: number): string {
  if (pct >= 70) return 'bg-emerald-500/70 text-white';
  if (pct >= 55) return 'bg-emerald-400/40 text-emerald-300';
  if (pct >= 45) return 'bg-gray-600 text-gray-300';
  if (pct >= 30) return 'bg-amber-500/40 text-amber-300';
  return 'bg-red-500/40 text-red-300';
}

export default function Heatmap() {
  const [data, setData] = useState<HeatCell[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHeatmap()
      .then(res => setData(res.data ?? []))
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  // Get unique axes from data
  const citySizes = [...new Set(data.map(d => d.citySize))];
  const geoTypes = [...new Set(data.map(d => d.geoType))];

  function getCell(cs: string, gt: string) {
    return data.find(d => d.citySize === cs && d.geoType === gt);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Geografische Heatmap</h2>
        <p className="text-gray-500 text-sm mt-1">Ja-Anteil nach Stadtgröße & Region · K-Anonymität ≥ 20</p>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && data.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center">
          <div className="text-gray-500">Keine Heatmap-Daten verfügbar</div>
          <div className="text-gray-600 text-sm mt-2">Nutzer müssen geo_city_size und geo_type in ihrem Profil angeben</div>
        </div>
      )}

      {!isLoading && !error && data.length > 0 && (
        <>
          {/* Legend */}
          <div className="flex items-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-500/70" /> ≥ 70% Ja</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-400/40" /> 55–70% Ja</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gray-600" /> 45–55% neutral</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-amber-500/40" /> 30–45% Ja</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-500/40" /> &lt; 30% Ja</div>
          </div>

          {/* Grid */}
          <div className="bg-gray-800 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-gray-500 text-xs p-2 font-normal">Stadtgröße → Region</th>
                  {geoTypes.map(gt => (
                    <th key={gt} className="text-center text-gray-400 p-2 font-medium text-xs whitespace-nowrap">{gt}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {citySizes.map(cs => (
                  <tr key={cs}>
                    <td className="text-gray-400 p-2 text-xs font-medium whitespace-nowrap">{cs}</td>
                    {geoTypes.map(gt => {
                      const cell = getCell(cs, gt);
                      return (
                        <td key={gt} className="p-1.5 text-center">
                          {cell ? (
                            <div className={`rounded-lg px-2 py-2.5 text-center ${heatColor(cell.yesPct)}`}>
                              <div className="font-bold text-sm">{cell.yesPct}%</div>
                              <div className="text-xs opacity-70">{cell.total}</div>
                            </div>
                          ) : (
                            <div className="rounded-lg px-2 py-2.5 bg-gray-700/30 text-gray-600 text-center">
                              <div className="text-sm">—</div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Raw data */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Stadtgröße</th>
                  <th className="text-left text-gray-400 px-4 py-3 font-medium">Region</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Stimmen</th>
                  <th className="text-right text-gray-400 px-4 py-3 font-medium">Ja %</th>
                </tr>
              </thead>
              <tbody>
                {data.sort((a, b) => b.total - a.total).map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-white">{item.citySize}</td>
                    <td className="px-4 py-3 text-gray-300">{item.geoType}</td>
                    <td className="px-4 py-3 text-gray-300 text-right">{item.total.toLocaleString('de-DE')}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: item.yesPct >= 50 ? '#10b981' : '#f59e0b' }}>
                      {item.yesPct}%
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
