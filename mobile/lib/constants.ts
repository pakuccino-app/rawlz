// lib/constants.ts
// RAWLZ Design System Constants

export const COLORS = {
  // Base
  white: '#FFFFFF',
  offWhite: '#F9FAFB',
  black: '#111111',
  
  // Grays
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray500: '#6B7280',
  gray700: '#374151',
  
  // Vote Colors
  yes: '#16A34A',
  no: '#DC2626',
  archive: '#6B7280',
  deepDive: '#2563EB',
  
  // Vote Light Colors (backgrounds)
  yesLight: '#DCFCE7',
  noLight: '#FEE2E2',
  archiveLight: '#F3F4F6',
  deepLight: '#DBEAFE',
  
  // Premium
  midnight: '#1A1A2E',
  gold: '#D4AF37',
  goldLight: '#F5E6C8',
  goldDark: '#B8943A',
};

// Membership Thresholds (INV-03)
export const RESULT_THRESHOLDS = {
  basis: 500,
  supporter: 100,
  expert: 200,
  lobby: 50,
};

// Word constraints (INV-01)
export const WORD_REGEX = /^#[a-zA-Z0-9äöüÄÖÜß]{1,27}$/;
export const WORD_MIN_LENGTH = 2; // including #
export const WORD_MAX_LENGTH = 28; // including #

// Vote lock duration (INV-15)
export const VOTE_LOCK_MS = 3 * 60 * 1000; // 3 minutes

// K-Anonymity minimum (INV-11)
export const K_ANONYMITY_MIN = 20;

// Font sizes based on word length (after #)
export function getWordFontSize(wordLength: number): number {
  if (wordLength <= 6) return 80;
  if (wordLength <= 10) return 64;
  if (wordLength <= 15) return 48;
  if (wordLength <= 20) return 36;
  return 28;
}

// Membership badges
export const MEMBERSHIP_COLORS = {
  basis: COLORS.gray500,
  supporter: COLORS.gold,
  expert: COLORS.deepDive,
  lobby: COLORS.midnight,
};

// Animation durations
export const ANIMATIONS = {
  swipe: 300,
  flash: 300,
  overlay: 200,
  bottomSheet: 250,
  cloudExpand: 400,
};
