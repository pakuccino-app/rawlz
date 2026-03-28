// web-admin/src/pages/Dashboard.tsx
// Main admin dashboard with tabs

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, adminLogout, getSessionToken } from '../lib/api';
import QuestionsTab from '../components/QuestionsTab';
import ModerationTab from '../components/ModerationTab';
import KYCTab from '../components/KYCTab';
import TrustScoreTab from '../components/TrustScoreTab';
import NominationsTab from '../components/NominationsTab';
import AnalyticsTab from '../components/AnalyticsTab';
import PushTab from '../components/PushTab';
import AdminUsersTab from '../components/AdminUsersTab';

const TABS = [
  { id: 'questions', label: 'Fragen', icon: '📋', roles: ['super_admin', 'moderator'] },
  { id: 'moderation', label: 'Moderation', icon: '🛡️', roles: ['super_admin', 'moderator'] },
  { id: 'kyc', label: 'KYC', icon: '🔐', roles: ['super_admin'] },
  { id: 'trust', label: 'Trust Score', icon: '⭐', roles: ['super_admin'] },
  { id: 'nominations', label: 'Experten', icon: '🏆', roles: ['super_admin', 'moderator'] },
  { id: 'analytics', label: 'Analytics', icon: '📊', roles: ['super_admin', 'moderator'] },
  { id: 'push', label: 'Push', icon: '🔔', roles: ['super_admin', 'moderator'] },
  { id: 'admins', label: 'Admins', icon: '👤', roles: ['super_admin'] },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('questions');
  const [adminRole, setAdminRole] = useState<string>('moderator');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check session
    const token = getSessionToken();
    if (!token) {
      navigate('/login');
      return;
    }

    // Get admin info
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const result = await adminApi('get_analytics', {});
      // If we have revenue data, user is super_admin
      if ('supporterRevenue' in (result.analytics || {})) {
        setAdminRole('super_admin');
      }
    } catch (err) {
      navigate('/login');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await adminLogout();
    navigate('/login');
  }

  const visibleTabs = TABS.filter(tab => tab.roles.includes(adminRole));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-white">#RAWLZ</h1>
          <p className="text-gray-400 text-sm">Admin Portal</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition ${
                activeTab === tab.id
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="text-xs text-gray-500 mb-2">
            Rolle: {adminRole === 'super_admin' ? 'Super Admin' : 'Moderator'}
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-red-400 hover:text-red-300 text-sm"
          >
            Abmelden
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {activeTab === 'questions' && <QuestionsTab />}
          {activeTab === 'moderation' && <ModerationTab />}
          {activeTab === 'kyc' && <KYCTab />}
          {activeTab === 'trust' && <TrustScoreTab />}
          {activeTab === 'nominations' && <NominationsTab />}
          {activeTab === 'analytics' && <AnalyticsTab isSuperAdmin={adminRole === 'super_admin'} />}
          {activeTab === 'push' && <PushTab isSuperAdmin={adminRole === 'super_admin'} />}
          {activeTab === 'admins' && <AdminUsersTab />}
        </div>
      </div>
    </div>
  );
}
