// lib/i18n.ts
// Internationalization setup for RAWLZ
// Uses i18next with expo-localization

import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import de from '../locales/de.json';
import en from '../locales/en.json';

const LANGUAGE_KEY = 'rawlz_language';

// Determine initial language from device locale
const getInitialLanguage = (): 'de' | 'en' => {
  const locale = Localization.locale;
  return locale.startsWith('de') ? 'de' : 'en';
};

// Initialize i18n
i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    lng: getInitialLanguage(),
    fallbackLng: 'de', // Always fallback to German
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    interpolation: {
      escapeValue: false,
    },
  });

/**
 * Change the app language
 * Persists to AsyncStorage and updates DB
 */
export async function changeLanguage(langCode: 'de' | 'en') {
  await i18n.changeLanguage(langCode);
  await AsyncStorage.setItem(LANGUAGE_KEY, langCode);
  
  // Note: Also update users.language_code in DB when user is authenticated
  // This is handled in the settings component
}

/**
 * Restore persisted language on app start
 */
export async function restoreLanguage() {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved === 'de' || saved === 'en') {
      await i18n.changeLanguage(saved);
    }
  } catch (error) {
    console.warn('Failed to restore language:', error);
  }
}

/**
 * Get current language code
 */
export function getCurrentLanguage(): 'de' | 'en' {
  return (i18n.language as 'de' | 'en') || 'de';
}

export default i18n;
