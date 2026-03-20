// lib/auth.ts
// Authentication utilities for RAWLZ
// Supports Apple Sign In, Google Sign In, and Email/Password

import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { sha256, hashEmail, generateDeviceHash } from './hashing';

// Register for web browser redirect
WebBrowser.maybeCompleteAuthSession();

/**
 * Sign in with Apple (iOS)
 */
export async function signInWithApple() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (credential.identityToken) {
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) throw error;
      return { success: true, user: data.user };
    }

    throw new Error('No identity token received');
  } catch (error: any) {
    if (error.code === 'ERR_CANCELED') {
      return { success: false, cancelled: true };
    }
    throw error;
  }
}

/**
 * Check if Apple Sign In is available
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  return await AppleAuthentication.isAvailableAsync();
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'rawlz://auth/callback',
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  
  if (data.url) {
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      'rawlz://auth/callback'
    );

    if (result.type === 'success') {
      // Extract tokens from URL and set session
      const url = new URL(result.url);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return { success: true };
      }
    }

    if (result.type === 'cancel') {
      return { success: false, cancelled: true };
    }
  }

  return { success: false };
}

/**
 * Sign up with email and password
 */
export async function signUpWithEmail(email: string, password: string) {
  const emailHash = await hashEmail(email);
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'rawlz://auth/confirm',
      data: {
        email_hash: emailHash,
      },
    },
  });

  if (error) throw error;
  return { success: true, user: data.user, needsConfirmation: !data.session };
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return { success: true, user: data.user };
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'rawlz://auth/reset-password',
  });

  if (error) throw error;
  // Always return success to prevent user enumeration
  return { success: true };
}

/**
 * Update password (after reset link clicked)
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) throw error;
  return { success: true };
}

/**
 * Create or update RAWLZ user record
 */
export async function ensureRawlzUser(authUser: any) {
  const deviceHash = await generateDeviceHash();
  const emailHash = authUser.email ? await hashEmail(authUser.email) : null;

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .single();

  if (!existingUser) {
    // Create new user
    const { error } = await supabase.from('users').insert({
      id: authUser.id,
      device_hash: deviceHash,
      email_hash: emailHash,
      consent_given_at: new Date().toISOString(),
    });

    if (error) throw error;
  }

  return { deviceHash };
}

/**
 * Delete user account (GDPR)
 */
export async function deleteAccount(userId: string) {
  const { error } = await supabase.rpc('delete_user_account', {
    p_user_id: userId,
  });

  if (error) throw error;

  // Sign out
  await supabase.auth.signOut();
  
  return { success: true };
}
