// lib/haptics.ts
// Haptic feedback patterns for RAWLZ swipe interactions

import * as Haptics from 'expo-haptics';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Haptic patterns for different vote actions
 * Each pattern provides distinct tactile feedback
 */
export const hapticPatterns = {
  /**
   * YES vote: Medium → Heavy (affirming double pulse)
   */
  yes: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await delay(80);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  /**
   * NO vote: Light x3 (quick rejection taps)
   */
  no: async () => {
    for (let i = 0; i < 3; i++) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (i < 2) await delay(40);
    }
  },

  /**
   * Archive: Heavy → Light (dismissive drop)
   */
  archive: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await delay(150);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Cloud/Deep Dive: Double success notification
   */
  cloud: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await delay(100);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  /**
   * Light tap for UI interactions
   */
  tap: async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Selection changed
   */
  selection: async () => {
    await Haptics.selectionAsync();
  },

  /**
   * Error/warning feedback
   */
  error: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Success feedback
   */
  success: async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
};

export default hapticPatterns;
