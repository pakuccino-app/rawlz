// web-lobby/src/components/Sidebar.tsx

import React from 'react';
import {
  BarChart3, TrendingDown, RefreshCw, Zap,
  Users, Layers, MapPin, Map, LineChart,
  GitCompare, MessageSquare, Download, FileText,
  LogOut, X,
} from 'lucide-react';

export type AnalyticsModule =
  | 'gold_data'
  | 'apathy'
  | 'mind_shift'
  | 'divergenz'
  | 'volldemografik'
  | 'feed_mode'
  | 'city_rural'
  | 'heatmap'
  | 'timeseries'
  | 'comparison'
  | 'suggestions'
  | 'csv_export'
  | 'pdf_report';

const NAV: { id: AnalyticsModule; label: string; icon: React.FC<any> }[] = [
  { id: 'gold_data', label: 'Gold-Daten', icon: BarChart3 },
  { id: 'apathy', label: 'Apathie-Index', icon: TrendingDown },
  { id: 'mind_shift', label: 'Mind-Shift', icon: RefreshCw },
  { id: 'divergenz', label: 'Divergenz', icon: Zap },
  { id: 'volldemografik', label: 'Volldemografik', icon: Users },
  { id: 'feed_mode', label: 'Feed-Modus', icon: Layers },
  { id: 'city_rural', label: 'Stadt / Land', icon: MapPin },
  { id: 'heatmap', label: 'Heatmap', icon: Map },
  { id: 'timeseries', label: 'Zeitreihen', icon: LineChart },
  { id: 'comparison', label: 'Vergleich + Verified', icon: GitCompare },
  { id: 'suggestions', label: 'Vorschlags-Analyse', icon: MessageSquare },
  { id: 'csv_export', label: 'CSV-Export', icon: Download },
  { id: 'pdf_report', label: 'PDF-Report', icon: FileText },
];

interface SidebarProps {
  active: AnalyticsModule;
  onSelect: (m: AnalyticsModule) => void;
  onLogout: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ active, onSelect, onLogout, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-64 bg-gray-900 border-r border-gray-800
          flex flex-col transform transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">#RAWLZ</h1>
            <p className="text-amber-400 text-xs font-medium mt-0.5">Lobby Dashboard</p>
          </div>
          <button
            onClick={onMobileClose}
            className="lg:hidden text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onSelect(id); onMobileClose?.(); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all
                ${active === id
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'
                }
              `}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={16} />
            <span>Abmelden</span>
          </button>
        </div>
      </aside>
    </>
  );
}
