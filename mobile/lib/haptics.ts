// lib/haptics.ts
// Haptic feedback patterns for RAWLZ swipe interactions

import * as Haptics from 'expo-haptics';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export function isHapticsEnabled() {
  return hapticsEnabled;
}

/**
 * Haptic patterns for different vote actions
 * Each pattern provides distinct tactile feedback
 */
export const hapticPatterns = {
  yes: async () => {
    if (!hapticsEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await delay(80);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  no: async () => {
    if (!hapticsEnabled) return;
    for (let i = 0; i < 3; i++) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (i < 2) await delay(40);
    }
  },

  archive: async () => {
    if (!hapticsEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await delay(150);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  cloud: async () => {
    if (!hapticsEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await delay(100);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  tap: async () => {
    if (!hapticsEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  selection: async () => {
    if (!hapticsEnabled) return;
    await Haptics.selectionAsync();
  },

  error: async () => {
    if (!hapticsEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  success: async () => {
    if (!hapticsEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};

export default hapticPatterns;
