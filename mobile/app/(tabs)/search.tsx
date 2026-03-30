// app/(tabs)/search.tsx
// Search & History Dashboard with 4 tabs
// Tab 1: Meine Stimmen (vote history with change option)
// Tab 2: Suche (ILIKE search with archived reactivate)
// Tab 3: Vergleich (comparison mode with charts)
// Tab 4: Meinungs-Kompass (opinion compass)

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { COLORS, RESULT_THRESHOLDS } from '../../lib/constants';
import { supabase, getCurrentUser, getSession } from '../../lib/supabase';
import hapticPatterns from '../../lib/haptics';
import { calculateKompass, KompassResult } from '../../lib/kompass';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TABS = ['history', 'search', 'comparison', 'compass'] as const;
type TabType = typeof TABS[number];

// Chart colors for comparison mode
const CHART_COLORS = ['#16A34A', '#2563EB', '#D4AF37', '#DC2626', '#6B7280'];

interface VoteHistoryItem {
  id: string;
  question_id: string;
  vote_value: 'yes' | 'no' | 'skip' | 'deep_dive';
  voted_at: string;
  can_change: boolean;
  seconds_until_unlock: number;
  question: {
    word: string;
    yes_count: number;
    no_count: number;
    total_votes: number;
  };
  previous_vote?: string;
  changed_at?: string;
}

interface SearchResult {
  id: string;
  word: string;
  status: 'active' | 'pending' | 'blocked';
  yes_count: number;
  no_count: number;
  total_votes: number;
  submission_count: number;
  relevance_threshold: number;
  is_archived?: boolean;
}

interface ComparisonQuestion {
  id: string;
  word: string;
  yes_count: number;
  no_count: number;
  total_votes: number;
  timeseries?: { day: string; yes_pct: number }[];
}

interface SavedComparison {
  id: string;
  question_ids: string[];
  created_at: string;
  questions: { word: string }[];
}

interface User {
  id: string;
  membership_type: string;
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const chartRef = useRef<ViewShot>(null);

