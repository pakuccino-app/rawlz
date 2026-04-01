// web-lobby/src/pages/dashboard.tsx
// B2B Lobby Dashboard – vollständig mit Auth-Guard, Sidebar, StatusBanner + 13 Modulen

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { supabase, signOut } from '../lib/supabase';
import Sidebar, { AnalyticsModule } from '../components/Sidebar';
import StatusBanner from '../components/StatusBanner';

import GoldDaten from '../components/analytics/GoldDaten';
import Apathie from '../components/analytics/Apathie';
import MindShift from '../components/analytics/MindShift';
import Divergenz from '../components/analytics/Divergenz';
import Volldemografik from '../components/analytics/Volldemografik';
import FeedModus from '../components/analytics/FeedModus';
import StadtLand from '../components/analytics/StadtLand';
import Heatmap from '../components/analytics/Heatmap';
import Zeitreihen from '../components/analytics/Zeitreihen';
import VergleichOverlay from '../components/analytics/VergleichOverlay';
import VorschlagsAnalyse from '../components/analytics/VorschlagsAnalyse';
import CsvExport from '../components/analytics/CsvExport';

const MODULE_TITLES: Record<AnalyticsModule, string> = {
  gold_data: 'Gold-Daten',
  apathy: 'Apathie-Index',
  mind_shift: 'Mind-Shift',
  divergenz: 'Divergenz',
  volldemografik: 'Volldemografik',
  feed_mode: 'Feed-Modus',
  city_rural: 'Stadt / Land',
  heatmap: 'Heatmap',
  timeseries: 'Zeitreihen',
  comparison: 'Vergleich + Verified',
  suggestions: 'Vorschlags-Analyse',
  csv_export: 'Daten-Export',
  pdf_report: 'PDF-Report',
  settings: 'Einstellungen',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState<AnalyticsModule>('gold_data');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate('/login');
      } else {
        setUserEmail(data.session.user.email ?? '');
        setIsAuthChecked(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate('/login');
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  if (!isAuthChecked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Authentifizierung...</div>
      </div>
    );
  }

  function renderModule() {
    switch (activeModule) {
      case 'gold_data':   return <GoldDaten />;
      case 'apathy':      return <Apathie />;
      case 'mind_shift':  return <MindShift />;
      case 'divergenz':   return <Divergenz />;
      case 'volldemografik': return <Volldemografik />;
      case 'feed_mode':   return <FeedModus />;
      case 'city_rural':  return <StadtLand />;
      case 'heatmap':     return <Heatmap />;
      case 'timeseries':  return <Zeitreihen />;
      case 'comparison':  return <VergleichOverlay />;
      case 'suggestions': return <VorschlagsAnalyse />;
      case 'csv_export':
      case 'pdf_report':  return <CsvExport />;
      case 'settings':    return null; // navigates to /settings via router
      default:            return null;
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* Status Banner */}
      <StatusBanner />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          active={activeModule}
          onSelect={m => {
            if (m === 'settings') { navigate('/settings'); return; }
            setActiveModule(m);
            setMobileMenuOpen(false);
          }}
          onLogout={handleLogout}
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar (mobile only) */}
          <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <Menu size={22} />
            </button>
            <span className="text-sm font-semibold text-white">{MODULE_TITLES[activeModule]}</span>
            <span className="text-xs text-gray-500 max-w-[120px] truncate">{userEmail}</span>
          </div>

          {/* Content area */}
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">
            {renderModule()}
          </main>
        </div>
      </div>
    </div>
  );
}
