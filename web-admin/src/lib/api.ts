// web-admin/src/lib/api.ts
// Admin API client

const API_URL = import.meta.env.VITE_SUPABASE_URL;

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
  success: boolean;
  needsTotp?: boolean;
  needsTotpSetup?: boolean;
  tempToken?: string;
  error?: string;
}> {
  const response = await fetch(`${API_URL}/functions/v1/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  return response.json();
}

export async function adminTotpVerify(tempToken: string, totpCode: string): Promise<{
  success: boolean;
  sessionToken?: string;
  admin?: AdminUser;
  error?: string;
}> {
  const response = await fetch(`${API_URL}/functions/v1/admin-totp-verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken, totpCode }),
  });

  const result = await response.json();
  if (result.sessionToken) {
    setSessionToken(result.sessionToken);
  }
  return result;
}

export async function adminTotpSetup(tempToken: string): Promise<{
  success: boolean;
  otpauthUri?: string;
  manualCode?: string;
  error?: string;
}> {
  const response = await fetch(`${API_URL}/functions/v1/admin-totp-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tempToken }),
  });

  return response.json();
}

export async function adminApi(action: string, payload?: any): Promise<any> {
  const token = getSessionToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/functions/v1/admin-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, payload }),
  });

  const result = await response.json();
  
  if (response.status === 401) {
    setSessionToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
}

export async function adminLogout(): Promise<void> {
  const token = getSessionToken();
  if (token) {
    await fetch(`${API_URL}/functions/v1/admin-logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  }
  setSessionToken(null);
}
