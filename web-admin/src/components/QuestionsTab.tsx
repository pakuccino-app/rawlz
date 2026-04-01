// web-admin/src/components/QuestionsTab.tsx
// Questions Queue — exakt nach Spec

import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface Question {
  id: string;
  word: string;
  status: 'pending' | 'active' | 'blocked' | 'archived';
  submission_count: number;
  notification_subscribers: number;
  abuse_report_count: number;
  geo_scope: string;
  language_code: string;
  created_at: string;
  axis_x?: number;
  axis_y?: number;
}

export default function QuestionsTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  // Spec: Filter: status, language, geo_scope
  const [statusFilter, setStatusFilter] = useState('pending');
  const [languageFilter, setLanguageFilter] = useState('');
  const [geoFilter, setGeoFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingAxes, setEditingAxes] = useState<string | null>(null);
  const [axisX, setAxisX] = useState('0');
  const [axisY, setAxisY] = useState('0');

  useEffect(() => {
    loadQuestions();
  }, [statusFilter, languageFilter, geoFilter]);

  async function loadQuestions() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_questions', {
        status: statusFilter || undefined,
        language: languageFilter || undefined,
        geo_scope: geoFilter || undefined,
        sort: 'submission_count_desc', // Spec: Sort submission_count DESC
      });
      setQuestions(result.questions || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error('Load questions error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleActivate(questionId: string) {
    try {
      // Spec: EF activate-question-notify + EF tag-question
      await adminApi('activate_question', { questionId });
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleBlock(questionId: string) {
    try {
      await adminApi('block_question', { questionId });
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Spec: 📦 Archivieren
  async function handleArchive(questionId: string) {
    try {
      await adminApi('archive_question', { questionId });
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  // Spec: Bulk freischalten
  async function handleBulkActivate() {
    for (const id of selected) {
      await handleActivate(id);
    }
    setSelected(new Set());
  }

  // Spec: Bulk sperren
  async function handleBulkBlock() {
    for (const id of selected) {
      await handleBlock(id);
    }
    setSelected(new Set());
  }

  async function handleSetAxes(questionId: string) {
    try {
      await adminApi('set_question_axes', {
        questionId,
        axisX: parseFloat(axisX),
        axisY: parseFloat(axisY),
      });
      setEditingAxes(null);
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelected(newSelected);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Fragen ({total})</h2>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Spec: Filter status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Alle Status</option>
            <option value="pending">Ausstehend</option>
            <option value="active">Aktiv</option>
            <option value="blocked">Gesperrt</option>
            <option value="archived">Archiviert</option>
          </select>

          {/* Spec: Filter language */}
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Alle Sprachen</option>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>

          {/* Spec: Filter geo_scope */}
          <select
            value={geoFilter}
            onChange={(e) => setGeoFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="">Alle Regionen</option>
            <option value="global">Global</option>
            <option value="country">Land</option>
            <option value="region">Region</option>
          </select>

          {/* Spec: Bulk Aktionen */}
          {selected.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={handleBulkActivate}
                className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-2 rounded-lg text-sm hover:bg-green-500/30"
              >
                ✅ {selected.size} freischalten
              </button>
              <button
                onClick={handleBulkBlock}
                className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-2 rounded-lg text-sm hover:bg-red-500/30"
              >
                🚫 {selected.size} sperren
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spec: Tabelle: word | status | submission_count | notification_subscribers | abuse_reports | geo_scope | created_at */}
      <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(questions.map((q) => q.id)) : new Set())
                  }
                  className="rounded"
                />
              </th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Wort</th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Status</th>
              <th className="px-3 py-3 text-right text-xs text-gray-400 uppercase">Einreichungen</th>
              <th className="px-3 py-3 text-right text-xs text-gray-400 uppercase">Abonnenten</th>
              <th className="px-3 py-3 text-right text-xs text-gray-400 uppercase">Meldungen</th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Geo</th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Erstellt</th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Achsen</th>
              <th className="px-3 py-3 text-left text-xs text-gray-400 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">Laden...</td>
              </tr>
            ) : questions.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">Keine Fragen gefunden</td>
              </tr>
            ) : (
              questions.map((q) => (
                <tr key={q.id} className={`hover:bg-gray-700/50 ${selected.has(q.id) ? 'bg-amber-500/5' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => toggleSelect(q.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-3 text-white font-medium">{q.word}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      q.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      q.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      q.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>{q.status}</span>
                  </td>
                  <td className="px-3 py-3 text-gray-300 text-right">{q.submission_count}</td>
                  <td className="px-3 py-3 text-gray-300 text-right">{q.notification_subscribers}</td>
                  <td className="px-3 py-3 text-right">
                    {q.abuse_report_count > 0
                      ? <span className="text-red-400 font-semibold">{q.abuse_report_count}</span>
                      : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-400 text-xs">{q.geo_scope}</td>
                  {/* Spec: created_at column */}
                  <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(q.created_at).toLocaleDateString('de-DE')}
                  </td>
                  <td className="px-3 py-3">
                    {editingAxes === q.id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" step="0.1" min="-1" max="1" value={axisX}
                          onChange={(e) => setAxisX(e.target.value)}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white text-xs" placeholder="X" />
                        <input type="number" step="0.1" min="-1" max="1" value={axisY}
                          onChange={(e) => setAxisY(e.target.value)}
                          className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white text-xs" placeholder="Y" />
                        <button onClick={() => handleSetAxes(q.id)} className="text-green-400 text-xs px-1">✓</button>
                        <button onClick={() => setEditingAxes(null)} className="text-red-400 text-xs px-1">✗</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingAxes(q.id); setAxisX(q.axis_x?.toString() || '0'); setAxisY(q.axis_y?.toString() || '0'); }}
                        className="text-gray-400 hover:text-white text-xs"
                      >
                        {q.axis_x != null ? `(${q.axis_x},${q.axis_y})` : '✏️ Setzen'}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {q.status === 'pending' && (
                        <button onClick={() => handleActivate(q.id)} className="text-green-400 hover:text-green-300" title="Freischalten">✅</button>
                      )}
                      {q.status !== 'blocked' && (
                        <button onClick={() => handleBlock(q.id)} className="text-red-400 hover:text-red-300" title="Sperren">🚫</button>
                      )}
                      {/* Spec: 📦 Archivieren */}
                      {q.status !== 'archived' && (
                        <button onClick={() => handleArchive(q.id)} className="text-gray-400 hover:text-gray-200" title="Archivieren">📦</button>
                      )}
                      {/* Spec: 👁 Vorschau */}
                      <button className="text-blue-400 hover:text-blue-300" title="Vorschau" onClick={() => window.open(`https://rawlz.app/?preview=${q.id}`, '_blank')}>👁</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