  const [activeTab, setActiveTab] = useState<TabType>('history');
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // History tab state
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Comparison tab state
  const [selectedQuestions, setSelectedQuestions] = useState<ComparisonQuestion[]>([]);
  const [availableQuestions, setAvailableQuestions] = useState<ComparisonQuestion[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [showTimeseries, setShowTimeseries] = useState(true);

  // Compass tab state
  const [kompassResult, setKompassResult] = useState<KompassResult | null>(null);
  const [kompassUnlocked, setKompassUnlocked] = useState(false);
  const [totalYesNoVotes, setTotalYesNoVotes] = useState(0);
  const kompassRef = useRef<ViewShot>(null);

  // Load initial data
  useEffect(() => {
    loadUser();
  }, []);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (!user) return;

    switch (activeTab) {
      case 'history':
        loadVoteHistory();
        break;
      case 'comparison':
        loadAvailableQuestions();
        loadSavedComparisons();
        break;
      case 'compass':
        loadKompassData();
        break;
    }
  }, [activeTab, user]);

  // Auto-refresh history every minute (for vote lock countdown)
  useEffect(() => {
    if (activeTab !== 'history') return;
    const interval = setInterval(loadVoteHistory, 60000);
    return () => clearInterval(interval);
  }, [activeTab, user]);

  async function loadUser() {
    try {
      const authUser = await getCurrentUser();
      if (authUser) {
        const { data } = await supabase
          .from('users')
          .select('id, membership_type')
          .eq('id', authUser.id)
          .single();
        setUser(data);
      }
    } catch (error) {
      console.error('Load user error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // ==================== HISTORY TAB ====================
  async function loadVoteHistory() {
    if (!user) return;
    setHistoryRefreshing(true);

    try {
      const { data, error } = await supabase
        .from('votes')
        .select(`
          id,
          question_id,
          vote_value,
          voted_at,
          previous_vote,
          changed_at,
          questions (
            word,
            yes_count,
            no_count,
            total_votes
          )
        `)
        .eq('user_id', user.id)
        .in('vote_value', ['yes', 'no'])
        .order('voted_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const now = Date.now();
      const LOCK_DURATION = 3 * 60 * 1000; // 3 minutes

      const history = (data || []).map((item: any) => {
        const votedAt = new Date(item.voted_at).getTime();
        const elapsed = now - votedAt;
        const canChange = elapsed >= LOCK_DURATION;
        const secondsUntilUnlock = canChange ? 0 : Math.ceil((LOCK_DURATION - elapsed) / 1000);

        return {
          ...item,
          question: item.questions,
          can_change: canChange,
          seconds_until_unlock: secondsUntilUnlock,
        };
      });

      setVoteHistory(history);
    } catch (error) {
      console.error('Load history error:', error);
    } finally {
      setHistoryRefreshing(false);
    }
  }

  async function handleChangeVote(voteItem: VoteHistoryItem) {
    if (!voteItem.can_change) {
      Alert.alert(
        'Gesperrt',
        t('swipe.vote_locked', { seconds: voteItem.seconds_until_unlock })
      );
      return;
    }

    const newValue = voteItem.vote_value === 'yes' ? 'no' : 'yes';

    Alert.alert(
      'Stimme ändern',
      `Von ${voteItem.vote_value.toUpperCase()} zu ${newValue.toUpperCase()} ändern?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          onPress: async () => {
            try {
              const session = await getSession();
              if (!session) return;

              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/change-vote`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({
                    voteId: voteItem.id,
                    newValue,
                  }),
                }
              );

              const result = await response.json();
              if (result.success) {
                await hapticPatterns.success();
                Alert.alert('Erfolg', t('swipe.vote_changed'));
                loadVoteHistory();
              } else {
                throw new Error(result.error);
              }
            } catch (error: any) {
              Alert.alert('Fehler', error.message);
            }
          },
        },
      ]
    );
  }

  // ==================== SEARCH TAB ====================
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  function handleSearchChange(text: string) {
    setSearchQuery(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (text.length < 2) {
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      performSearch(text);
    }, 200);
  }

  async function performSearch(query: string) {
    if (!user) return;
    setIsSearching(true);

    try {
      // Search active and pending questions
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .or(`word.ilike.%${query}%`)
        .in('status', ['active', 'pending'])
        .limit(20);

      if (error) throw error;

      // Get user's archived questions
      const { data: archives } = await supabase
        .from('user_archives')
        .select('question_id')
        .eq('user_id', user.id);

      const archivedIds = new Set((archives || []).map(a => a.question_id));

      const results = (questions || []).map(q => ({
        ...q,
        is_archived: archivedIds.has(q.id),
      }));

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleReactivate(questionId: string) {
    if (!user) return;

    try {
      await supabase
        .from('user_archives')
        .delete()
        .eq('user_id', user.id)
        .eq('question_id', questionId);

      await hapticPatterns.success();
      performSearch(searchQuery);
    } catch (error) {
      console.error('Reactivate error:', error);
    }
  }

  function handleVoteFromSearch(questionId: string) {
    router.push(`/(tabs)?questionId=${questionId}`);
  }

  // ==================== COMPARISON TAB ====================
  async function loadAvailableQuestions() {
    if (!user) return;

    try {
      const { data: votes } = await supabase
        .from('votes')
        .select(`
          question_id,
          questions (
            id,
            word,
            yes_count,
            no_count,
            total_votes
          )
        `)
        .eq('user_id', user.id)
        .in('vote_value', ['yes', 'no'])
        .limit(100);

      const questions = (votes || [])
        .map((v: any) => v.questions)
        .filter(Boolean);

      setAvailableQuestions(questions);
    } catch (error) {
      console.error('Load questions error:', error);
    }
  }

  async function loadSavedComparisons() {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('question_comparisons')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        // Load question words for each comparison
        const comparisons = await Promise.all(
          data.map(async (comp: any) => {
            const { data: questions } = await supabase
              .from('questions')
              .select('word')
              .in('id', comp.question_ids);
            return { ...comp, questions: questions || [] };
          })
        );
        setSavedComparisons(comparisons);
      }
    } catch (error) {
      console.error('Load comparisons error:', error);
    }
  }

  function toggleQuestionSelection(question: ComparisonQuestion) {
    const isSelected = selectedQuestions.some(q => q.id === question.id);

    if (isSelected) {
      setSelectedQuestions(prev => prev.filter(q => q.id !== question.id));
    } else {
      if (selectedQuestions.length >= 5) {
        Alert.alert('Maximum', t('comparison.max_reached'));
        return;
      }
      setSelectedQuestions(prev => [...prev, question]);
    }
  }

  async function loadTimeseries() {
    if (selectedQuestions.length < 2) return;

    try {
      const questionIds = selectedQuestions.map(q => q.id);
      const { data } = await supabase
        .from('vote_timeseries')
        .select('*')
        .in('question_id', questionIds)
        .order('snapshot_date', { ascending: true });

      // Group by question
      const grouped: { [key: string]: { day: string; yes_pct: number }[] } = {};
      (data || []).forEach((row: any) => {
        if (!grouped[row.question_id]) {
          grouped[row.question_id] = [];
        }
        const yesPct = row.total > 0 ? Math.round((row.yes_count * 100) / row.total) : 0;
        grouped[row.question_id].push({
          day: row.snapshot_date,
          yes_pct: yesPct,
        });
      });

      setSelectedQuestions(prev =>
        prev.map(q => ({
          ...q,
          timeseries: grouped[q.id] || [],
        }))
      );
    } catch (error) {
      console.error('Timeseries error:', error);
    }
  }

  useEffect(() => {
    if (selectedQuestions.length >= 2) {
      loadTimeseries();
    }
  }, [selectedQuestions.length]);

  function getResultThreshold(): number {
    const membershipType = user?.membership_type || 'basis';
    return RESULT_THRESHOLDS[membershipType as keyof typeof RESULT_THRESHOLDS] || 500;
  }

  function canSeeResults(question: ComparisonQuestion): boolean {
    return question.total_votes >= getResultThreshold();
  }

  async function handleSaveComparison() {
    if (!user || selectedQuestions.length < 2) return;

    // Check max 10 comparisons
    if (savedComparisons.length >= 10) {
      Alert.alert('Maximum', 'Du kannst maximal 10 Vergleiche speichern.');
      return;
    }

    try {
      const { error } = await supabase.from('question_comparisons').insert({
        user_id: user.id,
        question_ids: selectedQuestions.map(q => q.id),
      });

      if (error) throw error;

      await hapticPatterns.success();
      loadSavedComparisons();
    } catch (error) {
      console.error('Save comparison error:', error);
    }
  }

  async function handleShareComparison() {
    if (!chartRef.current || selectedQuestions.length < 2) return;

    try {
      // @ts-ignore
      const uri = await chartRef.current.capture();
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Share error:', error);
    }
  }

  function loadSavedComparison(comparison: SavedComparison) {
    const questions = availableQuestions.filter(q =>
      comparison.question_ids.includes(q.id)
    );
    setSelectedQuestions(questions);
  }

  // ==================== COMPASS TAB ====================
  async function loadKompassData() {
    if (!user) return;

    try {
      // Count yes/no votes
      const { count: yesNoCount } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('vote_value', ['yes', 'no']);

      setTotalYesNoVotes(yesNoCount || 0);
      setKompassUnlocked((yesNoCount || 0) >= 50);

      if ((yesNoCount || 0) >= 50) {
        // Get user's votes on calibrated questions
        const { data: votes } = await supabase
          .from('votes')
          .select(`
            vote_value,
            questions!inner (
              id,
              axis_x,
              axis_y
            )
          `)
          .eq('user_id', user.id)
          .in('vote_value', ['yes', 'no'])
          .not('questions.axis_x', 'is', null)
          .not('questions.axis_y', 'is', null);

        const calibratedVotes = (votes || []).map((v: any) => ({
          vote_value: v.vote_value as string,
          questions: { axis_x: v.questions.axis_x, axis_y: v.questions.axis_y },
        }));

        if (calibratedVotes.length >= 10) {
          const result = calculateKompass(calibratedVotes);
          setKompassResult(result);
        } else {
          setKompassResult(null);
        }
      }
    } catch (error) {
      console.error('Kompass error:', error);
    }
  }

  async function handleShareKompass() {
    if (!kompassRef.current || !kompassResult) return;

    try {
      // @ts-ignore
      const uri = await kompassRef.current.capture();
      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error('Share kompass error:', error);
    }
  }

  // ==================== RENDER ====================
  function renderTabBar() {
    return (
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'history' ? t('history.title') :
               tab === 'search' ? t('search.title') :
               tab === 'comparison' ? t('comparison.title') :
               t('compass.title')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderHistoryTab() {
    if (voteHistory.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('history.no_votes')}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={voteHistory}
        keyExtractor={item => item.id}
        refreshing={historyRefreshing}
        onRefresh={loadVoteHistory}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const yesPct = item.question.total_votes > 0
            ? Math.round((item.question.yes_count * 100) / item.question.total_votes)
            : 0;
          const threshold = getResultThreshold();
          const canSee = item.question.total_votes >= threshold;

          return (
            <View style={styles.historyItem}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyWord}>{item.question.word}</Text>
                <View style={[
                  styles.voteBadge,
                  item.vote_value === 'yes' ? styles.voteBadgeYes : styles.voteBadgeNo,
                ]}>
                  <Text style={styles.voteBadgeText}>
                    {item.vote_value === 'yes' ? 'JA' : 'NEIN'}
                  </Text>
                </View>
              </View>

              {item.previous_vote && (
                <Text style={styles.changedText}>
                  {t('history.changed_from', {
                    from: item.previous_vote.toUpperCase(),
                    to: item.vote_value.toUpperCase(),
                  })}
                </Text>
              )}

              {canSee && (
                <View style={styles.resultBar}>
                  <View style={[styles.resultBarYes, { width: `${yesPct}%` }]} />
                  <View style={[styles.resultBarNo, { width: `${100 - yesPct}%` }]} />
                </View>
              )}

              <View style={styles.historyFooter}>
                <Text style={styles.historyMeta}>
                  {item.question.total_votes.toLocaleString()} {t('common.votes')}
                </Text>

                {!item.can_change ? (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedText}>
                      🔴 {item.seconds_until_unlock}s
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.changeButton}
                    onPress={() => handleChangeVote(item)}
                  >
                    <Text style={styles.changeButtonText}>
                      🟢 {t('swipe.vote_changeable')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />
    );
  }

  function renderSearchTab() {
    return (
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t('search.placeholder')}
            placeholderTextColor={COLORS.gray500}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && <ActivityIndicator size="small" color={COLORS.black} />}
        </View>

        {searchResults.length === 0 && searchQuery.length >= 2 && !isSearching ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('search.no_results')}</Text>
          </View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isPending = item.status === 'pending';
              const progress = isPending
                ? Math.round((item.submission_count / item.relevance_threshold) * 100)
                : 0;

              return (
                <TouchableOpacity
                  style={[styles.searchItem, item.is_archived && styles.searchItemArchived]}
                  onPress={() => !item.is_archived && handleVoteFromSearch(item.id)}
                  disabled={item.is_archived}
                >
                  <View style={styles.searchItemHeader}>
                    <Text style={styles.searchItemWord}>{item.word}</Text>
                    {item.is_archived && (
                      <View style={styles.archivedBadge}>
                        <Text style={styles.archivedText}>{t('search.archived')}</Text>
                      </View>
                    )}
                  </View>

                  {isPending && (
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${progress}%` }]} />
                      </View>
                      <Text style={styles.progressText}>
                        {t('search.pending', { count: item.submission_count })}
                      </Text>
                    </View>
                  )}

                  {!isPending && !item.is_archived && (
                    <Text style={styles.searchItemMeta}>
                      {item.total_votes.toLocaleString()} {t('common.votes')}
                    </Text>
                  )}

                  {item.is_archived && (
                    <TouchableOpacity
                      style={styles.reactivateButton}
                      onPress={() => handleReactivate(item.id)}
                    >
                      <Text style={styles.reactivateText}>{t('search.reactivate')}</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    );
  }

  function renderComparisonTab() {
    const threshold = getResultThreshold();

    return (
      <ScrollView style={styles.comparisonContainer}>
        {/* Selection section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('comparison.select_questions')}</Text>
          <Text style={styles.sectionSubtitle}>
            {t('comparison.selected', { count: selectedQuestions.length })}
          </Text>
        </View>

        {selectedQuestions.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSelectedQuestions([])}
          >
            <Text style={styles.clearButtonText}>{t('comparison.clear')}</Text>
          </TouchableOpacity>
        )}

        {/* Available questions */}
        <View style={styles.questionGrid}>
          {availableQuestions.slice(0, 20).map((question, idx) => {
            const isSelected = selectedQuestions.some(q => q.id === question.id);
            return (
              <TouchableOpacity
                key={question.id}
                style={[
                  styles.questionChip,
                  isSelected && styles.questionChipSelected,
                ]}
                onPress={() => toggleQuestionSelection(question)}
              >
                <Text
                  style={[
                    styles.questionChipText,
                    isSelected && styles.questionChipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {question.word}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Chart section */}
        {selectedQuestions.length >= 2 && (
          <ViewShot
            ref={chartRef}
            options={{ format: 'jpg', quality: 0.9, width: 1080, height: 1080 }}
            // @ts-ignore
            collapsable={false}
          >
            <View style={styles.chartContainer}>
              <Text style={styles.chartTitle}>{t('comparison.title')}</Text>

              {/* Timeseries chart placeholder */}
              {showTimeseries && (
                <View style={styles.timeseriesChart}>
                  {selectedQuestions.map((q, idx) => (
                    <View key={q.id} style={styles.timeseriesLegend}>
                      <View style={[styles.legendDot, { backgroundColor: CHART_COLORS[idx] }]} />
                      <Text style={styles.legendText}>{q.word}</Text>
                    </View>
                  ))}
                  {/* Chart would be rendered here with react-native-svg or similar */}
                  <View style={styles.chartPlaceholder}>
                    <Text style={styles.chartPlaceholderText}>Zeitreihen-Chart</Text>
                  </View>
                </View>
              )}

              {/* Results bars */}
              <View style={styles.resultsSection}>
                {selectedQuestions.map((q, idx) => {
                  const canSee = q.total_votes >= threshold;
                  const yesPct = q.total_votes > 0
                    ? Math.round((q.yes_count * 100) / q.total_votes)
                    : 0;

                  return (
                    <View key={q.id} style={styles.resultRow}>
                      <View style={[styles.resultDot, { backgroundColor: CHART_COLORS[idx] }]} />
                      <Text style={styles.resultWord} numberOfLines={1}>{q.word}</Text>
                      
                      {canSee ? (
                        <>
                          <View style={styles.resultBarContainer}>
                            <View style={[styles.resultBarYes, { width: `${yesPct}%` }]} />
                            <View style={[styles.resultBarNo, { width: `${100 - yesPct}%` }]} />
                          </View>
                          <Text style={styles.resultPct}>{yesPct}%</Text>
                          <Text style={styles.resultVotes}>
                            {q.total_votes.toLocaleString()}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.thresholdGate}>
                          {t('swipe.threshold_gate', { threshold })}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Footer */}
              <Text style={styles.chartFooter}>rawlz.app</Text>
            </View>
          </ViewShot>
        )}

        {/* Actions */}
        {selectedQuestions.length >= 2 && (
          <View style={styles.comparisonActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleShareComparison}>
              <Text style={styles.actionButtonText}>{t('comparison.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={handleSaveComparison}
            >
              <Text style={styles.actionButtonSecondaryText}>{t('comparison.save')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Saved comparisons */}
        {savedComparisons.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.sectionTitle}>{t('comparison.saved_comparisons')}</Text>
            {savedComparisons.map(comp => (
              <TouchableOpacity
                key={comp.id}
                style={styles.savedItem}
                onPress={() => loadSavedComparison(comp)}
              >
                <Text style={styles.savedItemText}>
                  {comp.questions.map(q => q.word).join(' vs ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  function renderCompassTab() {
    if (!kompassUnlocked) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>{t('compass.locked')}</Text>
          <Text style={styles.lockedSubtitle}>
            {t('compass.votes_needed', { count: 50 - totalYesNoVotes })}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(totalYesNoVotes / 50) * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{totalYesNoVotes} / 50</Text>
        </View>
      );
    }

    if (!kompassResult) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('compass.not_enough_calibrated')}</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.kompassContainer}>
        <ViewShot
          ref={kompassRef}
          options={{ format: 'jpg', quality: 0.9, width: 1080, height: 1080 }}
          // @ts-ignore
          collapsable={false}
        >
          <View style={styles.kompassCard}>
            <Text style={styles.kompassTitle}>{t('compass.title')}</Text>

            {/* 2x2 Grid */}
            <View style={styles.kompassGrid}>
              {/* Top labels */}
              <Text style={[styles.kompassLabel, styles.labelTop]}>Liberal</Text>
              
              {/* Grid container */}
              <View style={styles.gridContainer}>
                {/* Left label */}
                <Text style={[styles.kompassLabel, styles.labelLeft]}>Sozial</Text>
                
                {/* Quadrants */}
                <View style={styles.quadrants}>
                  <View style={[styles.quadrant, styles.quadrantTL]}>
                    <Text style={styles.quadrantLabel}>
                      {t('compass.quadrant_liberal_social')}
                    </Text>
                  </View>
                  <View style={[styles.quadrant, styles.quadrantTR]}>
                    <Text style={styles.quadrantLabel}>
                      {t('compass.quadrant_liberal_market')}
                    </Text>
                  </View>
                  <View style={[styles.quadrant, styles.quadrantBL]}>
                    <Text style={styles.quadrantLabel}>
                      {t('compass.quadrant_conservative_social')}
                    </Text>
                  </View>
                  <View style={[styles.quadrant, styles.quadrantBR]}>
                    <Text style={styles.quadrantLabel}>
                      {t('compass.quadrant_conservative_market')}
                    </Text>
                  </View>

                  {/* User dot */}
                  <View
                    style={[
                      styles.userDot,
                      {
                        left: `${((kompassResult.x + 1) / 2) * 100}%`,
                        top: `${((1 - kompassResult.y) / 2) * 100}%`,
                      },
                    ]}
                  />

                  {/* Crosshairs */}
                  <View style={styles.crosshairH} />
                  <View style={styles.crosshairV} />
                </View>

                {/* Right label */}
                <Text style={[styles.kompassLabel, styles.labelRight]}>Markt</Text>
              </View>

              {/* Bottom label */}
              <Text style={[styles.kompassLabel, styles.labelBottom]}>Konservativ</Text>
            </View>

            {/* Coordinates */}
            <Text style={styles.coordinates}>
              X: {kompassResult.x.toFixed(2)} | Y: {kompassResult.y.toFixed(2)}
            </Text>

            {/* Footer */}
            <Text style={styles.kompassFooter}>rawlz.app</Text>
          </View>
        </ViewShot>

        {/* Share button */}
        <TouchableOpacity style={styles.shareButton} onPress={handleShareKompass}>
          <Text style={styles.shareButtonText}>{t('compass.share')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
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
      {renderTabBar()}
      
      {activeTab === 'history' && renderHistoryTab()}
      {activeTab === 'search' && renderSearchTab()}
      {activeTab === 'comparison' && renderComparisonTab()}
      {activeTab === 'compass' && renderCompassTab()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: #0A0A0A,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.black,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.black,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
  },

  // History tab styles
  historyItem: {
    backgroundColor: COLORS.gray100,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyWord: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    flex: 1,
  },
  voteBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  voteBadgeYes: {
    backgroundColor: COLORS.yesLight,
  },
  voteBadgeNo: {
    backgroundColor: COLORS.noLight,
  },
  voteBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.black,
  },
  changedText: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  resultBar: {
    height: 8,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  resultBarYes: {
    backgroundColor: COLORS.yes,
    height: '100%',
  },
  resultBarNo: {
    backgroundColor: COLORS.no,
    height: '100%',
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyMeta: {
    fontSize: 13,
    color: COLORS.gray500,
  },
  lockedBadge: {
    backgroundColor: COLORS.noLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  lockedText: {
    fontSize: 12,
    color: COLORS.no,
    fontWeight: '600',
  },
  changeButton: {
    backgroundColor: COLORS.yesLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  changeButtonText: {
    fontSize: 12,
    color: COLORS.yes,
    fontWeight: '600',
  },

  // Search tab styles
  searchContainer: {
    flex: 1,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: COLORS.black,
  },
  searchItem: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  searchItemArchived: {
    opacity: 0.6,
  },
  searchItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchItemWord: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  archivedBadge: {
    backgroundColor: COLORS.gray300,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  archivedText: {
    fontSize: 11,
    color: COLORS.gray700,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.gray300,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 4,
  },
  searchItemMeta: {
    fontSize: 13,
    color: COLORS.gray500,
    marginTop: 8,
  },
  reactivateButton: {
    marginTop: 12,
    backgroundColor: COLORS.black,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  reactivateText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },

  // Comparison tab styles
  comparisonContainer: {
    flex: 1,
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 4,
  },
  clearButton: {
    marginBottom: 16,
  },
  clearButtonText: {
    fontSize: 14,
    color: COLORS.no,
    fontWeight: '600',
  },
  questionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  questionChip: {
    backgroundColor: COLORS.gray100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: SCREEN_WIDTH / 2 - 24,
  },
  questionChipSelected: {
    backgroundColor: COLORS.black,
  },
  questionChipText: {
    fontSize: 14,
    color: COLORS.black,
  },
  questionChipTextSelected: {
    color: COLORS.white,
  },
  chartContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 16,
  },
  timeseriesChart: {
    marginBottom: 24,
  },
  timeseriesLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: COLORS.gray700,
  },
  chartPlaceholder: {
    height: 150,
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  chartPlaceholderText: {
    color: COLORS.gray500,
  },
  resultsSection: {
    marginTop: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  resultWord: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
    width: 80,
  },
  resultBarContainer: {
    flex: 1,
    height: 20,
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  resultPct: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
    width: 40,
    textAlign: 'right',
  },
  resultVotes: {
    fontSize: 12,
    color: COLORS.gray500,
    width: 50,
    textAlign: 'right',
  },
  thresholdGate: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  chartFooter: {
    textAlign: 'center',
    color: COLORS.gray300,
    fontSize: 12,
    marginTop: 16,
  },
  comparisonActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.black,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: COLORS.gray100,
  },
  actionButtonSecondaryText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: '600',
  },
  savedSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  savedItem: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  savedItemText: {
    fontSize: 14,
    color: COLORS.black,
  },

  // Compass tab styles
  lockedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 8,
  },
  lockedSubtitle: {
    fontSize: 14,
    color: COLORS.gray500,
    marginBottom: 24,
  },
  progressLabel: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 8,
  },
  kompassContainer: {
    flex: 1,
    padding: 16,
  },
  kompassCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    alignItems: 'center',
  },
  kompassTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 24,
  },
  kompassGrid: {
    width: '100%',
    alignItems: 'center',
  },
  gridContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quadrants: {
    width: 240,
    height: 240,
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'relative',
  },
  quadrant: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  quadrantTL: {
    backgroundColor: '#E8F5E9',
  },
  quadrantTR: {
    backgroundColor: '#E3F2FD',
  },
  quadrantBL: {
    backgroundColor: '#FFF3E0',
  },
  quadrantBR: {
    backgroundColor: '#FCE4EC',
  },
  quadrantLabel: {
    fontSize: 10,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  userDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    borderWidth: 3,
    borderColor: COLORS.white,
    marginLeft: -10,
    marginTop: -10,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  crosshairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: COLORS.gray300,
  },
  crosshairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 1,
    backgroundColor: COLORS.gray300,
  },
  kompassLabel: {
    fontSize: 12,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  labelTop: {
    marginBottom: 8,
  },
  labelBottom: {
    marginTop: 8,
  },
  labelLeft: {
    marginRight: 8,
    transform: [{ rotate: '-90deg' }],
  },
  labelRight: {
    marginLeft: 8,
    transform: [{ rotate: '90deg' }],
  },
  coordinates: {
    fontSize: 14,
    color: COLORS.gray500,
    marginTop: 24,
  },
  kompassFooter: {
    fontSize: 12,
    color: COLORS.gray300,
    marginTop: 16,
  },
  shareButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  shareButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
