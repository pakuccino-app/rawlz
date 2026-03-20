// lib/hashing.ts
// SHA-256 hashing utilities for RAWLZ
// INV-04: Email + Device ID → SHA-256 BEFORE any DB write

import * as Crypto from 'expo-crypto';

/**
 * Hash a string using SHA-256
 * Used for device_hash and email_hash before storing in DB
 */
export async function sha256(input: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );
  return hash;
}

/**
 * Hash an email address (lowercase + trim)
 */
export async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  return sha256(normalized);
}

/**
 * Hash a device ID
 */
export async function hashDeviceId(deviceId: string): Promise<string> {
  return sha256(deviceId);
}

/**
 * Generate a unique device hash
 * Combines multiple device identifiers for uniqueness
 */
export async function generateDeviceHash(): Promise<string> {
  // In production, use a combination of:
  // - expo-application's getInstallationIdAsync()
  // - expo-device's deviceName, osName, osVersion
  // For now, generate a random UUID-like identifier
  const randomPart = Array.from(
    { length: 32 },
    () => Math.random().toString(36)[2]
  ).join('');
  
  return sha256(randomPart + Date.now().toString());
}
