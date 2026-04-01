// web-admin/src/lib/api.ts

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Vercel proxied /functions/v1/* → Supabase
const FN_BASE = '/functions/v1';

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

// Spec: Session Token NUR im Memory, NICHT localStorage
let sessionToken: string | null = null;
let adminRole: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
  // NO localStorage – spec requires memory-only
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setAdminRole(role: string | null) {
  adminRole = role;
}

export function getAdminRole(): string | null {
  return adminRole;
}

export async function adminLogin(email: string, password: string): Promise<{
  tempToken?: string;
  needsTotp?: boolean;
  needsTotpSetup?: boolean;
  displayName?: string;
  role?: string;
  error?: string;
}> {
  const response = await fetch(`${FN_BASE}/admin-login`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ email, password }),
  });
  return response.json();
}

// Spec: isSetupConfirmation:true für Setup, false für regulären Login
export async function adminTotpVerify(
  tempToken: string,
  totpCode: string,
  isSetupConfirmation: boolean
): Promise<{
  sessionToken?: string;
  success?: boolean;
  role?: string;
  displayName?: string;
  error?: string;
}> {
  const response = await fetch(`${FN_BASE}/admin-totp-verify`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${tempToken}` }),
    body: JSON.stringify({ totpCode, isSetupConfirmation }),
  });

  const result = await response.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  if (result.role) {
    setAdminRole(result.role);
  }
  return result;
}

export async function adminTotpSetup(tempToken: string): Promise<{
  otpauthUri?: string;
  manualCode?: string;
  error?: string;
}> {
  const response = await fetch(`${FN_BASE}/admin-totp-setup`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${tempToken}` }),
    body: JSON.stringify({}),
  });
  return response.json();
}

export async function adminApi(action: string, payload?: any): Promise<any> {
  const token = getSessionToken();
  if (!token) throw new Error('Nicht angemeldet');

  const response = await fetch(`${FN_BASE}/admin-api`, {
    method: 'POST',
    headers: baseHeaders({ 'Authorization': `Bearer ${token}` }),
    body: JSON.stringify({ action, payload }),
  });

  // Spec: Auto-Logout bei 401 UND 403
  if (response.status === 401 || response.status === 403) {
    setSessionToken(null);
    setAdminRole(null);
    window.location.href = '/login';
    throw new Error('Session abgelaufen');
  }

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}

export async function adminLogout(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    await fetch(`${FN_BASE}/admin-logout`, {
      method: 'POST',
      headers: baseHeaders({ 'Authorization': `Bearer ${token}` }),
    }).catch(() => null);
  }
  setSessionToken(null);
  setAdminRole(null);
}
