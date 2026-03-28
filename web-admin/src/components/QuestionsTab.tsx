// web-admin/src/components/QuestionsTab.tsx
// Questions Queue tab with filtering, sorting, and actions

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
  created_at: string;
  axis_x?: number;
  axis_y?: number;
}

export default function QuestionsTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingAxes, setEditingAxes] = useState<string | null>(null);
  const [axisX, setAxisX] = useState('0');
  const [axisY, setAxisY] = useState('0');

  useEffect(() => {
    loadQuestions();
  }, [statusFilter]);

  async function loadQuestions() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_questions', { status: statusFilter });
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

  async function handleBulkActivate() {
    for (const id of selected) {
      await handleActivate(id);
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
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Fragen ({total})</h2>
        
        <div className="flex items-center gap-4">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="pending">Ausstehend</option>
            <option value="active">Aktiv</option>
            <option value="blocked">Gesperrt</option>
            <option value="archived">Archiviert</option>
          </select>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <button
              onClick={handleBulkActivate}
              className="bg-green-500 text-white px-4 py-2 rounded-lg"
            >
              {selected.size} freischalten
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(new Set(questions.map(q => q.id)));
                    } else {
                      setSelected(new Set());
                    }
                  }}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Wort</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Einreichungen</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Abonnenten</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Meldungen</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Geo</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Achsen</th>
              <th className="px-4 py-3 text-left text-xs text-gray-400 uppercase">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  Laden...
                </td>
              </tr>
            ) : questions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                  Keine Fragen gefunden
                </td>
              </tr>
            ) : (
              questions.map((q) => (
                <tr key={q.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(q.id)}
                      onChange={() => toggleSelect(q.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3 text-white font-medium">{q.word}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
                      q.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      q.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                      q.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{q.submission_count}</td>
                  <td className="px-4 py-3 text-gray-300">{q.notification_subscribers}</td>
                  <td className="px-4 py-3">
                    {q.abuse_report_count > 0 ? (
                      <span className="text-red-400">{q.abuse_report_count}</span>
                    ) : (
                      <span className="text-gray-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">{q.geo_scope}</td>
                  <td className="px-4 py-3">
                    {editingAxes === q.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="-1"
                          max="1"
                          value={axisX}
                          onChange={(e) => setAxisX(e.target.value)}
                          className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                          placeholder="X"
                        />
                        <input
                          type="number"
                          step="0.1"
                          min="-1"
                          max="1"
                          value={axisY}
                          onChange={(e) => setAxisY(e.target.value)}
                          className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs"
                          placeholder="Y"
                        />
                        <button
                          onClick={() => handleSetAxes(q.id)}
                          className="text-green-400 text-xs"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingAxes(null)}
                          className="text-red-400 text-xs"
                        >
                          ✗
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingAxes(q.id);
                          setAxisX(q.axis_x?.toString() || '0');
                          setAxisY(q.axis_y?.toString() || '0');
                        }}
                        className="text-gray-400 hover:text-white text-xs"
                      >
                        {q.axis_x !== null ? `(${q.axis_x}, ${q.axis_y})` : '✏️ Setzen'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {q.status === 'pending' && (
                        <button
                          onClick={() => handleActivate(q.id)}
                          className="text-green-400 hover:text-green-300"
                          title="Freischalten"
                        >
                          ✅
                        </button>
                      )}
                      {q.status !== 'blocked' && (
                        <button
                          onClick={() => handleBlock(q.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Sperren"
                        >
                          🚫
                        </button>
                      )}
                      <button
                        className="text-blue-400 hover:text-blue-300"
                        title="Vorschau"
                      >
                        👁
                      </button>
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
