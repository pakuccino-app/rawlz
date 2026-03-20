// app/auth/index.tsx
// Authentication screen for RAWLZ

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Checkbox from 'expo-checkbox';

import { COLORS } from '../../lib/constants';
import {
  signInWithApple,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  requestPasswordReset,
  isAppleAuthAvailable,
} from '../../lib/auth';
import hapticPatterns from '../../lib/haptics';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    checkAppleAuth();
  }, []);

  async function checkAppleAuth() {
    const available = await isAppleAuthAvailable();
    setAppleAvailable(available);
  }

  async function handleAppleSignIn() {
    if (!gdprConsent) {
      Alert.alert(t('auth.gdpr_required'));
      return;
    }

    setIsLoading(true);
    try {
      await hapticPatterns.tap();
      const result = await signInWithApple();
      if (!result.success && !result.cancelled) {
        Alert.alert(t('errors.auth_failed'));
      }
    } catch (error: any) {
      Alert.alert(t('errors.auth_failed'), error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!gdprConsent) {
      Alert.alert(t('auth.gdpr_required'));
      return;
    }

    setIsLoading(true);
    try {
      await hapticPatterns.tap();
      const result = await signInWithGoogle();
      if (!result.success && !result.cancelled) {
        Alert.alert(t('errors.auth_failed'));
      }
    } catch (error: any) {
      Alert.alert(t('errors.auth_failed'), error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEmailAuth() {
    if (!gdprConsent && mode !== 'reset') {
      Alert.alert(t('auth.gdpr_required'));
      return;
    }

    if (!email.includes('@')) {
      Alert.alert(t('auth.invalid_email'));
      return;
    }

    if (mode !== 'reset' && password.length < 8) {
      Alert.alert(t('auth.password_too_short'));
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      Alert.alert(t('auth.passwords_mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await hapticPatterns.tap();

      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else if (mode === 'signup') {
        const result = await signUpWithEmail(email, password);
        if (result.needsConfirmation) {
          Alert.alert(t('auth.verification_sent'));
        }
      } else if (mode === 'reset') {
        await requestPasswordReset(email);
        Alert.alert(t('auth.reset_sent'));
        setMode('signin');
      }
    } catch (error: any) {
      Alert.alert(t('errors.auth_failed'), error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Text style={styles.logo}>#</Text>
            <Text style={styles.appName}>RAWLZ</Text>
            <Text style={styles.tagline}>{t('app.tagline')}</Text>
          </View>

          {/* Auth Buttons */}
          <View style={styles.authButtons}>
            {/* Apple Sign In (iOS only) */}
            {appleAvailable && Platform.OS === 'ios' && (
              <TouchableOpacity
                style={[styles.authButton, styles.appleButton]}
                onPress={handleAppleSignIn}
                disabled={isLoading}
              >
                <Text style={styles.appleButtonText}>
                  {t('auth.sign_in_apple')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Google Sign In */}
            <TouchableOpacity
              style={[styles.authButton, styles.googleButton]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Text style={styles.googleButtonText}>
                {t('auth.sign_in_google')}
              </Text>
            </TouchableOpacity>

            {/* Email Sign In Toggle */}
            <TouchableOpacity
              style={[styles.authButton, styles.emailButton]}
              onPress={() => setShowEmailForm(!showEmailForm)}
              disabled={isLoading}
            >
              <Text style={styles.emailButtonText}>
                {t('auth.sign_in_email')}
              </Text>
            </TouchableOpacity>

            {/* Email Form */}
            {showEmailForm && (
              <View style={styles.emailForm}>
                <TextInput
                  style={styles.input}
                  placeholder={t('auth.email')}
                  placeholderTextColor={COLORS.gray500}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                {mode !== 'reset' && (
                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.password')}
                    placeholderTextColor={COLORS.gray500}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                )}

                {mode === 'signup' && (
                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.confirm_password')}
                    placeholderTextColor={COLORS.gray500}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                  />
                )}

                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={handleEmailAuth}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.submitButtonText}>
                      {mode === 'signin'
                        ? t('auth.sign_in')
                        : mode === 'signup'
                        ? t('auth.sign_up')
                        : t('auth.reset_sent').split('.')[0]}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Mode toggles */}
                <View style={styles.modeToggles}>
                  {mode === 'signin' && (
                    <>
                      <TouchableOpacity onPress={() => setMode('signup')}>
                        <Text style={styles.toggleText}>
                          {t('auth.switch_to_signup')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setMode('reset')}>
                        <Text style={styles.toggleText}>
                          {t('auth.forgot_password')}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {mode === 'signup' && (
                    <TouchableOpacity onPress={() => setMode('signin')}>
                      <Text style={styles.toggleText}>
                        {t('auth.switch_to_signin')}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {mode === 'reset' && (
                    <TouchableOpacity onPress={() => setMode('signin')}>
                      <Text style={styles.toggleText}>
                        {t('common.back')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* GDPR Consent */}
          <View style={styles.gdprContainer}>
            <Checkbox
              value={gdprConsent}
              onValueChange={setGdprConsent}
              color={gdprConsent ? COLORS.black : undefined}
              style={styles.checkbox}
            />
            <Text style={styles.gdprText}>{t('auth.gdpr_consent')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 80,
    fontWeight: '900',
    color: COLORS.gold,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.black,
    letterSpacing: 4,
    marginTop: -8,
  },
  tagline: {
    fontSize: 16,
    color: COLORS.gray500,
    marginTop: 8,
  },
  authButtons: {
    gap: 12,
  },
  authButton: {
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appleButton: {
    backgroundColor: COLORS.black,
  },
  appleButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray300,
  },
  googleButtonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '600',
  },
  emailButton: {
    backgroundColor: COLORS.gray100,
  },
  emailButtonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '600',
  },
  emailForm: {
    marginTop: 16,
    gap: 12,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  submitButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  modeToggles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  toggleText: {
    color: COLORS.gray500,
    fontSize: 14,
  },
  gdprContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 32,
    paddingHorizontal: 8,
  },
  checkbox: {
    marginRight: 12,
    marginTop: 2,
  },
  gdprText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 20,
  },
});
