// app/(tabs)/settings.tsx
// Settings screen with notification list, membership, and user preferences
// Features: notification subscriptions with counter, feed mode, profile, etc.

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS } from '../../lib/constants';
import { supabase, getCurrentUser, signOut } from '../../lib/supabase';
import hapticPatterns from '../../lib/haptics';
import { changeLanguage, getCurrentLanguage } from '../../lib/i18n';
import { purchaseSupporter, restoreSupporter } from '../../lib/revenuecat';
import { requestPasswordReset } from '../../lib/auth';

interface User {
  id: string;
  membership_type: string;
  is_verified: boolean;
  geo_preference: string;
  geo_country?: string;
  geo_region?: string;
  language_code: string;
  sound_enabled: boolean;
  haptics_enabled: boolean;
  streak_count: number;
  supporter_since?: string;
  trust_score: number;
}

interface NotificationSubscription {
  id: string;
  question_id: string;
  question: {
    word: string;
    status: string;
    submission_count: number;
    relevance_threshold: number;
  };
}

type FeedMode = 'global' | 'country' | 'region' | 'mixed';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationSubscription[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Local state for settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [feedMode, setFeedMode] = useState<FeedMode>('global');
  const [language, setLanguage] = useState('de');

  useEffect(() => {
    loadUser();
    loadNotifications();
  }, []);

  async function loadUser() {
    setIsLoading(true);
    try {
      const authUser = await getCurrentUser();
      if (authUser) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (data) {
          setUser(data);
          setSoundEnabled(data.sound_enabled !== false);
          setHapticsEnabled(data.haptics_enabled !== false);
          setFeedMode(data.geo_preference || 'global');
          setLanguage(data.language_code || 'de');
        }
      }
    } catch (error) {
      console.error('Load user error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadNotifications() {
    try {
      const authUser = await getCurrentUser();
      if (!authUser) return;

      const { data, error } = await supabase
        .from('question_notification_requests')
        .select(`
          id,
          question_id,
          questions (
            word,
            status,
            submission_count,
            relevance_threshold
          )
        `)
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const subs = (data || []).map((item: any) => ({
        ...item,
        question: item.questions,
      }));

      setNotifications(subs);
    } catch (error) {
      console.error('Load notifications error:', error);
    }
  }

  async function updateUserSetting(key: string, value: any) {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({ [key]: value })
        .eq('id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Update setting error:', error);
    }
  }

  async function handleSoundToggle(value: boolean) {
    setSoundEnabled(value);
    await updateUserSetting('sound_enabled', value);
    await hapticPatterns.tap();
  }

  async function handleHapticsToggle(value: boolean) {
    setHapticsEnabled(value);
    await updateUserSetting('haptics_enabled', value);
    if (value) await hapticPatterns.tap();
  }

  async function handleFeedModeChange(mode: FeedMode) {
    setFeedMode(mode);
    await updateUserSetting('geo_preference', mode);
    await hapticPatterns.tap();
  }

  async function handleLanguageChange(lang: 'de' | 'en') {
    setLanguage(lang);
    await updateUserSetting('language_code', lang);
    await changeLanguage(lang);
    await hapticPatterns.tap();
  }

  async function handleUnsubscribe(subscriptionId: string) {
    await hapticPatterns.tap();

    Alert.alert(
      t('notifications.unsubscribe'),
      'Möchtest du diese Benachrichtigung wirklich abbestellen?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('question_notification_requests')
                .delete()
                .eq('id', subscriptionId);

              if (error) throw error;

              await hapticPatterns.success();
              setNotifications(prev => prev.filter(n => n.id !== subscriptionId));
            } catch (error) {
              console.error('Unsubscribe error:', error);
            }
          },
        },
      ]
    );
  }

  // Fix 2+3: Supporter kaufen / wiederherstellen
  async function handlePurchaseSupporter() {
    const result = await purchaseSupporter();
    if (result.success) {
      Alert.alert('Danke! 🎉', 'Du bist jetzt RAWLZ Unterstützer!');
      await loadUser();
    } else if (result.shouldRestore) {
      await handleRestoreSupporter();
    } else if (result.error) {
      Alert.alert('Fehler', result.error);
    }
  }

  async function handleRestoreSupporter() {
    const result = await restoreSupporter();
    if (result.success) {
      Alert.alert('Wiederhergestellt', 'Dein Kauf wurde wiederhergestellt.');
      await loadUser();
    } else if (result.error) {
      Alert.alert('Fehler', result.error);
    }
  }

  // Fix 5: Lobby Billing Portal
  async function handleOpenBillingPortal() {
    try {
      const session = await supabase.auth.getSession();
      if (!session.data.session) return;
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-billing-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.data.session.access_token}`,
          },
        }
      );
      const data = await res.json();
      if (data.url) {
        const { Linking } = await import('react-native');
        Linking.openURL(data.url);
      }
    } catch (e: any) {
      Alert.alert('Fehler', 'Billing Portal konnte nicht geöffnet werden.');
    }
  }

  // Fix 6: Passwort-Reset
  async function handlePasswordReset() {
    if (!user) return;
    const authUser = await getCurrentUser();
    if (!authUser?.email) {
      Alert.alert('Info', 'Nur bei E-Mail-Accounts verfügbar.');
      return;
    }
    await requestPasswordReset(authUser.email);
    Alert.alert('Reset-Link gesendet', 'Bitte prüfe deine E-Mails.');
  }

  async function handleSignOut() {
    Alert.alert(
      'Abmelden',
      'Möchtest du dich wirklich abmelden?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            await signOut();
            router.replace('/auth');
          },
        },
      ]
    );
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
            try {
              const session = await supabase.auth.getSession();
              if (session.data.session) {
                // Supabase Auth: User löschen (löscht auch alle abhängigen Daten via CASCADE)
                const { error } = await supabase.rpc('delete_user_account');
                if (error) throw error;
              }
              await signOut();
              router.replace('/auth');
            } catch (error: any) {
              console.error('Delete account error:', error);
              Alert.alert('Fehler', error.message || t('settings.delete_error'));
            }
          },
        },
      ]
    );
  }

  function getMembershipLabel(): string {
    switch (user?.membership_type) {
      case 'supporter':
        return t('membership.supporter');
      case 'expert':
        return t('membership.expert');
      case 'lobby':
        return t('membership.lobby');
      default:
        return t('membership.basis');
    }
  }

  function getMembershipColor(): string {
    switch (user?.membership_type) {
      case 'supporter':
        return COLORS.gold;
      case 'expert':
        return COLORS.yes;
      case 'lobby':
        return '#2563EB';
      default:
        return COLORS.gray500;
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.black} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* Account section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.account')}</Text>

          {/* Membership */}
          <View style={styles.membershipCard}>
            <View style={styles.membershipHeader}>
              <Text style={[styles.membershipLabel, { color: getMembershipColor() }]}>
                {getMembershipLabel()}
              </Text>
              {user?.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓ Verifiziert</Text>
                </View>
              )}
            </View>

            <View style={styles.membershipStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>🔥 {user?.streak_count || 0}</Text>
                <Text style={styles.statLabel}>Streak</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>⭐ {user?.trust_score || 100}</Text>
                <Text style={styles.statLabel}>Trust</Text>
              </View>
            </View>

            {user?.membership_type === 'basis' && (
              <>
                <TouchableOpacity style={styles.upgradeButton} onPress={handlePurchaseSupporter}>
                  <Text style={styles.upgradeButtonText}>
                    {t('membership.supporter_cta')} – {t('membership.supporter_price')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.upgradeButton, { marginTop: 8, backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.gray300 }]}
                  onPress={handleRestoreSupporter}
                >
                  <Text style={[styles.upgradeButtonText, { color: COLORS.gray500 }]}>
                    {t('membership.restore_purchases')}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {user?.membership_type === 'lobby' && (
              <TouchableOpacity style={styles.upgradeButton} onPress={handleOpenBillingPortal}>
                <Text style={styles.upgradeButtonText}>
                  {t('membership.manage_billing')}
                </Text>
              </TouchableOpacity>
            )}

            {user?.supporter_since && (
              <Text style={styles.supporterSince}>
                {t('membership.supporter_since', {
                  date: new Date(user.supporter_since).toLocaleDateString(),
                })}
              </Text>
            )}
          </View>
        </View>

        {/* Notifications section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowNotifications(!showNotifications)}
          >
            <Text style={styles.sectionTitle}>{t('settings.my_questions')}</Text>
            <View style={styles.notificationCount}>
              <Text style={styles.notificationCountText}>{notifications.length}</Text>
            </View>
            <Text style={styles.expandIcon}>{showNotifications ? '▼' : '▶'}</Text>
          </TouchableOpacity>

          {showNotifications && (
            <View style={styles.notificationsList}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
              ) : (
                notifications.map(sub => {
                  const isActivated = sub.question.status === 'active';
                  const progress = isActivated
                    ? 100
                    : Math.round((sub.question.submission_count / sub.question.relevance_threshold) * 100);
                  const remaining = sub.question.relevance_threshold - sub.question.submission_count;

                  return (
                    <View key={sub.id} style={styles.notificationItem}>
                      <View style={styles.notificationInfo}>
                        <Text style={styles.notificationWord}>{sub.question.word}</Text>
                        
                        {/* Progress bar */}
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${progress}%` },
                              isActivated && styles.progressFillActive,
                            ]}
                          />
                        </View>

                        {isActivated ? (
                          <Text style={styles.activatedText}>
                            ✅ {t('notifications.activated')}
                          </Text>
                        ) : (
                          <Text style={styles.remainingText}>
                            {t('notifications.submissions_needed', { count: remaining })}
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={styles.unsubscribeButton}
                        onPress={() => handleUnsubscribe(sub.id)}
                      >
                        <Text style={styles.unsubscribeText}>🔕</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* Preferences section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Einstellungen</Text>

          {/* Language */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.language')}</Text>
            <View style={styles.languageOptions}>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'de' && styles.languageOptionSelected,
                ]}
                onPress={() => handleLanguageChange('de')}
              >
                <Text
                  style={[
                    styles.languageOptionText,
                    language === 'de' && styles.languageOptionTextSelected,
                  ]}
                >
                  DE
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.languageOption,
                  language === 'en' && styles.languageOptionSelected,
                ]}
                onPress={() => handleLanguageChange('en')}
              >
                <Text
                  style={[
                    styles.languageOptionText,
                    language === 'en' && styles.languageOptionTextSelected,
                  ]}
                >
                  EN
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sounds */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('settings.sounds')}</Text>
            <Switch
              value={soundEnabled}
              onValueChange={handleSoundToggle}
              trackColor={{ false: COLORS.gray300, true: COLORS.yes }}
              thumbColor={COLORS.white}
            />
          </View>

          {/* Haptics */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Haptik</Text>
            <Switch
              value={hapticsEnabled}
              onValueChange={handleHapticsToggle}
              trackColor={{ false: COLORS.gray300, true: COLORS.yes }}
              thumbColor={COLORS.white}
            />
          </View>

          {/* Feed mode */}
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{t('settings.feed_mode')}</Text>
            <View style={styles.feedModeOptions}>
              {(['global', 'country', 'region', 'mixed'] as FeedMode[]).map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.feedModeOption,
                    feedMode === mode && styles.feedModeOptionSelected,
                  ]}
                  onPress={() => handleFeedModeChange(mode)}
                >
                  <Text
                    style={[
                      styles.feedModeText,
                      feedMode === mode && styles.feedModeTextSelected,
                    ]}
                  >
                    {t(`feed_mode.${mode}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Profile section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.menuItemText}>{t('settings.profile')}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handlePasswordReset}>
            <Text style={styles.menuItemText}>{t('settings.password_reset')}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.legal')}</Text>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>{t('settings.privacy_policy')}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>{t('settings.terms')}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>{t('settings.imprint')}</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Abmelden</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteButtonText}>{t('settings.delete_account')}</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.version}>
          {t('settings.version')} 1.0.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    flex: 1,
  },
  notificationCount: {
    backgroundColor: COLORS.gold,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  notificationCountText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '700',
  },
  expandIcon: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  membershipCard: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
  },
  membershipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  membershipLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  verifiedBadge: {
    backgroundColor: COLORS.yes,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 12,
  },
  verifiedText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
  },
  membershipStats: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  upgradeButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  supporterSince: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
  },
  notificationsList: {
    marginTop: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    padding: 20,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  notificationInfo: {
    flex: 1,
  },
  notificationWord: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.gray300,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 3,
  },
  progressFillActive: {
    backgroundColor: COLORS.yes,
  },
  activatedText: {
    fontSize: 12,
    color: COLORS.yes,
    fontWeight: '600',
  },
  remainingText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  unsubscribeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  unsubscribeText: {
    fontSize: 18,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  settingRowVertical: {
    paddingVertical: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  languageOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  languageOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1F2937',
  },
  languageOptionSelected: {
    backgroundColor: COLORS.black,
  },
  languageOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  languageOptionTextSelected: {
    color: COLORS.white,
  },
  feedModeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  feedModeOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#1F2937',
  },
  feedModeOptionSelected: {
    backgroundColor: COLORS.black,
  },
  feedModeText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  feedModeTextSelected: {
    color: COLORS.white,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  menuArrow: {
    fontSize: 20,
    color: COLORS.gray300,
  },
  actionsSection: {
    marginTop: 16,
    gap: 12,
  },
  signOutButton: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButton: {
    backgroundColor: COLORS.noLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.no,
  },
  version: {
    fontSize: 12,
    color: COLORS.gray300,
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 24,
  },
});
