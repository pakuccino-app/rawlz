// app/2fa-setup.tsx
// Expert 2FA Setup Screen with QR Code (react-native-qrcode-svg)
// Steps: Generate → Scan QR / Enter manual code → Confirm with 6-digit code

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser, getSession } from '../lib/supabase';
import hapticPatterns from '../lib/haptics';

type SetupStep = 'generate' | 'confirm' | 'success';

export default function TwoFactorSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<SetupStep>('generate');
  const [isLoading, setIsLoading] = useState(false);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [showManualCode, setShowManualCode] = useState(false);

  useEffect(() => {
    generateSecret();
  }, []);

  async function generateSecret() {
    setIsLoading(true);

    try {
      const session = await getSession();
      if (!session) {
        Alert.alert('Fehler', 'Nicht angemeldet');
        router.back();
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/user-totp-setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'generate' }),
        }
      );

      const result = await response.json();

      if (result.error) {
        if (result.error.includes('only available for experts')) {
          Alert.alert('Info', '2FA ist nur für Experten verfügbar.');
          router.back();
          return;
        }
        throw new Error(result.error);
      }

      setOtpauthUri(result.otpauthUri);
      setManualCode(result.manualCode);
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Konnte 2FA nicht generieren.');
      router.back();
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmCode() {
    if (totpCode.length !== 6) {
      Alert.alert('Fehler', 'Bitte gib einen 6-stelligen Code ein.');
      return;
    }

    setIsLoading(true);
    await hapticPatterns.tap();

    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/user-totp-setup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'confirm', totpCode }),
        }
      );

      const result = await response.json();

      if (result.error) {
        await hapticPatterns.error();
        Alert.alert('Fehler', result.error === 'Invalid TOTP code' 
          ? 'Ungültiger Code. Bitte prüfe den Code und versuche es erneut.'
          : result.error
        );
        return;
      }

      await hapticPatterns.success();
      setStep('success');
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Bestätigung fehlgeschlagen.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleDone() {
    router.back();
  }

  if (isLoading && step === 'generate') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.black} />
          <Text style={styles.loadingText}>2FA wird vorbereitet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>2FA einrichten</Text>
        </View>

        {step === 'generate' && otpauthUri && (
          <>
            {/* Step indicator */}
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={styles.stepDot} />
            </View>

            {/* Instructions */}
            <Text style={styles.instructions}>
              Scanne den QR-Code mit deiner Authenticator-App (z.B. Google Authenticator, Authy, 1Password).
            </Text>

            {/* QR Code */}
            <View style={styles.qrContainer}>
              <QRCode
                value={otpauthUri}
                size={200}
                backgroundColor={COLORS.white}
                color={COLORS.black}
              />
            </View>

            {/* Manual code toggle */}
            <TouchableOpacity
              style={styles.manualToggle}
              onPress={() => setShowManualCode(!showManualCode)}
            >
              <Text style={styles.manualToggleText}>
                {showManualCode ? 'QR-Code nicht lesbar?' : 'Code manuell eingeben ▼'}
              </Text>
            </TouchableOpacity>

            {/* Manual code */}
            {showManualCode && manualCode && (
              <View style={styles.manualCodeContainer}>
                <Text style={styles.manualCodeLabel}>Manueller Code:</Text>
                <View style={styles.manualCodeBox}>
                  <Text style={styles.manualCodeText} selectable>
                    {manualCode}
                  </Text>
                </View>
                <Text style={styles.manualCodeHint}>
                  Tippe, um den Code zu kopieren
                </Text>
              </View>
            )}

            {/* Continue button */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setStep('confirm')}
            >
              <Text style={styles.primaryButtonText}>Weiter</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'confirm' && (
          <>
            {/* Step indicator */}
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, styles.stepDotDone]}>
                <Text style={styles.stepDotText}>✓</Text>
              </View>
              <View style={[styles.stepLine, styles.stepLineDone]} />
              <View style={[styles.stepDot, styles.stepDotActive]} />
            </View>

            {/* Instructions */}
            <Text style={styles.instructions}>
              Gib den 6-stelligen Code aus deiner Authenticator-App ein, um die Einrichtung abzuschließen.
            </Text>

            {/* Code input */}
            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                value={totpCode}
                onChangeText={(text) => setTotpCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={COLORS.gray300}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={[styles.primaryButton, totpCode.length !== 6 && styles.primaryButtonDisabled]}
              onPress={confirmCode}
              disabled={totpCode.length !== 6 || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Bestätigen</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep('generate')}
            >
              <Text style={styles.secondaryButtonText}>Zurück</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'success' && (
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Text style={styles.successIconText}>🔒</Text>
            </View>

            <Text style={styles.successTitle}>2FA aktiviert!</Text>
            <Text style={styles.successMessage}>
              Dein Konto ist jetzt mit Zwei-Faktor-Authentifizierung geschützt.
              Bei jeder Anmeldung wirst du nach einem Code gefragt.
            </Text>

            <View style={styles.warningBox}>
              <Text style={styles.warningTitle}>⚠️ Wichtig</Text>
              <Text style={styles.warningText}>
                Stelle sicher, dass du Zugriff auf deine Authenticator-App hast.
                Ohne den Code kannst du dich nicht mehr anmelden.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleDone}
            >
              <Text style={styles.primaryButtonText}>Fertig</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.gray500,
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.black,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.black,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: COLORS.gold,
  },
  stepDotDone: {
    backgroundColor: COLORS.yes,
  },
  stepDotText: {
    color: COLORS.white,
    fontWeight: '700',
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: COLORS.gray200,
    marginHorizontal: 8,
  },
  stepLineDone: {
    backgroundColor: COLORS.yes,
  },
  instructions: {
    fontSize: 16,
    color: COLORS.gray700,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: 24,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  manualToggle: {
    alignItems: 'center',
    marginBottom: 16,
  },
  manualToggleText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  manualCodeContainer: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  manualCodeLabel: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 8,
  },
  manualCodeBox: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  manualCodeText: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    letterSpacing: 2,
  },
  manualCodeHint: {
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  codeInputContainer: {
    marginBottom: 32,
  },
  codeInput: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    height: 80,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 12,
    color: COLORS.black,
  },
  primaryButton: {
    backgroundColor: COLORS.black,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.gray500,
    fontSize: 16,
  },
  successContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.yesLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successIconText: {
    fontSize: 48,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 16,
    color: COLORS.gray700,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  warningBox: {
    backgroundColor: COLORS.goldLight,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    width: '100%',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 20,
  },
});
