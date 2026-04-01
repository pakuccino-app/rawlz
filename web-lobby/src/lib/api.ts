// web-lobby/src/lib/api.ts
import { getAccessToken } from './supabase';

// Vercel proxied /functions/v1/* → Supabase (verhindert Adblock-Probleme)
const FN_BASE = '/functions/v1';

async function lobbyFetch(path: string, body: object) {
  const token = await getAccessToken();
  if (!token) throw new Error('Nicht angemeldet');

  const res = await fetch(`${FN_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Netzwerkfehler' }));
    throw new Error(err.error ?? 'Fehler');
  }

  return res.json();
}

export async function getAccountStatus() {
  return lobbyFetch('lobby-analytics', { module: 'status' });
}

export async function getGoldData(opts: { questionIds?: string[]; page?: number; limit?: number } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'gold_data', ...opts });
}

export async function getApathy(opts: { limit?: number } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'apathy', ...opts });
}

export async function getMindShift(opts: { dateRange?: { start: string; end: string } } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'mind_shift', ...opts });
}

export async function getDivergenz() {
  return lobbyFetch('lobby-analytics', { module: 'divergenz' });
}

export async function getVolldemografik(questionId: string) {
  return lobbyFetch('lobby-analytics', { module: 'volldemografik', questionIds: [questionId] });
}

export async function getFeedMode(dateRange?: { start: string; end: string }) {
  return lobbyFetch('lobby-analytics', { module: 'feed_mode', dateRange });
}

export async function getCityRural(questionId?: string) {
  return lobbyFetch('lobby-analytics', {
    module: 'city_rural',
    questionIds: questionId ? [questionId] : [],
  });
}

export async function getHeatmap(dateRange?: { start: string; end: string }) {
  return lobbyFetch('lobby-analytics', { module: 'heatmap', dateRange });
}

export async function getTimeseries(opts: { questionIds?: string[]; dateRange?: { start: string; end: string } } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'timeseries', ...opts });
}

export async function getComparison(opts: { limit?: number } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'comparison', ...opts });
}

export async function getSuggestions(opts: { page?: number; limit?: number } = {}) {
  return lobbyFetch('lobby-analytics', { module: 'suggestions', ...opts });
}

export async function generatePdf(sections: string[], questionIds?: string[]) {
  return lobbyFetch('generate-lobby-pdf', {
    sections,
    questionIds,
    language: 'de',
  });
}

export async function createBillingPortal() {
  return lobbyFetch('create-billing-portal', {});
}

export async function downloadCsv(): Promise<Blob> {
  const token = await getAccessToken();
  if (!token) throw new Error('Nicht angemeldet');

  const res = await fetch(`/functions/v1/lobby-analytics`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ module: 'csv_export' }),
  });

  if (!res.ok) throw new Error('CSV-Export fehlgeschlagen');
  return res.blob();
}
