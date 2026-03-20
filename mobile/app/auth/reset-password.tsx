// app/auth/reset-password.tsx
// Password reset screen (opened via deep link)

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS } from '../../lib/constants';
import { updatePassword } from '../../lib/auth';
import hapticPatterns from '../../lib/haptics';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleUpdatePassword() {
    if (newPassword.length < 8) {
      Alert.alert(t('auth.password_too_short'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('auth.passwords_mismatch'));
      return;
    }

    setIsLoading(true);
    try {
      await hapticPatterns.tap();
      await updatePassword(newPassword);
      await hapticPatterns.success();
      
      // Navigate to main app
      router.replace('/(tabs)');
    } catch (error: any) {
      await hapticPatterns.error();
      Alert.alert(t('errors.generic'), error.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{t('auth.new_password')}</Text>
        
        <TextInput
          style={styles.input}
          placeholder={t('auth.new_password')}
          placeholderTextColor={COLORS.gray500}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoFocus
        />

        <TextInput
          style={styles.input}
          placeholder={t('auth.confirm_password')}
          placeholderTextColor={COLORS.gray500}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={styles.button}
          onPress={handleUpdatePassword}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.buttonText}>{t('auth.update_password')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 32,
    textAlign: 'center',
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
    marginBottom: 16,
  },
  button: {
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
