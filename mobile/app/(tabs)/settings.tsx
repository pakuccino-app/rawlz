// app/(tabs)/settings.tsx
// Settings screen

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, MEMBERSHIP_COLORS } from '../../lib/constants';
import { supabase, getCurrentUser, signOut } from '../../lib/supabase';
import { changeLanguage, getCurrentLanguage } from '../../lib/i18n';
import { setSoundsEnabled, isSoundsEnabled } from '../../lib/sounds';
import { deleteAccount } from '../../lib/auth';
import hapticPatterns from '../../lib/haptics';

interface UserData {
  id: string;
  membership_type: string;
  is_verified: boolean;
  geo_preference: string;
  supporter_since?: string;
  trust_score: number;
  has_2fa: boolean;
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [soundsOn, setSoundsOn] = useState(true);
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [currentLang, setCurrentLang] = useState<'de' | 'en'>('de');
  const [versionTapCount, setVersionTapCount] = useState(0);

  useEffect(() => {
    loadUserData();
    loadSettings();
  }, []);

  async function loadUserData() {
    const authUser = await getCurrentUser();
    if (authUser) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (data) {
        setUser(data);
      }
    }
  }

  async function loadSettings() {
    setSoundsOn(isSoundsEnabled());
    setCurrentLang(getCurrentLanguage());
    
    const notifSetting = await AsyncStorage.getItem('rawlz_notifications');
    setNotificationsOn(notifSetting !== 'false');
  }

  async function handleSoundsToggle(value: boolean) {
    await hapticPatterns.tap();
    setSoundsOn(value);
    setSoundsEnabled(value);
    await AsyncStorage.setItem('rawlz_sounds', value.toString());
  }

  async function handleNotificationsToggle(value: boolean) {
    await hapticPatterns.tap();
    setNotificationsOn(value);
    await AsyncStorage.setItem('rawlz_notifications', value.toString());
    // TODO: Register/unregister for push notifications
  }

  async function handleLanguageChange() {
    await hapticPatterns.tap();
    const newLang = currentLang === 'de' ? 'en' : 'de';
    await changeLanguage(newLang);
    setCurrentLang(newLang);
    
    // Update DB
    if (user) {
      await supabase
        .from('users')
        .update({ language_code: newLang })
        .eq('id', user.id);
    }
  }

  async function handleFeedModeChange(newMode: string) {
    if (!user) return;
    
    await hapticPatterns.tap();
    await supabase
      .from('users')
      .update({ geo_preference: newMode })
      .eq('id', user.id);
    
    setUser(prev => prev ? { ...prev, geo_preference: newMode } : null);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      t('settings.delete_account'),
      t('settings.delete_account_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (user) {
              try {
                await deleteAccount(user.id);
                router.replace('/auth');
              } catch (error) {
                console.error('Error deleting account:', error);
              }
            }
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    await hapticPatterns.tap();
    await signOut();
    router.replace('/auth');
  }

  function handleVersionTap() {
    setVersionTapCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 7) {
        // Open admin login
        router.push('/admin-login');
        return 0;
      }
      return newCount;
    });
  }

  const membershipColor = user 
    ? MEMBERSHIP_COLORS[user.membership_type as keyof typeof MEMBERSHIP_COLORS]
    : COLORS.gray500;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
          
          <View style={styles.membershipCard}>
            <View style={[styles.membershipBadge, { backgroundColor: membershipColor }]}>
              <Text style={styles.membershipBadgeText}>
                {t(`membership.${user?.membership_type || 'basis'}`).toUpperCase()}
              </Text>
            </View>
            {user?.membership_type === 'supporter' && user.supporter_since && (
              <Text style={styles.membershipSince}>
                {t('membership.supporter_since', {
                  date: new Date(user.supporter_since).toLocaleDateString(),
                })}
              </Text>
            )}
            {user?.membership_type === 'basis' && (
              <TouchableOpacity style={styles.supporterCta}>
                <Text style={styles.supporterCtaText}>
                  {t('membership.supporter_cta')} · {t('membership.supporter_price')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* App Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          
          <TouchableOpacity style={styles.settingRow} onPress={handleLanguageChange}>
            <Text style={styles.settingLabel}>{t('settings.language')}</Text>
            <Text style={styles.settingValue}>{currentLang === 'de' ? 'Deutsch' : 'English'}</Text>
          </TouchableOpacity>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.sounds')}</Text>
            <Switch
              value={soundsOn}
              onValueChange={handleSoundsToggle}
              trackColor={{ false: COLORS.gray300, true: COLORS.black }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.notifications')}</Text>
            <Switch
              value={notificationsOn}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: COLORS.gray300, true: COLORS.black }}
            />
          </View>
        </View>

        {/* Feed Mode Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.feed_mode')}</Text>
          
          {['global', 'country', 'region', 'mixed'].map(mode => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.feedModeOption,
                user?.geo_preference === mode && styles.feedModeOptionActive,
              ]}
              onPress={() => handleFeedModeChange(mode)}
            >
              <Text style={styles.feedModeIcon}>
                {mode === 'global' && '🌍'}
                {mode === 'country' && '🏳️'}
                {mode === 'region' && '📍'}
                {mode === 'mixed' && '🔀'}
              </Text>
              <Text style={[
                styles.feedModeText,
                user?.geo_preference === mode && styles.feedModeTextActive,
              ]}>
                {t(`feed_mode.${mode}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.legal')}</Text>
          
          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.privacy_policy')}</Text>
            <Text style={styles.settingArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.terms')}</Text>
            <Text style={styles.settingArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.imprint')}</Text>
            <Text style={styles.settingArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Abmelden</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>{t('settings.delete_account')}</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <TouchableOpacity style={styles.versionContainer} onPress={handleVersionTap}>
          <Text style={styles.versionText}>{t('settings.version')} 1.0.0</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  membershipCard: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
  },
  membershipBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  membershipBadgeText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  membershipSince: {
    marginTop: 12,
    color: COLORS.gray700,
    fontSize: 14,
  },
  supporterCta: {
    marginTop: 16,
    backgroundColor: COLORS.black,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  supporterCtaText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  settingLabel: {
    fontSize: 16,
    color: COLORS.black,
  },
  settingValue: {
    fontSize: 16,
    color: COLORS.gray500,
  },
  settingArrow: {
    fontSize: 16,
    color: COLORS.gray500,
  },
  feedModeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: COLORS.gray100,
  },
  feedModeOptionActive: {
    backgroundColor: COLORS.black,
  },
  feedModeIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  feedModeText: {
    fontSize: 16,
    color: COLORS.black,
  },
  feedModeTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: COLORS.gray100,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  signOutText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: COLORS.noLight,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 16,
    color: COLORS.no,
    fontWeight: '600',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
  versionText: {
    fontSize: 14,
    color: COLORS.gray500,
  },
});
