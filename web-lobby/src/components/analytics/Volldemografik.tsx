// web-lobby/src/components/analytics/Volldemografik.tsx
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getGoldData, getVolldemografik } from '../../lib/api';

interface Question { id: string; word: string; totalVotes: number; }
interface DemoEntry { value: string; yesPct: number; noPct: number; total: number; }
interface Breakdown { [field: string]: DemoEntry[]; }

const FIELD_LABELS: Record<string, string> = {
  age_group: 'Altersgruppe',
  gender: 'Geschlecht',
  education: 'Bildung',
  political_lean: 'Politische Tendenz',
  geo_city_size: 'Stadtgröße',
  geo_type: 'Geographischer Typ',
};

export default function Volldemografik() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [breakdown, setBreakdown] = useState<Breakdown>({});
  const [questionInfo, setQuestionInfo] = useState<{ word: string; total: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGoldData({ limit: 30 }).then(res => setQuestions(res.data ?? []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setIsLoading(true);
    setError(null);
    getVolldemografik(selectedId)
      .then(res => {
        setBreakdown(res.breakdown ?? {});
        setQuestionInfo(res.question ? { word: res.question.word, total: res.question.total } : null);
      })
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Volldemografik</h2>
        <p className="text-gray-500 text-sm mt-1">Demografische Aufschlüsselung pro Frage · K-Anonymität ≥ 20</p>
      </div>

      {/* Question selector */}
      <div className="bg-gray-800 rounded-xl p-5">
        <label className="block text-sm text-gray-400 mb-2">Frage auswählen</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
        >
          <option value="">— Frage wählen —</option>
          {questions.map(q => (
            <option key={q.id} value={q.id}>
              {q.word} ({q.totalVotes.toLocaleString('de-DE')} Stimmen)
            </option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-gray-500 text-center py-12">Laden...</div>}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>}

      {!isLoading && !error && questionInfo && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3">
            <span className="text-amber-400 font-semibold">{questionInfo.word}</span>
            <span className="text-gray-500 ml-3 text-sm">{questionInfo.total.toLocaleString('de-DE')} Stimmen gesamt</span>
          </div>

          {Object.keys(FIELD_LABELS).map(field => {
            const entries = breakdown[field];
            if (!entries?.length) return null;
            const chartData = entries.map(e => ({ name: e.value, 'Ja %': e.yesPct, 'Nein %': e.noPct, total: e.total }));

            return (
              <div key={field} className="bg-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">
                  {FIELD_LABELS[field]}
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} angle={-30} textAnchor="end" interval={0} />
                    <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                      formatter={(v: any, n: string) => [`${v}%`, n]}
                    />
                    <Bar dataKey="Ja %" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Nein %" fill="#374151" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {entries.map(e => (
                    <div key={e.value} className="bg-gray-700/50 rounded-lg px-3 py-2 text-xs">
                      <div className="text-gray-300 font-medium truncate">{e.value}</div>
                      <div className="text-amber-400 mt-0.5">{e.yesPct}% Ja · {e.total} Stimmen</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {Object.keys(breakdown).length === 0 && (
            <div className="text-gray-500 text-center py-8">
              Keine demografischen Daten mit ≥ 20 Stimmen pro Gruppe
            </div>
          )}
        </div>
      )}
    </div>
  );
}
