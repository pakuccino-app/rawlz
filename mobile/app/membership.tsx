// app/membership.tsx
// Full Membership Screen with all membership types
// BASIS, SUPPORTER, EXPERTE, LOBBY (commercial & subsidized)

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { COLORS } from '../lib/constants';
import { supabase, getCurrentUser, getSession } from '../lib/supabase';
import { purchaseSupporter, restoreSupporter } from '../lib/revenuecat';
import hapticPatterns from '../lib/haptics';

interface User {
  id: string;
  membership_type: 'basis' | 'supporter' | 'expert' | 'lobby';
  is_verified: boolean;
  supporter_since?: string;
  trust_score: number;
  has_2fa: boolean;
}

interface LobbyAccount {
  id: string;
  account_type: 'commercial' | 'subsidized';
  subscription_status: 'pending' | 'active' | 'past_due' | 'cancelled';
  subsidy_valid_until?: string;
  company_name?: string;
}

interface VouchInfo {
  total: number;
  active: number;
}

export default function MembershipScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [lobbyAccount, setLobbyAccount] = useState<LobbyAccount | null>(null);
  const [vouchInfo, setVouchInfo] = useState<VouchInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const authUser = await getCurrentUser();
      if (!authUser) return;

      // Load user
      const { data: userData } = await supabase
        .from('users')
        .select('id, membership_type, is_verified, supporter_since, trust_score, has_2fa')
        .eq('id', authUser.id)
        .single();

      if (userData) {
        setUser(userData);

        // Load lobby account if applicable
        if (userData.membership_type === 'lobby') {
          const { data: lobbyData } = await supabase
            .from('lobby_accounts')
            .select('*')
            .eq('user_id', authUser.id)
            .single();
          setLobbyAccount(lobbyData);
        }

        // Load vouch info if expert
        if (userData.membership_type === 'expert') {
          const { count: activeVouches } = await supabase
            .from('expert_vouches')
            .select('*', { count: 'exact', head: true })
            .eq('voucher_id', authUser.id)
            .eq('status', 'active');

          setVouchInfo({
            total: 5,
            active: activeVouches || 0,
          });
        }
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurchaseSupporter() {
    setIsPurchasing(true);
    await hapticPatterns.tap();

    try {
      const result = await purchaseSupporter();

      if (result.success) {
        await hapticPatterns.success();
        Alert.alert('Erfolg! 🎉', 'Du bist jetzt RAWLZ Supporter!');
        loadData();
      } else if (result.shouldRestore) {
        handleRestoreSupporter();
      } else if (result.error) {
        Alert.alert('Fehler', result.error);
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Kauf fehlgeschlagen.');
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handleRestoreSupporter() {
    setIsRestoring(true);
    await hapticPatterns.tap();

    try {
      const result = await restoreSupporter();

      if (result.success) {
        await hapticPatterns.success();
        Alert.alert('Erfolg!', 'Dein Supporter-Status wurde wiederhergestellt!');
        loadData();
      } else if (result.error) {
        Alert.alert('Info', result.error);
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Wiederherstellung fehlgeschlagen.');
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleOpenBillingPortal() {
    await hapticPatterns.tap();

    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-billing-portal`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (result.portalUrl) {
        Linking.openURL(result.portalUrl);
      } else {
        Alert.alert('Fehler', result.error || 'Portal konnte nicht geöffnet werden.');
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message);
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
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('settings.membership')}</Text>
        </View>

        {/* Current membership card */}
        <View style={[
          styles.membershipCard,
          user?.membership_type === 'supporter' && styles.membershipCardGold,
          user?.membership_type === 'expert' && styles.membershipCardGreen,
          user?.membership_type === 'lobby' && styles.membershipCardBlue,
        ]}>
          <View style={styles.membershipBadge}>
            <Text style={styles.membershipBadgeText}>
              {user?.membership_type === 'basis' ? 'BASIS' :
               user?.membership_type === 'supporter' ? '⭐ SUPPORTER' :
               user?.membership_type === 'expert' ? '🏆 EXPERTE' :
               '🏢 LOBBY'}
            </Text>
          </View>

          {user?.is_verified && (
            <View style={styles.verifiedTag}>
              <Text style={styles.verifiedTagText}>✓ Verifiziert</Text>
            </View>
          )}
        </View>

        {/* BASIS membership */}
        {user?.membership_type === 'basis' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Werde Supporter</Text>
            <Text style={styles.sectionDescription}>
              {t('membership.supporter_benefits')}
            </Text>

            <TouchableOpacity
              style={styles.purchaseButton}
              onPress={handlePurchaseSupporter}
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.purchaseButtonText}>
                  {t('membership.supporter_cta')} – {t('membership.supporter_price')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestoreSupporter}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator color={COLORS.gold} />
              ) : (
                <Text style={styles.restoreButtonText}>
                  {t('membership.restore_purchase')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* SUPPORTER membership */}
        {user?.membership_type === 'supporter' && (
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Supporter seit</Text>
              <Text style={styles.infoValue}>
                {user.supporter_since
                  ? new Date(user.supporter_since).toLocaleDateString('de-DE')
                  : '-'}
              </Text>
            </View>

            <View style={styles.benefitsList}>
              <Text style={styles.benefitsTitle}>Deine Vorteile:</Text>
              <Text style={styles.benefitItem}>✓ Ergebnisse ab 100 Stimmen sichtbar</Text>
              <Text style={styles.benefitItem}>✓ Reduzierte Schwelle für Vorschläge (30)</Text>
              <Text style={styles.benefitItem}>✓ +10 Trust Score</Text>
            </View>
          </View>
        )}

        {/* EXPERTE membership */}
        {user?.membership_type === 'expert' && (
          <View style={styles.section}>
            {/* Trust Score */}
            <View style={styles.trustSection}>
              <Text style={styles.trustTitle}>Trust Score</Text>
              <View style={styles.trustBarContainer}>
                <View style={[styles.trustBar, { width: `${Math.min(100, user.trust_score)}%` }]} />
              </View>
              <Text style={styles.trustValue}>{user.trust_score} / 100</Text>
            </View>

            {/* Vouches */}
            {vouchInfo && (
              <View style={styles.vouchSection}>
                <Text style={styles.vouchTitle}>
                  {t('membership.expert_vouches', { count: vouchInfo.active })}
                </Text>
                <Text style={styles.vouchSubtitle}>
                  {vouchInfo.active} / {vouchInfo.total} aktive Vouches
                </Text>

                <TouchableOpacity
                  style={styles.manageVouchesButton}
                  onPress={() => router.push('/vouches')}
                >
                  <Text style={styles.manageVouchesText}>Vouches verwalten →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 2FA Status */}
            <View style={styles.twoFaSection}>
              <Text style={styles.twoFaTitle}>
                {user.has_2fa ? '🔒 2FA aktiviert' : '⚠️ 2FA nicht aktiviert'}
              </Text>
              {!user.has_2fa && (
                <TouchableOpacity
                  style={styles.setup2FaButton}
                  onPress={() => router.push('/2fa-setup')}
                >
                  <Text style={styles.setup2FaText}>2FA einrichten →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* LOBBY membership */}
        {user?.membership_type === 'lobby' && lobbyAccount && (
          <View style={styles.section}>
            {/* Subscription status banner */}
            <View style={[
              styles.statusBanner,
              lobbyAccount.subscription_status === 'active' && styles.statusBannerActive,
              lobbyAccount.subscription_status === 'past_due' && styles.statusBannerPastDue,
              lobbyAccount.subscription_status === 'cancelled' && styles.statusBannerCancelled,
            ]}>
              <Text style={styles.statusBannerText}>
                {lobbyAccount.subscription_status === 'active' && '✓ Aktiv'}
                {lobbyAccount.subscription_status === 'past_due' && '⚠️ Zahlung ausstehend'}
                {lobbyAccount.subscription_status === 'cancelled' && '✗ Gekündigt'}
              </Text>
            </View>

            {/* Company info */}
            {lobbyAccount.company_name && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Organisation</Text>
                <Text style={styles.infoValue}>{lobbyAccount.company_name}</Text>
              </View>
            )}

            {/* Subsidized: valid until */}
            {lobbyAccount.account_type === 'subsidized' && lobbyAccount.subsidy_valid_until && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gültig bis</Text>
                <Text style={styles.infoValue}>
                  {new Date(lobbyAccount.subsidy_valid_until).toLocaleDateString('de-DE')}
                </Text>
              </View>
            )}

            {/* Commercial: Billing Portal */}
            {lobbyAccount.account_type === 'commercial' && (
              <>
                {lobbyAccount.subscription_status === 'past_due' && (
                  <TouchableOpacity
                    style={styles.updatePaymentButton}
                    onPress={handleOpenBillingPortal}
                  >
                    <Text style={styles.updatePaymentText}>
                      Zahlungsdaten aktualisieren →
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.billingPortalButton}
                  onPress={handleOpenBillingPortal}
                >
                  <Text style={styles.billingPortalText}>
                    {t('membership.lobby_manage_billing')} →
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Membership comparison */}
        <View style={styles.comparisonSection}>
          <Text style={styles.comparisonTitle}>Mitgliedschaftsvergleich</Text>

          <View style={styles.comparisonTable}>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Ergebnisse sichtbar ab</Text>
              <Text style={styles.comparisonBasis}>500</Text>
              <Text style={styles.comparisonSupporter}>100</Text>
              <Text style={styles.comparisonExpert}>200</Text>
              <Text style={styles.comparisonLobby}>50</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Vorschlag-Schwelle</Text>
              <Text style={styles.comparisonBasis}>50</Text>
              <Text style={styles.comparisonSupporter}>30</Text>
              <Text style={styles.comparisonExpert}>30</Text>
              <Text style={styles.comparisonLobby}>30</Text>
            </View>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonFeature}>Stimme ändern</Text>
              <Text style={styles.comparisonBasis}>1×</Text>
              <Text style={styles.comparisonSupporter}>3×</Text>
              <Text style={styles.comparisonExpert}>∞</Text>
              <Text style={styles.comparisonLobby}>∞</Text>
            </View>
          </View>
        </View>
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
  scrollView: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
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
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.black,
  },
  membershipCard: {
    backgroundColor: COLORS.gray100,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  membershipCardGold: {
    backgroundColor: COLORS.goldLight,
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  membershipCardGreen: {
    backgroundColor: COLORS.yesLight,
    borderWidth: 2,
    borderColor: COLORS.yes,
  },
  membershipCardBlue: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  membershipBadge: {
    marginBottom: 12,
  },
  membershipBadgeText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.black,
  },
  verifiedTag: {
    backgroundColor: COLORS.yes,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  verifiedTagText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 20,
    lineHeight: 22,
  },
  purchaseButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  purchaseButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  restoreButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  infoLabel: {
    fontSize: 16,
    color: COLORS.gray500,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  benefitsList: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 12,
  },
  benefitItem: {
    fontSize: 14,
    color: COLORS.gray700,
    marginBottom: 8,
  },
  trustSection: {
    marginBottom: 24,
  },
  trustTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 12,
  },
  trustBarContainer: {
    height: 12,
    backgroundColor: COLORS.gray200,
    borderRadius: 6,
    overflow: 'hidden',
  },
  trustBar: {
    height: '100%',
    backgroundColor: COLORS.yes,
    borderRadius: 6,
  },
  trustValue: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 8,
    textAlign: 'right',
  },
  vouchSection: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  vouchTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 4,
  },
  vouchSubtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 12,
  },
  manageVouchesButton: {
    alignSelf: 'flex-start',
  },
  manageVouchesText: {
    fontSize: 14,
    color: COLORS.yes,
    fontWeight: '600',
  },
  twoFaSection: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 20,
  },
  twoFaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 8,
  },
  setup2FaButton: {
    alignSelf: 'flex-start',
  },
  setup2FaText: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  statusBanner: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  statusBannerActive: {
    backgroundColor: COLORS.yesLight,
  },
  statusBannerPastDue: {
    backgroundColor: COLORS.goldLight,
  },
  statusBannerCancelled: {
    backgroundColor: COLORS.noLight,
  },
  statusBannerText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
  },
  updatePaymentButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  updatePaymentText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  billingPortalButton: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  billingPortalText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '600',
  },
  comparisonSection: {
    marginTop: 16,
    marginBottom: 32,
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
  },
  comparisonTable: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    overflow: 'hidden',
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.white,
  },
  comparisonFeature: {
    flex: 2,
    fontSize: 12,
    color: COLORS.gray500,
  },
  comparisonBasis: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gray700,
    textAlign: 'center',
  },
  comparisonSupporter: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '600',
    textAlign: 'center',
  },
  comparisonExpert: {
    flex: 1,
    fontSize: 12,
    color: COLORS.yes,
    fontWeight: '600',
    textAlign: 'center',
  },
  comparisonLobby: {
    flex: 1,
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
    textAlign: 'center',
  },
});
