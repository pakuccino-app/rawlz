// lib/hashing.ts
// SHA-256 hashing utilities for RAWLZ
// INV-04: Email + Device ID → SHA-256 BEFORE any DB write

import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'rawlz_device_id';

export async function sha256(input: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );
  return hash;
}

export async function hashEmail(email: string): Promise<string> {
  return sha256(email.toLowerCase().trim());
}

export async function hashDeviceId(deviceId: string): Promise<string> {
  return sha256(deviceId);
}

/**
 * Returns a PERSISTENT device hash.
 * On first call: generates a UUID, stores in AsyncStorage, returns its hash.
 * On subsequent calls: reads stored UUID, returns its hash.
 * This ensures the same device always gets the same hash (until app deletion).
 */
export async function generateDeviceHash(): Promise<string> {
  // Try to read existing device ID
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate a new device ID using crypto-grade randomness (INV-04)
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    deviceId = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return sha256(deviceId);
}
