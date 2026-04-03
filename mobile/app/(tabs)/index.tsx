// app/(tabs)/index.tsx
// Swipe Screen — RAWLZ (Punkte 1–9 implementiert)

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';

import { COLORS, getWordFontSize, RESULT_THRESHOLDS, ANIMATIONS } from '../../lib/constants';
import { supabase, getCurrentUser, getSession } from '../../lib/supabase';
import { useUserCtx } from '../../lib/userContext';
import hapticPatterns from '../../lib/haptics';
import { playSound } from '../../lib/sounds';
import {
  prefetchQuestions,
  getCachedQuestions,
  queueVote,
  syncOfflineQueue,
  getPendingVoteCount,
  removeFromCache,
  startNetworkListener,
  stopNetworkListener,
} from '../../lib/offlineQueue';

// Components
import DailyPulseCard from '../../components/DailyPulseCard';
import WirksamkeitOverlay from '../../components/WirksamkeitOverlay';
import AbuseReportSheet from '../../components/AbuseReportSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const VERTICAL_SWIPE_THRESHOLD = 80; // Bug 2: fester Wert für DOWN/UP

interface Question {
  id: string;
  word: string;
  yes_count: number;
  no_count: number;
  total_votes: number;
  relevance_threshold: number;
  is_daily_pulse: boolean;
  ai_context_cache: any;
}

interface User {
  id: string;
  membership_type: string;
  is_verified: boolean;
  geo_country?: string;
  geo_region?: string;
  geo_preference: string;
  streak_count: number;
  active_days_count: number;
  last_active_date?: string;
  wirksamkeit_shown: boolean;
}

interface WirksamkeitData {
  totalVotes: number;
  effectiveVotes: number;
  effectivenessPct: number;
}

// ─── DASHBOARD SHEET COMPONENT ────────────────────────────────────────────────
// Punkt 3: Globus-Button öffnet dieses Sheet (BlurView, Membership, Trust, Votes, Badges, Geo)

interface DashboardSheetProps {
  visible: boolean;
  onClose: () => void;
  user: any;
}

const BADGE_DEFS = [
  { key: 'first_vote',   icon: '📦', label: 'Erste Stimme',   minVotes: 1,   membership: null, minStreak: 0 },
  { key: 'active',       icon: '🔥', label: 'Aktiv',           minVotes: 10,  membership: null, minStreak: 0 },
  { key: 'power_voter',  icon: '⚡', label: 'Power-Voter',     minVotes: 50,  membership: null, minStreak: 0 },
  { key: 'wirksamkeit',  icon: '💯', label: 'Wirksamkeit',     minVotes: 100, membership: null, minStreak: 0 },
  { key: 'supporter',    icon: '⭐', label: 'Supporter',       minVotes: 0,   membership: 'supporter', minStreak: 0 },
  { key: 'wochenpuls',   icon: '📅', label: 'Wochenpuls',      minVotes: 0,   membership: null, minStreak: 7 },
];

const GEO_OPTIONS = [
  { key: 'global', label: '🌍 Global' },
  { key: 'country', label: '🏳️ Mein Land' },
  { key: 'region', label: '📍 Meine Region' },
];

const MEMBERSHIP_LABELS: Record<string, string> = {
  basis: 'Basis', supporter: 'Supporter', expert: 'Experte', lobby: 'Lobby',
};
const MEMBERSHIP_CHARS: Record<string, string> = {
  basis: 'B', supporter: 'S', expert: 'E', lobby: 'L',
};

