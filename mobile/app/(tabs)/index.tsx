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
import { useLocalSearchParams } from 'expo-router';
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
      setQuestions(questions);
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
      await hapticPatterns.archive();
      await playSound('archive');
      setShowBottomSheet(true);
    } else if (direction === 'up') {
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
      } else if (translationY < -SWIPE_THRESHOLD || velocityY < -500) {
        translateY.value = withSpring(-SCREEN_HEIGHT, { velocity: velocityY });
        runOnJS(handleSwipeComplete)('up');
      } else if (translationY > SWIPE_THRESHOLD || velocityY > 500) {
        translateY.value = withSpring(SCREEN_HEIGHT / 3, { velocity: velocityY });
        runOnJS(handleSwipeComplete)('down');
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

    if (currentQuestion.ai_context_cache) {
      setAIContent(currentQuestion.ai_context_cache);
      return;
    }

    // TODO: Call AI endpoint for fresh content
    setAIContent({
      title: currentQuestion.word,
      sentence: 'AI-generierte Fakten werden geladen...',
      bullets: ['Lade...'],
    });
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
    setShowBottomSheet(false);
    advanceToNext();
  }

  function handleReportAbuse() {
    setShowBottomSheet(false);
    setShowAbuseReport(true);
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

  if (!currentQuestion) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('swipe.no_more_questions')}</Text>
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
    <SafeAreaView style={styles.container}>
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
              {/* Yes indicator */}
              <Animated.View style={[styles.voteIndicator, styles.yesIndicator, yesIndicatorStyle]}>
                <Text style={styles.voteIndicatorText}>{t('swipe.yes')}</Text>
              </Animated.View>

              {/* No indicator */}
              <Animated.View style={[styles.voteIndicator, styles.noIndicator, noIndicatorStyle]}>
                <Text style={styles.voteIndicatorText}>{t('swipe.no')}</Text>
              </Animated.View>

              {/* Question word */}
              <Text style={[styles.wordText, { fontSize }]}>
                {currentQuestion.word}
              </Text>

              {/* Tap hint */}
              <Text style={styles.tapHint}>?</Text>
            </>
          )}

          {/* AI Overlay */}
          {showAIOverlay && aiContent && (
            <View style={styles.aiOverlay}>
              <Text style={styles.aiTitle}>{t('ai.title')}</Text>
              <Text style={styles.aiSentence}>{aiContent.sentence}</Text>
              {aiContent.bullets?.map((bullet: string, i: number) => (
                <Text key={i} style={styles.aiBullet}>• {bullet}</Text>
              ))}
              <Text style={styles.aiSource}>{t('ai.source')}</Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <View style={styles.streakContainer}>
          <Text style={styles.streakIcon}>🔥</Text>
          <Text style={styles.streakCount}>{user?.streak_count || 0}</Text>
        </View>

        <TouchableOpacity style={styles.geoButton}>
          <Text style={styles.geoIcon}>🌍</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

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
            {/* Abuse report option */}
            <TouchableOpacity style={styles.sheetOption} onPress={handleReportAbuse}>
              <Text style={styles.sheetOptionIcon}>⚠️</Text>
              <Text style={[styles.sheetOptionText, { color: COLORS.no }]}>Melden</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.sheetOption, styles.sheetCancel]}
              onPress={() => setShowBottomSheet(false)}
            >
              <Text style={styles.sheetCancelText}>{t('swipe.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cloud Menu */}
      {showCloudMenu && (
        <View style={styles.cloudMenuOverlay}>
          <TouchableOpacity 
            style={styles.cloudBackdrop}
            onPress={() => setShowCloudMenu(false)}
          />
          <View style={styles.cloudMenu}>
            <TouchableOpacity style={styles.cloudOption}>
              <Text style={styles.cloudOptionIcon}>🔍</Text>
              <Text style={styles.cloudOptionText}>{t('swipe.cloud_search')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cloudOption}>
              <Text style={styles.cloudOptionIcon}>💡</Text>
              <Text style={styles.cloudOptionText}>{t('swipe.cloud_suggest')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cloudOption}>
              <Text style={styles.cloudOptionIcon}>📊</Text>
              <Text style={styles.cloudOptionText}>{t('swipe.cloud_results')}</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  cloudBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  cloudMenu: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 32,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cloudOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  cloudOptionIcon: {
    fontSize: 32,
    marginRight: 20,
  },
  cloudOptionText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.black,
  },
});
