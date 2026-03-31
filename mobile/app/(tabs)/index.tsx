// app/(tabs)/index.tsx
// Swipe Screen - Main voting interface with all Phase 2 features
// Daily Pulse, Wirksamkeits-Anzeige, Abuse Reporting, Offline Support

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
} from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';

import { COLORS, getWordFontSize, RESULT_THRESHOLDS, ANIMATIONS } from '../../lib/constants';
import { supabase, getCurrentUser, getSession } from '../../lib/supabase';
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

export default function SwipeScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ questionId?: string }>();
  
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
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showCloudMenu, setShowCloudMenu] = useState(false);
  
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

  // Load user and questions
  useEffect(() => {
    loadData();
    startNetworkListener();

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

    const votedIds = new Set((votedQuestions || []).map(v => v.question_id));

    // Filter out archived
    const { data: archivedQuestions } = await supabase
      .from('user_archives')
      .select('question_id')
      .eq('user_id', userData.id);

    const archivedIds = new Set((archivedQuestions || []).map(a => a.question_id));

    let filteredQuestions = (allQuestions || []).filter(
      q => !votedIds.has(q.id) && !archivedIds.has(q.id)
    );

    // Add daily pulse at the beginning (INV-14)
    if (dailyPulse && !votedIds.has(dailyPulse.id) && !archivedIds.has(dailyPulse.id)) {
      filteredQuestions = [dailyPulse, ...filteredQuestions.filter(q => q.id !== dailyPulse.id)];
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

      // Streak + active_days_count aktualisieren
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
            const noPct = 100 - yesPct;
            setResultData({
              yes: yesPct,
              no: noPct,
              total: updated.total_votes,
            });
            setShowResult(true);

            // Auto-advance after 3 seconds
            setTimeout(() => {
              setShowResult(false);
              setResultData(null);
              checkWirksamkeit();
              advanceToNext();
            }, 3000);
            return;
          }
        }
      }

      // Check Wirksamkeit (after 100 votes)
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
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Reload questions
      if (user) loadQuestions(user);
    }
    
    // Reset animations
    translateX.value = 0;
    translateY.value = 0;
    rotation.value = 0;
    scale.value = 1;
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
      } else if (translationY > SWIPE_THRESHOLD || velocityY > 500) {
        // Swipe DOWN → Bottom Sheet
        translateY.value = withSpring(SCREEN_HEIGHT, { velocity: velocityY });
        runOnJS(handleSwipeComplete)('down');
      } else if (translationY < -SWIPE_THRESHOLD || velocityY < -500) {
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
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ questionId: currentQuestion.id }),
        }
      );

      const result = await response.json();

      if (result.success && result.facts) {
        setAIContent(result.facts);
        // Update local question cache
        setQuestions(prev => prev.map(q => 
          q.id === currentQuestion.id 
            ? { ...q, ai_context_cache: result.facts }
            : q
        ));
      } else {
        setAIContent({
          sentence: t('ai.error'),
          bullets: [],
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('AI content error:', error);
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
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!currentQuestion) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.appLogo}>#RAWLZ</Text>
          <Text style={[styles.emptyText, { marginTop: 24 }]}>{t('swipe.no_more_questions')}</Text>
          <TouchableOpacity style={styles.reloadButton} onPress={loadData}>
            <Text style={styles.reloadButtonText}>{t('errors.try_again')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const wordLength = currentQuestion.word.length - 1;
  const fontSize = getWordFontSize(wordLength);
  const isDailyPulse = currentQuestion.is_daily_pulse;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Streak-Anzeige oben rechts */}
      <View style={styles.headerBar}>
        <Text style={styles.appLogo}>#RAWLZ</Text>
        <View style={styles.streakPill}>
          <Text style={styles.streakIcon}>🔥</Text>
          <Text style={styles.streakCount}>{user?.streak_count || 0}</Text>
        </View>
      </View>

      {/* Custom Bottom Bar: Streak · Geo-Filter · Settings */}
      <View style={styles.bottomBar}>
        <View style={styles.streakContainer}>
          <Text style={styles.streakIcon}>🔥</Text>
          <Text style={styles.streakCount}>{user?.streak_count || 0}</Text>
        </View>
        <TouchableOpacity style={styles.geoButton}>
          <Text style={styles.geoIcon}>🌍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingsButton} onPress={() => {}}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
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
          <Text style={styles.resultText}>
            {t('swipe.result', {
              yes: resultData.yes,
              no: resultData.no,
              total: resultData.total.toLocaleString(),
            })}
          </Text>
        </View>
      )}

      {/* Main card */}
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

              {/* Frage-Wort */}
              <Text style={[styles.wordText, { fontSize }]}>
                {currentQuestion.word}
              </Text>

              {/* Swipe-Anleitung */}
              <View style={styles.swipeHints}>
                <Text style={styles.swipeHintUp}>↑ Wolke</Text>
                <Text style={styles.swipeHintDown}>↓ Optionen</Text>
              </View>
            </>
          )}

          {/* AI Overlay (Swipe Down = Deep Dive laut Konzept) */}
          {showAIOverlay && aiContent && (
            <View style={styles.aiOverlay}>
              <View style={styles.aiHeader}>
                <Text style={styles.aiTitle}>KI-FAKTEN</Text>
                <TouchableOpacity onPress={() => setShowAIOverlay(false)}>
                  <Text style={styles.aiClose}>×</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.aiSentence}>{aiContent.sentence}</Text>
              {aiContent.bullets?.map((bullet: string, i: number) => (
                <Text key={i} style={styles.aiBullet}>• {bullet}</Text>
              ))}
              <Text style={styles.aiSource}>Quelle: KI-generiert · Kein politischer Standpunkt</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>

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

      {/* Cloud Menu (Wolke) – Swipe UP: Suche · Vorschlagen · Ergebnisse */}
      {showCloudMenu && (
        <View style={styles.cloudMenuOverlay}>
          <TouchableOpacity
            style={styles.cloudBackdrop}
            onPress={() => setShowCloudMenu(false)}
          />
          <View style={styles.cloudMenu}>
            {/* Header */}
            <View style={styles.cloudHeader}>
              <Text style={styles.cloudTitle}>#RAWLZ</Text>
              <TouchableOpacity onPress={() => setShowCloudMenu(false)}>
                <Text style={styles.cloudClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 3 große Tap-Targets */}
            <TouchableOpacity style={styles.cloudOption} onPress={() => {
              setShowCloudMenu(false);
              router.push('/(tabs)/search');
            }}>
              <View style={styles.cloudOptionIcon}>
                <Text style={styles.cloudOptionEmoji}>🔍</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cloudOptionLabel}>{t('swipe.cloud_search')}</Text>
                <Text style={styles.cloudOptionSub}>Abstimmungen finden & vergleichen</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cloudOption} onPress={() => {
              setShowCloudMenu(false);
              router.push('/suggest');
            }}>
              <View style={styles.cloudOptionIcon}>
                <Text style={styles.cloudOptionEmoji}>💡</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cloudOptionLabel}>{t('swipe.cloud_suggest')}</Text>
                <Text style={styles.cloudOptionSub}>Wort vorschlagen · Autocomplete</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cloudOption} onPress={() => {
              setShowCloudMenu(false);
              router.push({ pathname: '/(tabs)/search', params: { questionId: currentQuestion?.id } });
            }}>
              <View style={styles.cloudOptionIcon}>
                <Text style={styles.cloudOptionEmoji}>📊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cloudOptionLabel}>{t('swipe.cloud_results')}</Text>
                <Text style={styles.cloudOptionSub}>Markieren · Zusammenstellen · Teilen</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  yesText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 2,
  },
  noText: {
    fontSize: 22,
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
    zIndex: 50,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
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
    backgroundColor: COLORS.white,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
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
    color: COLORS.black,
    textAlign: 'center',
    paddingHorizontal: 24,
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
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    padding: 24,
    maxHeight: '60%',
  },
  aiTitle: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
    marginBottom: 12,
  },
  aiSentence: {
    fontSize: 16,
    color: COLORS.white,
    marginBottom: 16,
    lineHeight: 24,
  },
  aiBullet: {
    fontSize: 14,
    color: COLORS.white,
    marginBottom: 8,
    lineHeight: 20,
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
    zIndex: 200,
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
