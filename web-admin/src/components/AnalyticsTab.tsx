// web-admin/src/components/AnalyticsTab.tsx
// Spec: SUPER_ADMIN inkl. Revenue | MODERATOR ohne Revenue
import React, { useState, useEffect } from 'react';
import { adminApi } from '../lib/api';

interface AnalyticsTabProps {
  isSuperAdmin: boolean;
}

interface Analytics {
  dau: number;
  mau: number;
  totalVotes: number;
  totalQuestions: number;
  activeQuestions: number;
  totalUsers: number;
  membershipBreakdown?: {
    basis: number;
    supporter: number;
    expert: number;
    lobby: number;
  };
  // Spec: nur SUPER_ADMIN
  supporterRevenue?: number;
  lobbyRevenue?: number;
}

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

  if (isLoading) return <div className="text-gray-400 text-center py-8">Laden...</div>;
  if (!analytics)  return <div className="text-gray-400 text-center py-8">Keine Daten</div>;

  const mb = analytics.membershipBreakdown;

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">In-House Analytics</h2>

      {/* Spec: Basis-Statistiken aus echter DB */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="DAU" value={analytics.dau.toLocaleString('de-DE')} />
        <StatCard label="MAU" value={analytics.mau.toLocaleString('de-DE')} />
        <StatCard label="Gesamt-User" value={(analytics.totalUsers ?? '—').toLocaleString('de-DE')} />
        <StatCard label="Gesamt-Votes" value={analytics.totalVotes.toLocaleString('de-DE')} />
        <StatCard label="Aktive Fragen" value={(analytics.activeQuestions ?? analytics.totalQuestions).toLocaleString('de-DE')} />
        <StatCard label="Fragen gesamt" value={analytics.totalQuestions.toLocaleString('de-DE')} />
      </div>

      {/* Mitgliedschaftsverteilung */}
      {mb && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Mitgliedschaftsverteilung</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MemberCard label="Basis" value={mb.basis} color="bg-gray-500" />
            <MemberCard label="Supporter" value={mb.supporter} color="bg-amber-500" />
            <MemberCard label="Experte" value={mb.expert} color="bg-blue-500" />
            <MemberCard label="Lobby" value={mb.lobby} color="bg-purple-500" />
          </div>
        </div>
      )}

      {/* Spec: Revenue nur für SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Revenue (Stripe)</h3>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Supporter-Revenue"
              value={`€ ${(analytics.supporterRevenue ?? 0).toFixed(2)}`}
            />
            <StatCard
              label="Lobby-Revenue"
              value={`€ ${(analytics.lobbyRevenue ?? 0).toFixed(2)}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-5 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-gray-400 text-sm mt-1">{label}</div>
    </div>
  );
}

function MemberCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-700 rounded-lg p-4 text-center">
      <div className={`w-3 h-3 rounded-full ${color} mx-auto mb-2`} />
      <div className="text-xl font-bold text-white">{value.toLocaleString('de-DE')}</div>
      <div className="text-gray-400 text-xs mt-1">{label}</div>
    </div>
  );
}
