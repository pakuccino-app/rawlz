// lib/supabase.ts
// Supabase client configuration for React Native
// CRITICAL: detectSessionInUrl: false for React Native (INV-09)

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false, // CRITICAL for React Native (INV-09)
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});

// P2-1: URL-Handler für Google OAuth Callback
// detectSessionInUrl:false → Supabase parst NICHT automatisch
// → wir müssen das Hash-Fragment manuell parsen + setSession() aufrufen
function parseHashFragment(url: string): Record<string, string> {
  const hash = url.split('#')[1];
  if (!hash) return {};
  return Object.fromEntries(
    hash.split('&').map(part => {
      const [key, ...rest] = part.split('=');
      return [key, decodeURIComponent(rest.join('='))];
    })
  );
}

export function setupOAuthCallbackHandler() {
  // Handler für rawlz://auth/callback#access_token=...
  const subscription = Linking.addEventListener('url', async ({ url }) => {
    if (!url.includes('auth/callback')) return;

    const params = parseHashFragment(url);
    const accessToken = params['access_token'];
    const refreshToken = params['refresh_token'];

    if (accessToken && refreshToken) {
      // Manuell Session setzen (da detectSessionInUrl:false)
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        console.error('[OAuth] setSession error:', error.message);
      }
    }
  });

  return subscription;
}

// Helper to get authenticated user
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

// Helper to get access token for API calls
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Helper to get session
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

// Listen to auth state changes
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
