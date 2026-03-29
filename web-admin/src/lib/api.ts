// web-admin/src/lib/api.ts

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Basis-Header für alle Supabase Edge Function Aufrufe
function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra,
  };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'moderator';
  has_2fa: boolean;
}

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token) {
    localStorage.setItem('admin_session', token);
  } else {
    localStorage.removeItem('admin_session');
  }
}

export function getSessionToken(): string | null {
  if (!sessionToken) {
    sessionToken = localStorage.getItem('admin_session');
  }
  return sessionToken;
}

export async function adminLogin(email: string, password: string): Promise<{
  tempToken?: string;
  needsTotp?: boolean;
  needsTotpSetup?: boolean;
  displayName?: string;
  role?: string;
  error?: string;
}> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-login`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return response.json();
}

export async function adminTotpVerify(tempToken: string, totpCode: string): Promise<{
  sessionToken?: string;
  success?: boolean;
  role?: string;
  displayName?: string;
  error?: string;
}> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-totp-verify`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${tempToken}` }),
    body: JSON.stringify({ totpCode }),
  });

  const result = await response.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

export async function adminTotpSetup(tempToken: string): Promise<{
  otpauthUri?: string;
  manualCode?: string;
  error?: string;
}> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-totp-setup`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${tempToken}` }),
    body: JSON.stringify({}),
  });
  return response.json();
}

export async function adminApi(action: string, payload?: any): Promise<any> {
  const token = getSessionToken();
  if (!token) throw new Error('Nicht angemeldet');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${token}` }),
    body: JSON.stringify({ action, payload }),
  });

  const result = await response.json();

  if (response.status === 401) {
    setSessionToken(null);
    window.location.href = '/login';
    throw new Error('Session abgelaufen');
  }

  if (result.error) throw new Error(result.error);
  return result;
}

export async function adminLogout(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    await fetch(`${SUPABASE_URL}/functions/v1/admin-logout`, {
      method: 'POST',
      headers: baseHeaders({ 'Authorization': `Bearer ${token}` }),
    }).catch(() => null);
  }
  setSessionToken(null);
}
