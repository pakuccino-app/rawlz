// web-admin/src/components/AnalyticsTab.tsx
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalyticsTabProps {
  isSuperAdmin: boolean;
}

interface Analytics {
  dau: number;
  mau: number;
  totalVotes: number;
  totalQuestions: number;
  supporterRevenue?: number;
  lobbyRevenue?: number;
}

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

export default function AnalyticsTab({ isSuperAdmin }: AnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setIsLoading(true);
    try {
      const result = await adminApi('get_analytics');
      setAnalytics(result.analytics);
    } catch (err) {
      console.error('Load analytics error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return <div className="text-gray-400 text-center py-8">Laden...</div>;
  }

  if (!analytics) {
    return <div className="text-gray-400 text-center py-8">Keine Daten</div>;
  }

  // Sample trend data
  const trendData = Array.from({ length: 30 }, (_, i) => ({
    day: `Tag ${i + 1}`,
    dau: Math.floor(Math.random() * 500) + 100,
    votes: Math.floor(Math.random() * 2000) + 500,
  }));

  const membershipData = [
    { name: 'Basis', value: 850 },
    { name: 'Supporter', value: 120 },
    { name: 'Experte', value: 25 },
    { name: 'Lobby', value: 5 },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">Analytics</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">DAU</div>
          <div className="text-3xl font-bold text-white">{analytics.dau?.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">MAU</div>
          <div className="text-3xl font-bold text-white">{analytics.mau?.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Stimmen gesamt</div>
          <div className="text-3xl font-bold text-white">{analytics.totalVotes?.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-gray-400 text-sm mb-2">Aktive Fragen</div>
          <div className="text-3xl font-bold text-white">{analytics.totalQuestions?.toLocaleString()}</div>
        </div>
      </div>

      {/* Revenue (Super Admin only) */}
      {isSuperAdmin && analytics.supporterRevenue !== undefined && (
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-lg p-6">
            <div className="text-amber-400 text-sm mb-2">Supporter Revenue</div>
            <div className="text-3xl font-bold text-white">€{analytics.supporterRevenue?.toLocaleString()}</div>
          </div>
          <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-lg p-6">
            <div className="text-blue-400 text-sm mb-2">Lobby Revenue</div>
            <div className="text-3xl font-bold text-white">€{analytics.lobbyRevenue?.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* DAU/MAU Trend */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">DAU Trend (30 Tage)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={10} />
              <YAxis stroke="#9ca3af" fontSize={10} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                labelStyle={{ color: '#fff' }}
              />
              <Line type="monotone" dataKey="dau" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Membership distribution */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Mitgliedschaftsverteilung</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={membershipData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {membershipData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
