// app/admin/index.tsx
// Mobile Admin Portal - 7×Tap access on version number
// Same auth flow as web, optimized for mobile

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
  FlatList,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { COLORS } from '../../lib/constants';
import hapticPatterns from '../../lib/haptics';

const API_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

type AuthStep = 'login' | 'totp-setup' | 'totp' | 'authenticated';
type AdminTab = 'questions' | 'moderation' | 'kyc' | 'trust' | 'nominations' | 'analytics' | 'push';

interface AdminSession {
  token: string;
  role: 'super_admin' | 'moderator';
}

export default function MobileAdminScreen() {
  const router = useRouter();
  
  // Auth state
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin state
  const [activeTab, setActiveTab] = useState<AdminTab>('questions');
  const [questions, setQuestions] = useState<any[]>([]);
  const [moderationItems, setModerationItems] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // ==================== AUTH ====================
  async function handleLogin() {
    if (!email || !password) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/functions/v1/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.needsTotpSetup && result.tempToken) {
        setTempToken(result.tempToken);
        const setupResult = await fetch(`${API_URL}/functions/v1/admin-totp-setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: result.tempToken }),
        }).then(r => r.json());

        if (setupResult.otpauthUri) {
          setOtpauthUri(setupResult.otpauthUri);
          setAuthStep('totp-setup');
        }
      } else if (result.needsTotp && result.tempToken) {
        setTempToken(result.tempToken);
        setAuthStep('totp');
      }
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotpVerify() {
    if (totpCode.length !== 6) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/functions/v1/admin-totp-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, totpCode }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        await hapticPatterns.error();
        return;
      }

      if (result.sessionToken) {
        await hapticPatterns.success();
        setSession({
          token: result.sessionToken,
          role: result.admin?.role || 'moderator',
        });
        setAuthStep('authenticated');
        loadDashboardData(result.sessionToken);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    if (session) {
      await fetch(`${API_URL}/functions/v1/admin-logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`,
        },
      });
    }
    setSession(null);
    setAuthStep('login');
    setEmail('');
    setPassword('');
    setTotpCode('');
  }

  // ==================== API CALLS ====================
  async function adminApi(action: string, payload?: any) {
    if (!session) return null;

    const response = await fetch(`${API_URL}/functions/v1/admin-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.token}`,
      },
      body: JSON.stringify({ action, payload }),
    });

    const result = await response.json();

    if (response.status === 401) {
      Alert.alert('Session abgelaufen', 'Bitte erneut anmelden.');
      handleLogout();
      return null;
    }

    return result;
  }

  async function loadDashboardData(token?: string) {
    const t = token || session?.token;
    if (!t) return;

    try {
      const [questionsResult, moderationResult, analyticsResult] = await Promise.all([
        adminApi('get_questions', { status: 'pending' }),
        adminApi('get_moderation_queue'),
        adminApi('get_analytics'),
      ]);

      if (questionsResult?.questions) setQuestions(questionsResult.questions);
      if (moderationResult?.items) setModerationItems(moderationResult.items);
      if (analyticsResult?.analytics) setAnalytics(analyticsResult.analytics);
    } catch (err) {
      console.error('Load data error:', err);
    }
  }

  async function handleActivateQuestion(questionId: string) {
    await hapticPatterns.tap();
    const result = await adminApi('activate_question', { questionId });
    if (result?.success) {
      await hapticPatterns.success();
      loadDashboardData();
    }
  }

  async function handleBlockQuestion(questionId: string) {
    await hapticPatterns.tap();
    const result = await adminApi('block_question', { questionId });
    if (result?.success) {
      loadDashboardData();
    }
  }

  async function handleResolveModeration(itemId: string, resolution: string) {
    await hapticPatterns.tap();
    const result = await adminApi('resolve_moderation', { itemId, resolution });
    if (result?.success) {
      await hapticPatterns.success();
      loadDashboardData();
    }
  }

  // ==================== RENDER ====================
  const isSuperAdmin = session?.role === 'super_admin';
  const visibleTabs: AdminTab[] = isSuperAdmin
    ? ['questions', 'moderation', 'kyc', 'trust', 'nominations', 'analytics', 'push']
    : ['questions', 'moderation', 'nominations', 'analytics', 'push'];

  // Login Screen
  if (authStep === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.logo}>#RAWLZ</Text>
          <Text style={styles.subtitle}>Admin Portal</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            style={styles.input}
            placeholder="E-Mail"
            placeholderTextColor={COLORS.gray500}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Passwort"
            placeholderTextColor={COLORS.gray500}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <Text style={styles.primaryButtonText}>Anmelden</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← Zurück zur App</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TOTP Setup Screen
  if (authStep === 'totp-setup') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.title}>2FA einrichten</Text>
          <Text style={styles.description}>
            Scanne den QR-Code mit deiner Authenticator-App
          </Text>

          <View style={styles.qrContainer}>
            <QRCode value={otpauthUri} size={180} />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={COLORS.gray300}
            value={totpCode}
            onChangeText={(t) => setTotpCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity
            style={[styles.primaryButton, totpCode.length !== 6 && styles.buttonDisabled]}
            onPress={handleTotpVerify}
            disabled={isLoading || totpCode.length !== 6}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <Text style={styles.primaryButtonText}>Bestätigen</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // TOTP Verify Screen
  if (authStep === 'totp') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.authContainer}>
          <Text style={styles.title}>2FA-Code eingeben</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={COLORS.gray300}
            value={totpCode}
            onChangeText={(t) => setTotpCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          <TouchableOpacity
            style={[styles.primaryButton, totpCode.length !== 6 && styles.buttonDisabled]}
            onPress={handleTotpVerify}
            disabled={isLoading || totpCode.length !== 6}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.black} />
            ) : (
              <Text style={styles.primaryButtonText}>Anmelden</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Authenticated Dashboard
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Abmelden</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {visibleTabs.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'questions' ? '📋' :
               tab === 'moderation' ? '🛡️' :
               tab === 'kyc' ? '🔐' :
               tab === 'trust' ? '⭐' :
               tab === 'nominations' ? '🏆' :
               tab === 'analytics' ? '📊' : '🔔'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView style={styles.content}>
        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <View>
            <Text style={styles.sectionTitle}>Ausstehende Fragen ({questions.length})</Text>
            {questions.map((q) => (
              <View key={q.id} style={styles.card}>
                <Text style={styles.cardTitle}>{q.word}</Text>
                <Text style={styles.cardMeta}>
                  {q.submission_count} Einreichungen · {q.notification_subscribers || 0} Abonnenten
                </Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleActivateQuestion(q.id)}
                  >
                    <Text style={styles.actionButtonText}>✅ Freischalten</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonDanger]}
                    onPress={() => handleBlockQuestion(q.id)}
                  >
                    <Text style={styles.actionButtonTextDanger}>🚫 Sperren</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {questions.length === 0 && (
              <Text style={styles.emptyText}>Keine ausstehenden Fragen</Text>
            )}
          </View>
        )}

        {/* Moderation Tab */}
        {activeTab === 'moderation' && (
          <View>
            <Text style={styles.sectionTitle}>Moderation Queue ({moderationItems.length})</Text>
            {moderationItems.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.entity_type}</Text>
                  <Text style={[styles.priorityBadge,
                    item.priority === 1 ? styles.priorityHigh :
                    item.priority === 2 ? styles.priorityMedium : styles.priorityLow
                  ]}>
                    {item.priority === 1 ? '🔴' : item.priority === 2 ? '🟡' : '🟢'}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>{item.reason}</Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleResolveModeration(item.id, 'approved')}
                  >
                    <Text style={styles.actionButtonText}>✅</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonDanger]}
                    onPress={() => handleResolveModeration(item.id, 'rejected')}
                  >
                    <Text style={styles.actionButtonTextDanger}>🚫</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {moderationItems.length === 0 && (
              <Text style={styles.emptyText}>Keine Einträge</Text>
            )}
          </View>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <View>
            <Text style={styles.sectionTitle}>Analytics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{analytics.dau?.toLocaleString() || 0}</Text>
                <Text style={styles.statLabel}>DAU</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{analytics.mau?.toLocaleString() || 0}</Text>
                <Text style={styles.statLabel}>MAU</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{analytics.totalVotes?.toLocaleString() || 0}</Text>
                <Text style={styles.statLabel}>Stimmen</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{analytics.totalQuestions?.toLocaleString() || 0}</Text>
                <Text style={styles.statLabel}>Fragen</Text>
              </View>
            </View>
            {isSuperAdmin && analytics.supporterRevenue !== undefined && (
              <View style={styles.revenueSection}>
                <Text style={styles.revenueTitle}>Revenue</Text>
                <Text style={styles.revenueValue}>
                  Supporter: €{analytics.supporterRevenue} · Lobby: €{analytics.lobbyRevenue}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* KYC Tab (Super Admin only) */}
        {activeTab === 'kyc' && isSuperAdmin && (
          <View>
            <Text style={styles.sectionTitle}>KYC Queue</Text>
            <Text style={styles.emptyText}>KYC-Anträge werden hier angezeigt</Text>
          </View>
        )}

        {/* Trust Score Tab (Super Admin only) */}
        {activeTab === 'trust' && isSuperAdmin && (
          <View>
            <Text style={styles.sectionTitle}>Trust Score Manager</Text>
            <Text style={styles.emptyText}>User-Suche über Device Hash</Text>
          </View>
        )}

        {/* Nominations Tab */}
        {activeTab === 'nominations' && (
          <View>
            <Text style={styles.sectionTitle}>Experten-Nominierungen</Text>
            <Text style={styles.emptyText}>Nominierungen werden hier angezeigt</Text>
          </View>
        )}

        {/* Push Tab */}
        {activeTab === 'push' && (
          <View>
            <Text style={styles.sectionTitle}>Push Notifications</Text>
            <Text style={styles.emptyText}>Push-Verwaltung im Web Admin</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  authContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    color: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: COLORS.white,
    fontSize: 16,
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    color: COLORS.white,
    fontSize: 32,
    textAlign: 'center',
    letterSpacing: 12,
    marginBottom: 24,
  },
  qrContainer: {
    backgroundColor: COLORS.white,
    padding: 16,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: COLORS.black,
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    alignItems: 'center',
  },
  backButtonText: {
    color: COLORS.gray500,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 14,
  },
  tabBar: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
  },
  tabText: {
    fontSize: 20,
  },
  tabTextActive: {
    opacity: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.gray500,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  actionButtonText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextDanger: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  priorityBadge: {
    fontSize: 16,
  },
  priorityHigh: {},
  priorityMedium: {},
  priorityLow: {},
  emptyText: {
    color: COLORS.gray500,
    textAlign: 'center',
    padding: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 4,
  },
  revenueSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  revenueTitle: {
    fontSize: 14,
    color: COLORS.gold,
    marginBottom: 4,
  },
  revenueValue: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
});
