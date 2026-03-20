// lib/sounds.ts
// Sound effects manager for RAWLZ swipe interactions

import { Audio } from 'expo-av';

// Sound effect file paths
const soundFiles = {
  yes: require('../assets/sounds/sfx_yes.mp3'),
  no: require('../assets/sounds/sfx_no.mp3'),
  archive: require('../assets/sounds/sfx_archive.mp3'),
  deepDive: require('../assets/sounds/sfx_deepdive.mp3'),
};

// Sound instances cache
let sounds: { [key: string]: Audio.Sound | null } = {
  yes: null,
  no: null,
  archive: null,
  deepDive: null,
};

// Sound enabled state (persisted in AsyncStorage)
let soundsEnabled = true;

/**
 * Initialize audio settings
 */
export async function initAudio() {
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });
}

/**
 * Preload all sound effects
 */
export async function preloadSounds() {
  try {
    for (const [key, file] of Object.entries(soundFiles)) {
      const { sound } = await Audio.Sound.createAsync(file);
      sounds[key] = sound;
    }
  } catch (error) {
    console.warn('Failed to preload sounds:', error);
  }
}

/**
 * Play a sound effect
 */
export async function playSound(name: 'yes' | 'no' | 'archive' | 'deepDive') {
  if (!soundsEnabled) return;
  
  try {
    const sound = sounds[name];
    if (sound) {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    }
  } catch (error) {
    console.warn(`Failed to play sound ${name}:`, error);
  }
}

/**
 * Enable/disable sound effects
 */
export function setSoundsEnabled(enabled: boolean) {
  soundsEnabled = enabled;
}

/**
 * Check if sounds are enabled
 */
export function isSoundsEnabled(): boolean {
  return soundsEnabled;
}

/**
 * Cleanup sounds on app unmount
 */
export async function unloadSounds() {
  for (const sound of Object.values(sounds)) {
    if (sound) {
      await sound.unloadAsync();
    }
  }
  sounds = {
    yes: null,
    no: null,
    archive: null,
    deepDive: null,
  };
}
