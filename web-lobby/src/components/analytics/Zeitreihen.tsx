// web-lobby/src/components/analytics/Zeitreihen.tsx
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getTimeseries, getGoldData } from '../../lib/api';

interface DataPoint { date: string; yesPct: number; total: number; }
interface Series { questionId: string; word: string; dataPoints: DataPoint[]; }
interface Question { id: string; word: string; totalVotes: number; }

const LINE_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];

export default function Zeitreihen() {
  const [series, setSeries] = useState<Series[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isQLoading, setIsQLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGoldData({ limit: 30 })
      .then(res => setQuestions(res.data ?? []))
      .finally(() => setIsQLoading(false));
    // Load default (top 5)
    loadTimeseries([]);
  }, []);

  async function loadTimeseries(ids: string[]) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getTimeseries({ questionIds: ids });
      setSeries(res.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  function toggleQuestion(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id].slice(0, 5);
    setSelectedIds(next);
    loadTimeseries(next);
  }

  // Merge all series into a single date-keyed array for multi-line chart
  const allDates = [...new Set(series.flatMap(s => s.dataPoints.map(p => p.date)))].sort();
  const mergedData = allDates.map(date => {
    const row: any = { date: date.split('T')[0] };
    series.forEach(s => {
      const pt = s.dataPoints.find(p => p.date === date);
      if (pt) row[s.word] = pt.yesPct;
    });
    return row;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Zeitreihen</h2>
        <p className="text-gray-500 text-sm mt-1">Entwicklung der Ja-Anteile über Zeit · Bis zu 5 Fragen gleichzeitig</p>
      </div>

      {/* Question selector */}
      {!isQLoading && (
        <div className="bg-gray-800 rounded-xl p-5">
          <p className="text-sm text-gray-400 mb-3">
            Fragen auswählen (max. 5) · {selectedIds.length === 0 ? 'Top 5 automatisch' : `${selectedIds.length} ausgewählt`}
          </p>
          <div className="flex flex-wrap gap-2">
            {questions.map(q => (
              <button
                key={q.id}
                onClick={() => toggleQuestion(q.id)}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${selectedIds.includes(q.id)
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-gray-700 text-gray-400 border border-transparent hover:bg-gray-600'
                  }
                `}
              >
                {q.word}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && series.length === 0 && (
        <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-500">
          Keine Zeitreihendaten verfügbar. Zeitreihendaten werden täglich gespeichert.
        </div>
      )}

      {!isLoading && !error && series.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wide">Ja-Anteil über Zeit</h3>
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={mergedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickFormatter={v => v.slice(5)} />
              <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v: any) => [`${v}%`, '']}
              />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              {series.map((s, idx) => (
                <Line
                  key={s.questionId}
                  type="monotone"
                  dataKey={s.word}
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
