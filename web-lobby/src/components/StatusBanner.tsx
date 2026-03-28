// web-lobby/src/components/StatusBanner.tsx

import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { getAccountStatus, createBillingPortal } from '../lib/api';

interface Status {
  subscriptionStatus: string;
  accountType: string;
  hasStripe: boolean;
}

export default function StatusBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  useEffect(() => {
    getAccountStatus().then(setStatus).catch(() => null);
  }, []);

  if (!status) return null;

  const isActive = status.subscriptionStatus === 'active' || status.subscriptionStatus === 'trialing';
  const isPastDue = status.subscriptionStatus === 'past_due';
  const isCancelled = ['cancelled', 'canceled', 'inactive'].includes(status.subscriptionStatus);

  async function openBillingPortal() {
    setIsPortalLoading(true);
    try {
      const result = await createBillingPortal();
      if (result.url) window.open(result.url, '_blank');
    } catch {
      alert('Billing Portal konnte nicht geöffnet werden.');
    } finally {
      setIsPortalLoading(false);
    }
  }

  if (isActive && status.subscriptionStatus !== 'trialing') return null;

  return (
    <div
      className={`
        flex items-center justify-between px-4 py-2.5 text-sm
        ${status.subscriptionStatus === 'trialing'
          ? 'bg-blue-500/10 border-b border-blue-500/30 text-blue-400'
          : isPastDue
          ? 'bg-amber-500/10 border-b border-amber-500/30 text-amber-400'
          : 'bg-red-500/10 border-b border-red-500/30 text-red-400'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {status.subscriptionStatus === 'trialing' && <CheckCircle size={16} />}
        {isPastDue && <AlertTriangle size={16} />}
        {isCancelled && <XCircle size={16} />}
        <span>
          {status.subscriptionStatus === 'trialing' && 'Testphase aktiv'}
          {isPastDue && 'Zahlung ausstehend – Konto wird bald gesperrt'}
          {isCancelled && 'Abo abgelaufen – Kein Datenzugriff mehr'}
        </span>
      </div>

      {status.hasStripe && (
        <button
          onClick={openBillingPortal}
          disabled={isPortalLoading}
          className="flex items-center gap-1 font-medium hover:underline disabled:opacity-50"
        >
          {isPortalLoading ? 'Öffne...' : 'Abo verwalten'}
          <ExternalLink size={13} />
        </button>
      )}
    </div>
  );
}