function DashboardSheet({ visible, onClose, user }: DashboardSheetProps) {
  const [voteStats, setVoteStats] = useState({ yes: 0, no: 0, total: 0 });
  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(new Set());
  const [geoFilter, setGeoFilter] = useState('global'); // session-only, kein DB-Write
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  useEffect(() => {
    if (visible && user?.id) {
      loadStats();
    }
  }, [visible, user?.id]);

  async function loadStats() {
    if (!user?.id) return;
    setIsLoadingStats(true);
    try {
      // Punkt 3D: SELECT vote_value, COUNT(*) FROM votes WHERE user_id=$uid GROUP BY vote_value
      const { data: votes } = await supabase
        .from('votes')
        .select('vote_value')
        .eq('user_id', user.id);

      const yes = (votes || []).filter((v: any) => v.vote_value === 'yes').length;
      const no  = (votes || []).filter((v: any) => v.vote_value === 'no').length;
      setVoteStats({ yes, no, total: (votes || []).length });

      // Badges earned
      const earned = new Set<string>();
      const totalV = (votes || []).length;
      if (totalV >= 1)   earned.add('first_vote');
      if (totalV >= 10)  earned.add('active');
      if (totalV >= 50)  earned.add('power_voter');
      if (totalV >= 100) earned.add('wirksamkeit');
      if (user.membership_type === 'supporter') earned.add('supporter');
      if ((user.streak_count || 0) >= 7) earned.add('wochenpuls');
      setEarnedBadges(earned);
    } finally {
      setIsLoadingStats(false);
    }
  }

  const trust = user?.trust_score || 0;
  const trustColor = trust >= 85 ? '#D4AF37' : '#16A34A';
  const memType = user?.membership_type || 'basis';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ds.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={ds.sheetContainer}>
        <BlurView intensity={80} tint="light" style={ds.blur}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>

            {/* A) HEADER */}
            <View style={ds.handle} />
            <View style={ds.header}>
              <Text style={ds.logo}>#RAWLZ  🔥</Text>
              <Text style={ds.headerTitle}>Deine Wahl</Text>
              <Text style={ds.headerSub}>Weiter abstimmen, um deinen Streak aufzubauen</Text>
            </View>

            {/* B) MITGLIEDSCHAFT */}
            <View style={ds.tile}>
              <View style={[ds.memberCircle, { backgroundColor: memType === 'lobby' ? '#7C3AED' : memType === 'expert' ? '#2563EB' : memType === 'supporter' ? '#D4AF37' : '#6B7280' }]}>
                <Text style={ds.memberChar}>{MEMBERSHIP_CHARS[memType] || 'B'}</Text>
              </View>
              <Text style={ds.memberLabel}>{MEMBERSHIP_LABELS[memType] || 'Basis'}</Text>
            </View>

            {/* C) VERTRAUENSWERT */}
            <View style={ds.tile}>
              <Text style={ds.tileLabel}>Vertrauenswert: <Text style={{ color: trustColor, fontWeight: '700' }}>{trust} / 100</Text></Text>
              <View style={ds.trustBar}>
                <View style={[ds.trustFill, { width: `${trust}%` as any, backgroundColor: trustColor }]} />
              </View>
              <Text style={ds.tileHint}>Experte ab ≥ 85</Text>
            </View>

            {/* D) VOTING-STATISTIK */}
            <View style={[ds.tile, { flexDirection: 'row', gap: 8 }]}>
              <View style={[ds.statBox, { backgroundColor: '#DCFCE7' }]}>
                <Text style={ds.statNum}>{voteStats.yes}</Text>
                <Text style={[ds.statLabel, { color: '#16A34A' }]}>JA</Text>
              </View>
              <View style={[ds.statBox, { backgroundColor: '#FEE2E2' }]}>
                <Text style={ds.statNum}>{voteStats.no}</Text>
                <Text style={[ds.statLabel, { color: '#DC2626' }]}>NEIN</Text>
              </View>
              <View style={[ds.statBox, { backgroundColor: '#FEF9C3' }]}>
                <Text style={ds.statNum}>{voteStats.total}</Text>
                <Text style={[ds.statLabel, { color: '#92400E' }]}>Gesamt</Text>
              </View>
            </View>

            {/* E) BADGES 3×2 */}
            <View style={[ds.tile, { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
              {BADGE_DEFS.map(b => {
                const earned = earnedBadges.has(b.key);
                return (
                  <View key={b.key} style={[ds.badge, !earned && ds.badgeLocked]}>
                    <Text style={[ds.badgeIcon, !earned && { opacity: 0.3 }]}>{b.icon}</Text>
                    <Text style={[ds.badgeLabel, !earned && { color: '#9CA3AF' }]}>{b.label}</Text>
                    {earned && <Text style={ds.badgeCheck}>✓</Text>}
                    {!earned && <Text style={ds.badgeLock}>🔒</Text>}
                  </View>
                );
              })}
            </View>

            {/* F) GEO-FILTER — session only, kein DB-Write */}
            <View style={ds.tile}>
              <View style={ds.separator} />
              <Text style={ds.tileLabel}>Feed anzeigen:</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {GEO_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[ds.geoBtn, geoFilter === opt.key && ds.geoBtnActive]}
                    onPress={() => setGeoFilter(opt.key)}
                  >
                    <Text style={[ds.geoBtnText, geoFilter === opt.key && ds.geoBtnTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </BlurView>
      </View>
    </Modal>
  );
}

const ds = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetContainer: { height: '75%', overflow: 'hidden', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  blur: { flex: 1, padding: 0 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#C7C7CC', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  header: { paddingHorizontal: 20, paddingVertical: 12 },
  logo: { fontSize: 22, fontWeight: '900', color: '#000', letterSpacing: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#000', marginTop: 2 },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tile: { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  tileLabel: { fontSize: 14, color: '#374151', fontWeight: '600' },
  tileHint: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  memberCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 6, alignSelf: 'center' },
  memberChar: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  memberLabel: { fontSize: 14, fontWeight: '600', color: '#000', textAlign: 'center' },
  trustBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginTop: 8, overflow: 'hidden' },
  trustFill: { height: '100%', borderRadius: 4 },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  statNum: { fontSize: 24, fontWeight: '900', color: '#000' },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  badge: { width: '30%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  badgeLocked: { backgroundColor: '#F3F4F6' },
  badgeIcon: { fontSize: 24, marginBottom: 4 },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center' },
  badgeCheck: { fontSize: 11, color: '#16A34A', marginTop: 2 },
  badgeLock: { fontSize: 11, marginTop: 2 },
  separator: { height: 1, backgroundColor: '#E5E7EB', marginBottom: 12 },
  geoBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' },
  geoBtnActive: { backgroundColor: '#000' },
  geoBtnText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  geoBtnTextActive: { color: '#FFF' },
});

// ─── MAIN SWIPE SCREEN ────────────────────────────────────────────────────────

export default function SwipeScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ questionId?: string }>();
  const { setStreak, registerOpenDashboard } = useUserCtx();

  // Punkt 3: Dashboard Sheet
  const [showDashboard, setShowDashboard] = useState(false);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [resultData, setResultData] = useState<{ yes: number; no: number; total: number } | null>(null);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const [showAIOverlay, setShowAIOverlay] = useState(false);
  const [aiContent, setAIContent] = useState<any>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  // Pending result: collected during submitVote, shown AFTER card exits
  const pendingResultRef = useRef<{ yes: number; no: number; total: number } | null>(null);
  
  // Wirksamkeit state
  const [showWirksamkeit, setShowWirksamkeit] = useState(false);
  const [wirksamkeitData, setWirksamkeitData] = useState<WirksamkeitData | null>(null);
  
  // Abuse reporting state
  const [showAbuseReport, setShowAbuseReport] = useState(false);

  // Animation values
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  // Load user and questions + Dashboard-Sheet registrieren (Punkt 3 + Punkt 7)
  useEffect(() => {
    loadData();
    startNetworkListener();
    // Punkt 3/7: Tab-Bar 🌍 kann das Sheet öffnen
    registerOpenDashboard(() => setShowDashboard(true));

    // Network state listener
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });

    return () => {
      unsubscribe();
      stopNetworkListener();
    };
  }, []);

  // Check pending offline votes
  useEffect(() => {
    const checkPending = async () => {
      const count = await getPendingVoteCount();
      setPendingCount(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle deep link to specific question
  useEffect(() => {
    if (params.questionId && questions.length > 0) {
      const idx = questions.findIndex(q => q.id === params.questionId);
      if (idx >= 0) {
        setCurrentIndex(idx);
      }
    }
  }, [params.questionId, questions]);

  async function loadData() {
    setIsLoading(true);
    try {
      const authUser = await getCurrentUser();
      if (!authUser) return;

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      // User existiert noch nicht → anlegen
      if (!userData) {
        const { generateDeviceHash } = await import('../../lib/hashing');
        const deviceHash = await generateDeviceHash();
        await supabase.from('users').insert({
          id: authUser.id,
          device_hash: deviceHash,
          consent_given_at: new Date().toISOString(),
          geo_preference: 'global',
        });
        const { data: newUser } = await supabase.from('users').select('*').eq('id', authUser.id).single();
        if (newUser) {
          setUser(newUser);
          await loadQuestions(newUser);
        }
        return;
      }

      if (userData) {
        setUser(userData);
        setStreak(userData.streak_count || 0); // Punkt 7: Tab-Bar Streak sync
        await loadQuestions(userData);
        
        // Prefetch for offline
        prefetchQuestions(
          userData.id,
          userData.geo_preference,
          userData.geo_country,
          userData.geo_region
        );
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadQuestions(userData: User) {
    const netState = await NetInfo.fetch();
    
    if (!netState.isConnected) {
      // Load from cache
      const cached = await getCachedQuestions(userData.id);
      let questions = cached.questions;
      if (cached.dailyPulse) {
        questions = [cached.dailyPulse, ...questions.filter(q => q.id !== cached.dailyPulse?.id)];
      }
      setQuestions(questions as any);
      setCurrentIndex(0);
      return;
    }

    // Get daily pulse first
    const today = new Date().toISOString().split('T')[0];
    const { data: dailyPulse } = await supabase
      .from('questions')
      .select('*')
      .eq('is_daily_pulse', true)
      .eq('daily_pulse_date', today)
      .eq('status', 'active')
      .maybeSingle();

    // Build query for regular questions
    let query = supabase
      .from('questions')
      .select('*')
      .eq('status', 'active');

    // Apply geo filter
    if (userData.geo_preference === 'global') {
      query = query.eq('geo_scope', 'global');
    } else if (userData.geo_preference === 'country' && userData.geo_country) {
      query = query.or(`geo_scope.eq.global,and(geo_scope.eq.country,geo_country.eq.${userData.geo_country})`);
    } else if (userData.geo_preference === 'region' && userData.geo_region) {
      query = query.or(`geo_scope.eq.global,and(geo_scope.eq.region,geo_region.eq.${userData.geo_region})`);
    } else {
      // Kein geo_preference gesetzt → global anzeigen
      query = query.eq('geo_scope', 'global');
    }

    query = query.order('total_votes', { ascending: false }).limit(30);
    const { data: allQuestions } = await query;

    // Filter out voted questions
    const { data: votedQuestions } = await supabase
      .from('votes')
      .select('question_id')
      .eq('user_id', userData.id);

    const votedIds = new Set((votedQuestions || []).map((v: any) => v.question_id));

    // Filter out archived
    const { data: archivedQuestions } = await supabase
      .from('user_archives')
      .select('question_id')
      .eq('user_id', userData.id);

    const archivedIds = new Set((archivedQuestions || []).map((a: any) => a.question_id));

    // INV-12: Snoozed-Fragen aus AsyncStorage prüfen
    // - snoozeUntil <= now → Frage zurück in Feed, Eintrag aus AsyncStorage löschen
    // - snoozeUntil > now  → Frage weiterhin ausschließen
    const snoozeRaw = await AsyncStorage.getItem('rawlz_snoozed');
    const snoozeList: { questionId: string; snoozeUntil: number }[] = snoozeRaw
      ? JSON.parse(snoozeRaw)
      : [];
    const now = Date.now();
    const stillSnoozed = snoozeList.filter(e => e.snoozeUntil > now);
    const snoozedIds = new Set(stillSnoozed.map(e => e.questionId));

    // Abgelaufene Einträge löschen (Fragen kommen zurück in den Feed)
    if (stillSnoozed.length !== snoozeList.length) {
      await AsyncStorage.setItem('rawlz_snoozed', JSON.stringify(stillSnoozed));
    }

    let filteredQuestions = (allQuestions || []).filter(
      (q: any) => !votedIds.has(q.id) && !archivedIds.has(q.id) && !snoozedIds.has(q.id)
    );

    // Add daily pulse at the beginning (INV-14)
    if (dailyPulse && !votedIds.has(dailyPulse.id) && !archivedIds.has(dailyPulse.id)) {
      filteredQuestions = [dailyPulse, ...filteredQuestions.filter((q: any) => q.id !== dailyPulse.id)];
    }

    setQuestions(filteredQuestions);
    setCurrentIndex(0);
  }

  const currentQuestion = questions[currentIndex];

  // Handle vote submission
  async function submitVote(voteValue: 'yes' | 'no' | 'skip' | 'deep_dive') {
    if (!user || !currentQuestion) return;

    const netState = await NetInfo.fetch();

    if (!netState.isConnected) {
      // Queue vote offline
      await queueVote({
        questionId: currentQuestion.id,
        voteValue,
        membershipType: user.membership_type,
        isVerified: user.is_verified,
        geoCountry: user.geo_country,
        geoPreference: user.geo_preference,
      });
      
      // Remove from local cache
      await removeFromCache(currentQuestion.id);
      advanceToNext();
      return;
    }

    try {
      // Insert vote
      const { error } = await supabase.from('votes').insert({
        question_id: currentQuestion.id,
        user_id: user.id,
        vote_value: voteValue,
        membership_type: user.membership_type,
        is_verified: user.is_verified,
        geo_country: user.geo_country,
        geo_preference: user.geo_preference,
      });

      if (error) throw error;

      // Punkt 3E: Badge-Check nach Vote INSERT
      if (voteValue === 'yes' || voteValue === 'no') {
        const { count: voteCount } = await supabase
          .from('votes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);
        const vc = voteCount || 0;
        const badgesToCheck: string[] = [];
        if (vc >= 1)   badgesToCheck.push('first_vote');
        if (vc >= 10)  badgesToCheck.push('active');
        if (vc >= 50)  badgesToCheck.push('power_voter');
        if (vc >= 100) badgesToCheck.push('wirksamkeit');
        if (user.membership_type === 'supporter') badgesToCheck.push('supporter');
        if ((user.streak_count || 0) >= 7) badgesToCheck.push('wochenpuls');
        for (const badge of badgesToCheck) {
          await supabase.from('badges')
            .upsert({ user_id: user.id, badge_type: badge }, { onConflict: 'user_id,badge_type', ignoreDuplicates: true });
        }
      }
      const today = new Date().toISOString().split('T')[0];
      if (user.last_active_date !== today) {
        const isConsecutive = user.last_active_date === 
          new Date(Date.now() - 86400000).toISOString().split('T')[0];
        await supabase.from('users').update({
          last_active_date: today,
          active_days_count: (user.active_days_count || 0) + 1,
          streak_count: isConsecutive ? (user.streak_count || 0) + 1 : 1,
        }).eq('id', user.id);
        setUser(prev => prev ? {
          ...prev,
          last_active_date: today,
          streak_count: isConsecutive ? (prev.streak_count || 0) + 1 : 1,
        } : null);
      }

      // Get updated counts for yes/no votes
      if (voteValue === 'yes' || voteValue === 'no') {
        const { data: updated } = await supabase
          .from('questions')
          .select('yes_count, no_count, total_votes')
          .eq('id', currentQuestion.id)
          .single();

        if (updated) {
          const threshold = RESULT_THRESHOLDS[user.membership_type as keyof typeof RESULT_THRESHOLDS] || 500;

          if (updated.total_votes >= threshold) {
            const yesPct = Math.round((updated.yes_count * 100) / updated.total_votes);
            // Ergebnis in Ref speichern — advanceToNext zeigt es NACH dem Kartenabgang
            pendingResultRef.current = { yes: yesPct, no: 100 - yesPct, total: updated.total_votes };
          } else {
            // Threshold nicht erreicht — Hinweis nach Kartenabgang
            pendingResultRef.current = { yes: -1, no: -1, total: updated.total_votes };
          }
        }
      }

      await checkWirksamkeit();
      advanceToNext();
    } catch (error) {
      console.error('Error submitting vote:', error);
    }
  }

  async function checkWirksamkeit() {
    if (!user || user.wirksamkeit_shown) return;

    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-wirksamkeit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.shouldShowOverlay) {
        setWirksamkeitData({
          totalVotes: result.totalVotes,
          effectiveVotes: result.effectiveVotes,
          effectivenessPct: result.effectivenessPct,
        });
        setShowWirksamkeit(true);
        
        // Update local state
        setUser(prev => prev ? { ...prev, wirksamkeit_shown: true } : null);
      }
    } catch (error) {
      console.error('Wirksamkeit check error:', error);
    }
  }

  function advanceToNext() {
    setTimeout(() => {
      // Hier ist die Karte bereits off-screen (Spring fertig nach ~200ms).
      // translateX.value NICHT zurücksetzen, solange Result sichtbar ist.
      const pending = pendingResultRef.current;
      pendingResultRef.current = null;

      if (pending) {
        // Ergebnis zeigen — Karte bleibt off-screen (translateX = SCREEN_WIDTH)
        setResultData(pending);
        setShowResult(true);
        const displayDuration = pending.yes === -1 ? 2500 : 3000;
        setTimeout(() => {
          setShowResult(false);
          setResultData(null);
          // Erst JETZT Karte zurücksetzen und neue Frage laden
          translateX.value = 0;
          translateY.value = 0;
          rotation.value = 0;
          scale.value = 1;
          if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
          } else {
            if (user) loadQuestions(user);
          }
          checkWirksamkeit();
        }, displayDuration);
      } else {
        // Kein Ergebnis → direkt zur nächsten Frage
        translateX.value = 0;
        translateY.value = 0;
        rotation.value = 0;
        scale.value = 1;
        if (currentIndex < questions.length - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          if (user) loadQuestions(user);
        }
      }
    }, 300);
  }

  // Handle swipe completion
  const handleSwipeComplete = useCallback(async (direction: 'left' | 'right' | 'up' | 'down') => {
    if (direction === 'right') {
      setFlashColor(COLORS.yesLight);
      await hapticPatterns.yes();
      await playSound('yes');
      setTimeout(() => setFlashColor(null), ANIMATIONS.flash);
      await submitVote('yes');
    } else if (direction === 'left') {
      setFlashColor(COLORS.noLight);
      await hapticPatterns.no();
      await playSound('no');
      setTimeout(() => setFlashColor(null), ANIMATIONS.flash);
      await submitVote('no');
    } else if (direction === 'down') {
      // INV-12: Swipe Down = Bottom Sheet (Archivieren / Später anzeigen)
      await hapticPatterns.archive();
      await playSound('archive');
      setShowBottomSheet(true);
    } else if (direction === 'up') {
      // Swipe Up = Wolke (Cloud Menu: Suche, Vorschlagen, Ergebnisse)
      await hapticPatterns.cloud();
      await playSound('deepDive');
      setShowCloudMenu(true);
      await submitVote('deep_dive');
    }
  }, [currentQuestion, user]);

  // Pan gesture for swiping
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      rotation.value = interpolate(
        event.translationX,
        [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        [-15, 0, 15],
        Extrapolation.CLAMP
      );
    })
    .onEnd((event) => {
      const { translationX, translationY, velocityX, velocityY } = event;

      if (Math.abs(translationX) > SWIPE_THRESHOLD || Math.abs(velocityX) > 500) {
        const direction = translationX > 0 ? 'right' : 'left';
        translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH, {
          velocity: velocityX,
        });
        runOnJS(handleSwipeComplete)(direction);
      } else if (translationY > VERTICAL_SWIPE_THRESHOLD || velocityY > 400) {
        // Swipe DOWN → Bottom Sheet
        translateY.value = withSpring(SCREEN_HEIGHT, { velocity: velocityY });
        runOnJS(handleSwipeComplete)('down');
      } else if (translationY < -VERTICAL_SWIPE_THRESHOLD || velocityY < -400) {
        // Swipe UP → Cloud Menu (Wolke)
        translateY.value = withSpring(-SCREEN_HEIGHT, { velocity: velocityY });
        runOnJS(handleSwipeComplete)('up');
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        rotation.value = withSpring(0);
      }
    });

  // Tap gesture for AI overlay
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(toggleAIOverlay)();
    });

  function toggleAIOverlay() {
    if (showAIOverlay) {
      setShowAIOverlay(false);
    } else {
      setShowAIOverlay(true);
      loadAIContent();
    }
  }

  async function loadAIContent() {
    if (!currentQuestion) return;

    // Check if cached data exists and is valid
    if (currentQuestion.ai_context_cache?.sentence) {
      setAIContent(currentQuestion.ai_context_cache);
      return;
    }

    // Show loading state
    setAIContent({
      sentence: t('ai.loading'),
      bullets: [],
      isLoading: true,
    });

    try {
      const session = await getSession();
      if (!session) return;

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-ai-facts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Bug 3: apikey-Header fehlt → Supabase blockiert Request
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ questionId: currentQuestion.id }),
        }
      );

      const result = await response.json();

      if (result.success && result.facts) {
        setAIContent(result.facts);
        setQuestions(prev => prev.map(q =>
          q.id === currentQuestion.id
            ? { ...q, ai_context_cache: result.facts }
            : q
        ));
      } else {
        // Bug 3: Fehler-State anzeigen statt leerem Panel
        setAIContent({
          sentence: 'KI-Fakten konnten nicht geladen werden.',
          bullets: [],
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('AI content error:', error);
      setAIContent({
        sentence: 'Verbindungsfehler. Bitte versuche es erneut.',
        bullets: [],
        isLoading: false,
      });
      setAIContent({
        sentence: t('ai.error'),
        bullets: [],
        isLoading: false,
      });
    }
  }

  // Card animated style
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  // Yes/No indicators
  const yesIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const noIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  // Handle archive action
  async function handleArchive() {
    if (!user || !currentQuestion) return;

    await supabase.from('user_archives').insert({
      user_id: user.id,
      question_id: currentQuestion.id,
    });

    setShowBottomSheet(false);
    advanceToNext();
  }

  function handleShowLater() {
    // Spec: NUR lokaler AsyncStorage-Timer, KEIN DB-Write, Karte nach 5 Min. wieder im Feed
    if (!currentQuestion) return;
    const snoozeUntil = Date.now() + 5 * 60 * 1000; // 5 Minuten
    AsyncStorage.getItem('rawlz_snoozed').then(raw => {
      const list = raw ? JSON.parse(raw) : [];
      list.push({ questionId: currentQuestion.id, snoozeUntil });
      AsyncStorage.setItem('rawlz_snoozed', JSON.stringify(list));
    });
    setShowBottomSheet(false);
    advanceToNext();
  }

  function handleReportAbuse() {
    setShowBottomSheet(false);
    setShowAbuseReport(true);
  }

  if (isLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.black} />
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  if (!currentQuestion) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />
          <View style={styles.emptyContainer}>
            <Text style={styles.appLogo}>#RAWLZ</Text>
            <Text style={[styles.emptyText, { marginTop: 24 }]}>{t('swipe.no_more_questions')}</Text>
            <TouchableOpacity style={styles.reloadButton} onPress={loadData}>
              <Text style={styles.reloadButtonText}>{t('errors.try_again')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  // Punkt 2: Dynamische Schriftgröße nach Zeichenanzahl OHNE #
  const wordWithoutHash = currentQuestion.word.startsWith('#')
    ? currentQuestion.word.slice(1)
    : currentQuestion.word;
  const charCount = wordWithoutHash.length;
  const fontSize = charCount <= 8  ? 52
    : charCount <= 14 ? 42
    : charCount <= 20 ? 32
    : 24;
  const isDailyPulse = currentQuestion.is_daily_pulse;

  return (
    // ← CRITICAL FIX: GestureHandlerRootView als äußerster Wrapper
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Spec: StatusBar nicht translucent */}
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

        {/* Header */}
        <View style={styles.headerBar}>
          <Text style={styles.appLogo}>#RAWLZ</Text>
          <View style={styles.streakPill}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakCount}>{user?.streak_count || 0}</Text>
          </View>
        </View>

        {/* Offline indicator */}
        {!isOnline && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerText}>
              📴 Offline – Stimmen werden gespeichert ({pendingCount} wartend)
            </Text>
          </View>
        )}

        {/* Flash overlay */}
        {flashColor && (
          <View style={[styles.flashOverlay, { backgroundColor: flashColor }]} />
        )}

        {/* Result overlay */}
        {showResult && resultData && (
          <View style={styles.resultOverlay}>
            {resultData.yes === -1 ? (
              <Text style={styles.resultText}>
                {`Ergebnis sichtbar ab ${RESULT_THRESHOLDS[user?.membership_type as keyof typeof RESULT_THRESHOLDS] || 500} Stimmen · Bisher: ${resultData.total.toLocaleString('de-DE')} Stimmen`}
              </Text>
            ) : (
              <Text style={styles.resultText}>
                {t('swipe.result', {
                  yes: resultData.yes,
                  no: resultData.no,
                  total: resultData.total.toLocaleString(),
                })}
              </Text>
            )}
          </View>
        )}

        {/* Main card — GestureDetector direkt auf Animated.View */}
        <GestureDetector gesture={Gesture.Race(panGesture, tapGesture)}>
          <Animated.View style={[styles.card, cardStyle]}>
            {isDailyPulse ? (
              <DailyPulseCard word={currentQuestion.word} style={StyleSheet.absoluteFill} />
            ) : (
              <>
                {/* Swipe-Hinweise */}
                <Animated.View style={[styles.voteIndicator, styles.yesIndicator, yesIndicatorStyle]}>
                  <Text style={styles.yesText}>👍</Text>
                </Animated.View>
                <Animated.View style={[styles.voteIndicator, styles.noIndicator, noIndicatorStyle]}>
                  <Text style={styles.noText}>👎</Text>
                </Animated.View>

                {/* Frage-Wort — Punkt 2: numberOfLines=1, kein Zeilenumbruch */}
                <Text style={[styles.wordText, { fontSize }]} numberOfLines={1} adjustsFontSizeToFit>
                  {currentQuestion.word}
                </Text>

                {/* Swipe-Anleitung */}
                <View style={styles.swipeHints}>
                  <Text style={styles.swipeHintUp}>↑ Wolke</Text>
                  <Text style={styles.swipeHintDown}>↓ Optionen</Text>
                </View>
              </>
            )}

            {/* AI Overlay */}
            {showAIOverlay && (
              <View style={styles.aiOverlay}>
                <View style={styles.aiHeader}>
                  {/* Fix 4: show actual word in Gold, not generic "KI-FAKTEN" label */}
                  <Text style={styles.aiTitle}>{currentQuestion.word}</Text>
                  <TouchableOpacity onPress={() => setShowAIOverlay(false)}>
                    <Text style={styles.aiClose}>×</Text>
                  </TouchableOpacity>
                </View>
                {!aiContent || aiContent.isLoading ? (
                  <ActivityIndicator color="#D4AF37" size="small" style={{ marginVertical: 16 }} />
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                    <Text style={styles.aiSentence}>{aiContent.sentence}</Text>
                    {aiContent.pro?.length > 0 && (
                      <>
                        <Text style={[styles.aiBullet, { color: '#4ade80', fontWeight: '700', marginTop: 6 }]}>PRO</Text>
                        {aiContent.pro.map((b: string, i: number) => <Text key={`pro-${i}`} style={styles.aiBullet}>• {b}</Text>)}
                        <Text style={[styles.aiBullet, { color: '#f87171', fontWeight: '700', marginTop: 6 }]}>CONTRA</Text>
                        {aiContent.contra?.map((b: string, i: number) => <Text key={`con-${i}`} style={styles.aiBullet}>• {b}</Text>)}
                      </>
                    )}
                    {!aiContent.pro?.length && aiContent.bullets?.map((bullet: string, i: number) => (
                      <Text key={i} style={styles.aiBullet}>• {bullet}</Text>
                    ))}
                    <Text style={styles.aiSource}>Quelle: KI-generiert · Kein politischer Standpunkt</Text>
                  </ScrollView>
                )}
              </View>
            )}
          </Animated.View>
        </GestureDetector>


        {/* Dashboard Sheet (Punkt 3) */}
        <DashboardSheet
          visible={showDashboard}
          onClose={() => setShowDashboard(false)}
          user={user}
        />

        {/* Bottom Sheet */}
        {showBottomSheet && (
          <View style={styles.bottomSheetOverlay}>
            <TouchableOpacity
              style={styles.bottomSheetBackdrop}
              onPress={() => setShowBottomSheet(false)}
            />
            <View style={styles.bottomSheet}>
              <TouchableOpacity style={styles.sheetOption} onPress={handleShowLater}>
                <Text style={styles.sheetOptionIcon}>⏰</Text>
                <Text style={styles.sheetOptionText}>{t('swipe.later')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetOption} onPress={handleArchive}>
                <Text style={styles.sheetOptionIcon}>🗑️</Text>
                <Text style={styles.sheetOptionText}>{t('swipe.archive')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetOption, styles.sheetCancel]}
                onPress={() => { setShowBottomSheet(false); }}
              >
                <Text style={styles.sheetCancelText}>{t('swipe.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Cloud Menu (Wolke) — Punkt 4: BlurView */}
        {showCloudMenu && (
          <Modal visible={showCloudMenu} transparent animationType="fade" onRequestClose={() => setShowCloudMenu(false)}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowCloudMenu(false)} activeOpacity={1}>
              <BlurView intensity={80} tint="light" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ gap: 24, alignItems: 'center' }}>
                  {[
                    { icon: '🔍', label: t('swipe.cloud_search'), onPress: () => { setShowCloudMenu(false); setTimeout(() => router.navigate('/(tabs)/search'), 150); } },
                    { icon: '💡', label: t('swipe.cloud_suggest'), onPress: () => { setShowCloudMenu(false); setTimeout(() => router.navigate('/suggest'), 150); } },
                    { icon: '📊', label: t('swipe.cloud_results'), onPress: () => { setShowCloudMenu(false); const qId = currentQuestion?.id; setTimeout(() => router.navigate(qId ? `/(tabs)/search?tab=results&questionId=${qId}` : '/(tabs)/search'), 150); } },
                  ].map(item => (
                    <TouchableOpacity key={item.label} onPress={item.onPress}
                      style={{ alignItems: 'center', gap: 8, padding: 16 }}>
                      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)' }}>
                        <Text style={{ fontSize: 32 }}>{item.icon}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#000' }}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </BlurView>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Wirksamkeit Overlay */}
        <WirksamkeitOverlay
          visible={showWirksamkeit}
          onDismiss={() => setShowWirksamkeit(false)}
          data={wirksamkeitData}
        />

        {/* Abuse Report Sheet */}
        <AbuseReportSheet
          visible={showAbuseReport}
          onClose={() => setShowAbuseReport(false)}
          questionId={currentQuestion.id}
          questionWord={currentQuestion.word}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7', // Punkt 1: App-Hintergrund
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  appLogo: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.black,  // Light Mode: schwarz
    letterSpacing: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  yesText: {
    fontSize: 32, // Punkt 6: 40% grösser (22 * 1.4)
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 2,
  },
  noText: {
    fontSize: 32, // Punkt 6: 40% grösser (22 * 1.4)
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 2,
  },
  swipeHints: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  swipeHintUp: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  swipeHintDown: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiClose: {
    fontSize: 22,
    color: '#6B7280',
    fontWeight: '300',
  },
  cloudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  cloudTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.black,
    letterSpacing: 1,
  },
  cloudClose: {
    fontSize: 20,
    color: COLORS.gray500,
    fontWeight: '300',
    padding: 4,
  },
  cloudOptionEmoji: {
    fontSize: 24,
  },
  cloudOptionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 2,
  },
  cloudOptionSub: {
    fontSize: 13,
    color: COLORS.gray500,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: 24,
  },
  reloadButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.black,
    borderRadius: 24,
  },
  reloadButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  offlineBanner: {
    backgroundColor: COLORS.goldLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '600',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  resultOverlay: {
    position: 'absolute',
    top: '40%',
    left: 24,
    right: 24,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    zIndex: 999,
    elevation: 20, // Fix 3: exceeds card elevation (8) so it renders on top on Android
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  resultText: {
    fontSize: 18,
    color: COLORS.black,
    textAlign: 'center',
    fontWeight: '500',
  },
  card: {
    flex: 1,
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    // overflow: 'hidden' entfernt — auf Android inkompatibel mit elevation (Shadow-Clipping-Bug)
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  voteIndicator: {
    position: 'absolute',
    top: 40,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 3,
  },
  yesIndicator: {
    right: 20,
    borderColor: COLORS.yes,
  },
  noIndicator: {
    left: 20,
    borderColor: COLORS.no,
  },
  voteIndicatorText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.black,
  },
  wordText: {
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: -32, // Fix 5: shift word upward from geometric center — swipeHints at bottom create visual imbalance
  },
  tapHint: {
    position: 'absolute',
    bottom: 60,
    fontSize: 24,
    color: COLORS.gray300,
  },
  aiOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '62%',
    backgroundColor: 'rgba(0,0,0,0.90)',
    // Border-Radius der Karte an Unterseite nachbauen (kein overflow:hidden nötig)
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  aiTitle: {
    fontSize: 14,
    color: '#D4AF37', // Punkt 5: Gold
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  aiSentence: {
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 12,
    lineHeight: 22,
  },
  aiBullet: {
    fontSize: 13,
    color: '#D4AF37', // Punkt 5: Bullets in Gold
    marginBottom: 6,
    lineHeight: 19,
  },
  aiSource: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 16,
    textAlign: 'center',
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakIcon: {
    fontSize: 24,
  },
  streakCount: {
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 4,
    color: COLORS.black,
  },
  geoButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  geoIcon: {
    fontSize: 24,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 24,
  },
  bottomSheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 300,       // Bug 2: über der Karte (elevation 5)
    elevation: 10,
  },
  bottomSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  bottomSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  sheetOptionIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  sheetOptionText: {
    fontSize: 16,
    color: COLORS.black,
  },
  sheetCancel: {
    justifyContent: 'center',
    borderBottomWidth: 0,
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  cloudMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 200,
  },
  cloudBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cloudMenu: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 48,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  cloudOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cloudOptionIcon: {
    fontSize: 28,
    marginRight: 16,
    width: 44,
    textAlign: 'center',
  },
  cloudOptionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },

});;
