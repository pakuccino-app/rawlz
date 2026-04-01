// app/_layout.tsx
// Root layout for RAWLZ mobile app

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

// Initialize i18n
import '../lib/i18n';
import { restoreLanguage } from '../lib/i18n';
import { preloadSounds, initAudio } from '../lib/sounds';
import { supabase, onAuthStateChange } from '../lib/supabase';
import { COLORS } from '../lib/constants';
import { initRevenueCat } from '../lib/revenuecat';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function initialize() {
      try {
        // Restore persisted language
        await restoreLanguage();
        
        // Initialize audio
        await initAudio();
        
        // Preload sounds
        await preloadSounds();
        
        // Check initial auth state – auto sign-in wenn keine Session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // Device-spezifisches Auto-Login (funktioniert in allen supabase-js Versionen)
          const { generateDeviceHash } = await import('../lib/hashing');
          const deviceHash = await generateDeviceHash();

          // Spec: initRevenueCat(deviceHash) beim App-Start
          await initRevenueCat(deviceHash);
          const anonEmail = `anon_${deviceHash.slice(0, 20)}@rawlz.internal`;
          const anonPassword = deviceHash.slice(0, 32);

          // Erst versuchen einzuloggen, dann registrieren
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: anonEmail, password: anonPassword,
          });

          if (signInError) {
            // Noch nicht registriert – jetzt registrieren
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: anonEmail, password: anonPassword,
            });
            if (!signUpError && signUpData.user) {
              await supabase.from('users').upsert({
                id: signUpData.user.id,
                device_hash: deviceHash,
                consent_given_at: new Date().toISOString(),
                geo_preference: 'global',
              }, { onConflict: 'id', ignoreDuplicates: true });
              setIsAuthenticated(true);
            }
          } else if (signInData.user) {
            setIsAuthenticated(true);
          }
        } else {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setIsReady(true);
      }
    }

    initialize();

    // Listen for auth state changes
    const { data: { subscription } } = onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.black} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!isAuthenticated ? (
          <Stack.Screen 
            name="auth" 
            options={{ 
              headerShown: false,
              gestureEnabled: false,
            }} 
          />
        ) : (
          <Stack.Screen 
            name="(tabs)" 
            options={{ 
              headerShown: false,
              gestureEnabled: false,
            }} 
          />
        )}
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
});
