// app/(tabs)/search.tsx
// Search & History Dashboard - Complete with all 4 tabs

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LineChart } from 'react-native-gifted-charts';

import { COLORS, RESULT_THRESHOLDS, VOTE_LOCK_MS } from '../../lib/constants';
import { supabase, getCurrentUser } from '../../lib/supabase';
import hapticPatterns from '../../lib/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TabType = 'votes' | 'search' | 'compare' | 'compass';

interface Vote {
  id: string;
  question_id: string;
  vote_value: string;
  voted_at: string;
  question: {
    id: string;
    word: string;
    yes_count: number;
    no_count: number;
    total_votes: number;
  };
  history?: VoteHistoryEntry[];
}

interface VoteHistoryEntry {
  old_value: string;
  new_value: string;
  changed_at: string;
}

interface SearchResult {
  id: string;
  word: string;
  status: string;
  yes_count: number;
  no_count: number;
  total_votes: number;
  submission_count: number;
  relevance_threshold: number;
  isArchived?: boolean;
}

interface SavedComparison {
  id: string;
  name: string;
  question_ids: string[];
  created_at: string;
}

interface TimeseriesPoint {
  day: string;
  yes_pct: number;
}

interface CompassData {
  x: number;
  y: number;
  calibratedVotes: number;
}

// Comparison chart colors
const CHART_COLORS = ['#16A34A', '#2563EB', '#D4AF37', '#DC2626', '#6B7280'];

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('votes');
  const [searchQuery, setSearchQuery] = useState('');
  const [votes, setVotes] = useState<Vote[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [membershipType, setMembershipType] = useState('basis');
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [comparisonQuestions, setComparisonQuestions] = useState<SearchResult[]>([]);
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [timeseriesData, setTimeseriesData] = useState<{ [key: string]: TimeseriesPoint[] }>({});
  const [showComparisonView, setShowComparisonView] = useState(false);
  const [compassData, setCompassData] = useState<CompassData | null>(null);
  const [compassUnlocked, setCompassUnlocked] = useState(false);
  const [totalYesNoVotes, setTotalYesNoVotes] = useState(0);

  const comparisonViewRef = useRef<ViewShot>(null);
  const compassViewRef = useRef<ViewShot>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (activeTab === 'votes' && userId) {
      loadVotes();
    } else if (activeTab === 'compare' && userId) {
      loadSavedComparisons();
    } else if (activeTab === 'compass' && userId) {
      loadCompassData();
    }
  }, [activeTab, userId]);

  useEffect(() => {
    if (activeTab === 'search') {
      // 300ms debounce for search
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (searchQuery.length > 0) {
        searchDebounceRef.current = setTimeout(() => {
          searchQuestions();
        }, 300);
      } else {
        setSearchResults([]);
      }
    }
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, activeTab]);

  async function loadUserData() {
    const user = await getCurrentUser();
    if (user) {
      setUserId(user.id);
      
      const { data } = await supabase
        .from('users')
        .select('membership_type')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setMembershipType(data.membership_type);
      }
    }
  }

  async function loadVotes() {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      // Get votes with question data
      const { data: votesData } = await supabase
        .from('votes')
        .select(`
          id,
          question_id,
          vote_value,
          voted_at,
          questions!inner (
            id,
            word,
            yes_count,
            no_count,
            total_votes
          )
        `)
        .eq('user_id', userId)
        .order('voted_at', { ascending: false })
        .limit(50);

      if (votesData) {
        // Get vote history for each vote
        const questionIds = votesData.map(v => v.question_id);
        const { data: historyData } = await supabase
          .from('vote_history')
          .select('*')
          .eq('user_id', userId)
          .in('question_id', questionIds)
          .order('changed_at', { ascending: false });

        const historyByQuestion: { [key: string]: VoteHistoryEntry[] } = {};
        (historyData || []).forEach(h => {
          if (!historyByQuestion[h.question_id]) {
            historyByQuestion[h.question_id] = [];
          }
          historyByQuestion[h.question_id].push({
            old_value: h.old_value,
            new_value: h.new_value,
            changed_at: h.changed_at,
          });
        });

        setVotes(votesData.map(v => ({
          ...v,
          question: v.questions as any,
          history: historyByQuestion[v.question_id] || [],
        })));
      }
    } catch (error) {
      console.error('Error loading votes:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function searchQuestions() {
    if (!userId || searchQuery.length < 1) return;

    setIsLoading(true);
    try {
      // Search across all geo_scopes with ILIKE
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .or(`status.eq.active,status.eq.pending,status.eq.archived`)
        .ilike('word', `%${searchQuery}%`)
        .order('total_votes', { ascending: false })
        .limit(30);

      // Check which are archived by user
      const { data: archives } = await supabase
        .from('user_archives')
        .select('question_id')
        .eq('user_id', userId);

      const archivedIds = new Set((archives || []).map(a => a.question_id));

      setSearchResults((questions || []).map(q => ({
        ...q,
        isArchived: archivedIds.has(q.id),
      })));
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function reactivateQuestion(questionId: string) {
    if (!userId) return;

    await hapticPatterns.tap();
    await supabase
      .from('user_archives')
      .delete()
      .eq('user_id', userId)
      .eq('question_id', questionId);

    setSearchResults(prev => 
      prev.map(q => q.id === questionId ? { ...q, isArchived: false } : q)
    );
  }

  function toggleComparisonSelection(questionId: string) {
    hapticPatterns.tap();
    setSelectedForComparison(prev => {
      if (prev.includes(questionId)) {
        return prev.filter(id => id !== questionId);
      } else if (prev.length < 5) {
        return [...prev, questionId];
      }
      return prev;
    });
  }

  async function loadSavedComparisons() {
    if (!userId) return;

    const { data } = await supabase
      .from('question_comparisons')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    setSavedComparisons(data || []);
  }

  async function startComparison() {
    if (selectedForComparison.length < 2) return;

    setIsLoading(true);
    try {
      // Load question data
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .in('id', selectedForComparison);

      setComparisonQuestions(questions || []);

      // Load timeseries data for each question (last 30 days)
      const timeseries: { [key: string]: TimeseriesPoint[] } = {};
      
      for (const qId of selectedForComparison) {
        const { data } = await supabase
          .from('vote_timeseries')
          .select('bucket, yes_count, total_count')
          .eq('question_id', qId)
          .gte('bucket', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('bucket', { ascending: true });

        if (data) {
          // Aggregate by day
          const byDay: { [key: string]: { yes: number; total: number } } = {};
          data.forEach(row => {
            const day = row.bucket.split('T')[0];
            if (!byDay[day]) byDay[day] = { yes: 0, total: 0 };
            byDay[day].yes += row.yes_count;
            byDay[day].total += row.total_count;
          });

          timeseries[qId] = Object.entries(byDay).map(([day, counts]) => ({
            day,
            yes_pct: counts.total > 0 ? Math.round((counts.yes * 100) / counts.total) : 0,
          }));
        }
      }

      setTimeseriesData(timeseries);
      setShowComparisonView(true);
    } catch (error) {
      console.error('Error loading comparison:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveComparison() {
    if (!userId || selectedForComparison.length < 2) return;

    await hapticPatterns.tap();
    
    // Check max 10 saved comparisons
    if (savedComparisons.length >= 10) {
      // Delete oldest
      const oldest = savedComparisons[savedComparisons.length - 1];
      await supabase
        .from('question_comparisons')
        .delete()
        .eq('id', oldest.id);
    }

    const name = comparisonQuestions.map(q => q.word).join(' vs ');
    
    await supabase.from('question_comparisons').insert({
      user_id: userId,
      name,
      question_ids: selectedForComparison,
    });

    await loadSavedComparisons();
    await hapticPatterns.success();
  }

  async function shareComparison() {
    if (!comparisonViewRef.current) return;

    try {
      await hapticPatterns.tap();
      const uri = await comparisonViewRef.current.capture?.();
      if (uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: t('comparison.share'),
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  }

  async function loadCompassData() {
    if (!userId) return;

    setIsLoading(true);
    try {
      // Check if compass is unlocked (50+ yes/no votes)
      const { count: voteCount } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('vote_value', ['yes', 'no']);

      setTotalYesNoVotes(voteCount || 0);
      setCompassUnlocked((voteCount || 0) >= 50);

      if ((voteCount || 0) >= 50) {
        // Calculate compass position from calibrated questions only
        const { data: votes } = await supabase
          .from('votes')
          .select(`
            vote_value,
            questions!inner (
              axis_x,
              axis_y
            )
          `)
          .eq('user_id', userId)
          .in('vote_value', ['yes', 'no'])
          .not('questions.axis_x', 'is', null)
          .not('questions.axis_y', 'is', null);

        if (votes && votes.length >= 10) {
          let sumX = 0;
          let sumY = 0;

          for (const vote of votes) {
            const question = vote.questions as any;
            const multiplier = vote.vote_value === 'yes' ? 1 : -1;
            sumX += question.axis_x * multiplier;
            sumY += question.axis_y * multiplier;
          }

          setCompassData({
            x: sumX / votes.length,
            y: sumY / votes.length,
            calibratedVotes: votes.length,
          });
        } else {
          setCompassData(null);
        }
      }
    } catch (error) {
      console.error('Error loading compass:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function shareCompass() {
    if (!compassViewRef.current) return;

    try {
      await hapticPatterns.tap();
      const uri = await compassViewRef.current.capture?.();
      if (uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: t('compass.share'),
        });
      }
    } catch (error) {
      console.error('Error sharing compass:', error);
    }
  }

  function getVoteIcon(voteValue: string): string {
    switch (voteValue) {
      case 'yes': return '👍';
      case 'no': return '👎';
      case 'skip': return '⏭️';
      case 'deep_dive': return '☁️';
      default: return '❓';
    }
  }

  function isVoteLocked(votedAt: string): boolean {
    const elapsed = Date.now() - new Date(votedAt).getTime();
    return elapsed < VOTE_LOCK_MS;
  }

  function getLockRemainingSeconds(votedAt: string): number {
    const elapsed = Date.now() - new Date(votedAt).getTime();
    return Math.max(0, Math.ceil((VOTE_LOCK_MS - elapsed) / 1000));
  }

  function formatTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return t('time.just_now');
    if (diffMins < 60) return t('time.minutes_ago', { count: diffMins });
    if (diffHours < 24) return t('time.hours_ago', { count: diffHours });
    if (diffDays === 1) return t('time.yesterday');
    return t('time.days_ago', { count: diffDays });
  }

  function getCompassQuadrant(x: number, y: number): string {
    if (x >= 0 && y >= 0) return t('compass.quadrant_liberal_market');
    if (x < 0 && y >= 0) return t('compass.quadrant_liberal_social');
    if (x >= 0 && y < 0) return t('compass.quadrant_conservative_market');
    return t('compass.quadrant_conservative_social');
  }

  const threshold = RESULT_THRESHOLDS[membershipType as keyof typeof RESULT_THRESHOLDS] || 500;

  // ========================
  // RENDER: Vote Item
  // ========================
  function renderVoteItem({ item }: { item: Vote }) {
    const q = item.question;
    const showResult = q.total_votes >= threshold;
    const yesPct = showResult ? Math.round((q.yes_count * 100) / q.total_votes) : 0;
    const locked = isVoteLocked(item.voted_at);
    const remainingSec = getLockRemainingSeconds(item.voted_at);

    return (
      <View style={styles.voteItem}>
        <View style={styles.voteHeader}>
          <Text style={styles.voteWord}>{q.word}</Text>
          <Text style={styles.voteIcon}>{getVoteIcon(item.vote_value)}</Text>
        </View>
        
        <View style={styles.voteFooter}>
          <Text style={styles.voteTime}>{formatTimeAgo(item.voted_at)}</Text>
          
          {/* Lock indicator - INV-15 */}
          <View style={styles.lockIndicator}>
            {locked ? (
              <Text style={styles.lockLocked}>
                🔴 {t('swipe.vote_locked', { seconds: remainingSec })}
              </Text>
            ) : (
              <TouchableOpacity>
                <Text style={styles.lockUnlocked}>
                  🟢 {t('swipe.vote_changeable')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {showResult && (
          <Text style={styles.voteResult}>
            {yesPct}% {t('swipe.yes')} · {q.total_votes.toLocaleString()} {t('common.votes')}
          </Text>
        )}

        {/* Vote history entries */}
        {item.history && item.history.length > 0 && (
          <View style={styles.historyContainer}>
            {item.history.map((h, idx) => (
              <Text key={idx} style={styles.historyEntry}>
                {t('history.changed_from', {
                  from: h.old_value.toUpperCase(),
                  to: h.new_value.toUpperCase(),
                })} ({formatTimeAgo(h.changed_at)})
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ========================
  // RENDER: Search Item
  // ========================
  function renderSearchItem({ item }: { item: SearchResult }) {
    const showResult = item.status === 'active' && item.total_votes >= threshold;
    const yesPct = showResult ? Math.round((item.yes_count * 100) / item.total_votes) : 0;
    const isSelected = selectedForComparison.includes(item.id);

    return (
      <TouchableOpacity
        style={[styles.searchItem, isSelected && styles.searchItemSelected]}
        onPress={() => toggleComparisonSelection(item.id)}
        onLongPress={() => toggleComparisonSelection(item.id)}
      >
        <View style={styles.searchHeader}>
          <Text style={styles.searchWord}>{item.word}</Text>
          <View style={[
            styles.statusBadge,
            item.status === 'active' && styles.statusActive,
            item.status === 'pending' && styles.statusPending,
          ]}>
            <Text style={styles.statusText}>
              {item.status === 'active' 
                ? `${item.total_votes.toLocaleString()} ${t('common.votes')}`
                : t('search.pending', { count: item.submission_count })}
            </Text>
          </View>
        </View>

        {showResult && (
          <View style={styles.resultBar}>
            <View style={[styles.resultBarFill, { width: `${yesPct}%` }]} />
          </View>
        )}

        {item.isArchived && (
          <View style={styles.archivedRow}>
            <Text style={styles.archivedLabel}>{t('search.archived')}</Text>
            <TouchableOpacity onPress={() => reactivateQuestion(item.id)}>
              <Text style={styles.reactivateButton}>{t('search.reactivate')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ========================
  // RENDER: Comparison View
  // ========================
  function renderComparisonView() {
    // Prepare chart data
    const allDays = new Set<string>();
    Object.values(timeseriesData).forEach(ts => {
      ts.forEach(p => allDays.add(p.day));
    });
    const sortedDays = Array.from(allDays).sort();

    return (
      <View style={styles.comparisonContainer}>
        {/* Share card wrapper - collapsable={false} for Android */}
        <ViewShot
          ref={comparisonViewRef}
          options={{ format: 'jpg', quality: 0.9, width: 1080, height: 1080 }}
          style={styles.shareCard}
          // @ts-ignore - collapsable for Android screenshot
          collapsable={false}
        >
          {/* Header */}
          <View style={styles.shareCardHeader}>
            <Text style={styles.shareCardTitle}>#RAWLZ – {t('comparison.title')}</Text>
            <Text style={styles.shareCardDate}>
              {new Date().toLocaleDateString()}
            </Text>
          </View>

          {/* Timeseries Chart (top 60%) */}
          <View style={styles.chartContainer}>
            {sortedDays.length > 0 && comparisonQuestions.map((q, idx) => {
              const data = timeseriesData[q.id] || [];
              const lineData = sortedDays.map(day => {
                const point = data.find(p => p.day === day);
                return { value: point?.yes_pct || 0 };
              });

              return (
                <View key={q.id} style={styles.chartLine}>
                  <View style={[styles.chartLegendDot, { backgroundColor: CHART_COLORS[idx] }]} />
                  <Text style={styles.chartLegendText}>{q.word}</Text>
                </View>
              );
            })}
            
            {sortedDays.length > 0 && (
              <LineChart
                data={comparisonQuestions.map((q, idx) => ({
                  data: sortedDays.map(day => {
                    const point = (timeseriesData[q.id] || []).find(p => p.day === day);
                    return { value: point?.yes_pct || 0 };
                  }),
                  color: CHART_COLORS[idx],
                }))}
                width={SCREEN_WIDTH - 80}
                height={200}
                spacing={Math.max(10, (SCREEN_WIDTH - 80) / sortedDays.length)}
                hideDataPoints
                thickness={2}
                hideRules
                yAxisTextStyle={{ color: COLORS.gray500, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: COLORS.gray500, fontSize: 8 }}
                maxValue={100}
                noOfSections={5}
              />
            )}
          </View>

          {/* Totals (bottom 40%) */}
          <View style={styles.totalsContainer}>
            {comparisonQuestions.map((q, idx) => {
              const showResult = q.total_votes >= threshold;
              const yesPct = showResult ? Math.round((q.yes_count * 100) / q.total_votes) : 0;
              const noPct = showResult ? 100 - yesPct : 0;

              return (
                <View key={q.id} style={styles.totalRow}>
                  <View style={[styles.totalDot, { backgroundColor: CHART_COLORS[idx] }]} />
                  <Text style={styles.totalWord}>{q.word}</Text>
                  
                  {showResult ? (
                    <>
                      <View style={styles.totalBarContainer}>
                        <View style={[styles.totalBarYes, { width: `${yesPct}%` }]} />
                        <View style={[styles.totalBarNo, { width: `${noPct}%` }]} />
                      </View>
                      <Text style={styles.totalText}>
                        {yesPct}% {t('swipe.yes')} · {q.total_votes.toLocaleString()}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.thresholdText}>
                      {t('swipe.threshold_gate', { threshold })}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Watermark */}
          <Text style={styles.watermark}>rawlz.app · {new Date().toLocaleDateString()}</Text>
        </ViewShot>

        {/* Action buttons */}
        <View style={styles.comparisonActions}>
          <TouchableOpacity style={styles.actionButton} onPress={shareComparison}>
            <Text style={styles.actionButtonText}>📤 {t('comparison.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={saveComparison}>
            <Text style={styles.actionButtonText}>💾 {t('comparison.save')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => {
              setShowComparisonView(false);
              setSelectedForComparison([]);
            }}
          >
            <Text style={styles.actionButtonTextSecondary}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ========================
  // RENDER: Compass View
  // ========================
  function renderCompassView() {
    if (!compassUnlocked) {
      return (
        <View style={styles.compassLocked}>
          <Text style={styles.compassLockedIcon}>🔒</Text>
          <Text style={styles.compassLockedText}>{t('compass.locked')}</Text>
          <Text style={styles.compassProgress}>
            {t('compass.votes_needed', { count: 50 - totalYesNoVotes })}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(totalYesNoVotes / 50) * 100}%` }]} />
          </View>
        </View>
      );
    }

    if (!compassData) {
      return (
        <View style={styles.compassLocked}>
          <Text style={styles.compassLockedText}>
            {t('compass.not_enough_calibrated')}
          </Text>
        </View>
      );
    }

    // Convert x,y from -1..1 to pixel coordinates
    const gridSize = SCREEN_WIDTH - 80;
    const dotX = ((compassData.x + 1) / 2) * gridSize;
    const dotY = ((1 - compassData.y) / 2) * gridSize; // Invert Y

    return (
      <View style={styles.compassContainer}>
        <ViewShot
          ref={compassViewRef}
          options={{ format: 'jpg', quality: 0.9, width: 1080, height: 1080 }}
          style={styles.compassCard}
          // @ts-ignore
          collapsable={false}
        >
          <Text style={styles.compassTitle}>{t('compass.title')}</Text>
          
          {/* 2x2 Grid */}
          <View style={[styles.compassGrid, { width: gridSize, height: gridSize }]}>
            {/* Quadrant labels */}
            <Text style={[styles.quadrantLabel, styles.quadrantTopLeft]}>
              {t('compass.quadrant_liberal_social')}
            </Text>
            <Text style={[styles.quadrantLabel, styles.quadrantTopRight]}>
              {t('compass.quadrant_liberal_market')}
            </Text>
            <Text style={[styles.quadrantLabel, styles.quadrantBottomLeft]}>
              {t('compass.quadrant_conservative_social')}
            </Text>
            <Text style={[styles.quadrantLabel, styles.quadrantBottomRight]}>
              {t('compass.quadrant_conservative_market')}
            </Text>

            {/* Axis lines */}
            <View style={styles.axisHorizontal} />
            <View style={styles.axisVertical} />

            {/* User dot */}
            <View style={[styles.compassDot, { left: dotX - 12, top: dotY - 12 }]} />
          </View>

          <Text style={styles.compassQuadrant}>
            {getCompassQuadrant(compassData.x, compassData.y)}
          </Text>
          
          <Text style={styles.compassWatermark}>rawlz.app</Text>
        </ViewShot>

        <TouchableOpacity style={styles.shareCompassButton} onPress={shareCompass}>
          <Text style={styles.shareCompassButtonText}>📤 {t('compass.share')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ========================
  // MAIN RENDER
  // ========================
  return (
    <SafeAreaView style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['votes', 'search', 'compare', 'compass'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => {
              setActiveTab(tab);
              setShowComparisonView(false);
            }}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'votes' && t('history.title')}
              {tab === 'search' && t('search.title')}
              {tab === 'compare' && t('comparison.title')}
              {tab === 'compass' && t('compass.title')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search input */}
      {activeTab === 'search' && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={t('search.placeholder')}
            placeholderTextColor={COLORS.gray500}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.black} />
        </View>
      ) : activeTab === 'votes' ? (
        <FlatList
          data={votes}
          renderItem={renderVoteItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('history.no_votes')}</Text>
          }
        />
      ) : activeTab === 'search' ? (
        <>
          <FlatList
            data={searchResults}
            renderItem={renderSearchItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              searchQuery.length > 0 ? (
                <Text style={styles.emptyText}>{t('search.no_results')}</Text>
              ) : null
            }
          />
          {selectedForComparison.length >= 2 && (
            <View style={styles.compareBar}>
              <Text style={styles.compareText}>
                {t('comparison.selected', { count: selectedForComparison.length })}
                {selectedForComparison.length >= 5 && ` (${t('comparison.max_reached')})`}
              </Text>
              <View style={styles.compareBarButtons}>
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={() => setSelectedForComparison([])}
                >
                  <Text style={styles.clearButtonText}>{t('comparison.clear')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.compareButton} onPress={startComparison}>
                  <Text style={styles.compareButtonText}>{t('comparison.compare')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : activeTab === 'compare' ? (
        showComparisonView ? (
          renderComparisonView()
        ) : (
          <View style={styles.savedComparisonsContainer}>
            <Text style={styles.savedTitle}>{t('comparison.saved_comparisons')}</Text>
            {savedComparisons.length === 0 ? (
              <Text style={styles.emptyText}>{t('comparison.select_questions')}</Text>
            ) : (
              savedComparisons.map(comp => (
                <TouchableOpacity
                  key={comp.id}
                  style={styles.savedItem}
                  onPress={async () => {
                    setSelectedForComparison(comp.question_ids);
                    await startComparison();
                  }}
                >
                  <Text style={styles.savedName}>{comp.name}</Text>
                  <Text style={styles.savedDate}>{formatTimeAgo(comp.created_at)}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )
      ) : activeTab === 'compass' ? (
        renderCompassView()
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
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
    fontSize: 12,
    color: COLORS.gray500,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.black,
    fontWeight: '600',
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    height: 48,
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: COLORS.black,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.gray500,
    marginTop: 48,
  },
  // Vote item styles
  voteItem: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  voteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteWord: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    flex: 1,
  },
  voteIcon: {
    fontSize: 24,
  },
  voteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  voteTime: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  lockIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lockLocked: {
    fontSize: 12,
    color: COLORS.no,
  },
  lockUnlocked: {
    fontSize: 12,
    color: COLORS.yes,
    fontWeight: '600',
  },
  voteResult: {
    fontSize: 14,
    color: COLORS.gray700,
    marginTop: 8,
  },
  historyContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  historyEntry: {
    fontSize: 12,
    color: COLORS.gray500,
    marginBottom: 4,
  },
  // Search item styles
  searchItem: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  searchItemSelected: {
    borderColor: COLORS.black,
    borderWidth: 2,
  },
  searchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchWord: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.gray100,
  },
  statusActive: {
    backgroundColor: COLORS.yesLight,
  },
  statusPending: {
    backgroundColor: COLORS.goldLight,
  },
  statusText: {
    fontSize: 12,
    color: COLORS.gray700,
    fontWeight: '500',
  },
  resultBar: {
    height: 6,
    backgroundColor: COLORS.noLight,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  resultBarFill: {
    height: '100%',
    backgroundColor: COLORS.yes,
    borderRadius: 3,
  },
  archivedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  archivedLabel: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  reactivateButton: {
    fontSize: 14,
    color: COLORS.deepDive,
    fontWeight: '600',
  },
  // Compare bar
  compareBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.black,
  },
  compareText: {
    color: COLORS.white,
    fontSize: 14,
    flex: 1,
  },
  compareBarButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: COLORS.gray300,
    fontSize: 14,
  },
  compareButton: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  compareButtonText: {
    color: COLORS.black,
    fontWeight: '600',
  },
  // Comparison view
  comparisonContainer: {
    flex: 1,
  },
  shareCard: {
    backgroundColor: COLORS.white,
    padding: 20,
    margin: 16,
    borderRadius: 16,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  shareCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.gold,
  },
  shareCardDate: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  chartContainer: {
    marginBottom: 20,
  },
  chartLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  chartLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  chartLegendText: {
    fontSize: 12,
    color: COLORS.gray700,
  },
  totalsContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    paddingTop: 16,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  totalWord: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
    width: 100,
  },
  totalBarContainer: {
    flex: 1,
    height: 8,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  totalBarYes: {
    backgroundColor: COLORS.yes,
    height: '100%',
  },
  totalBarNo: {
    backgroundColor: COLORS.no,
    height: '100%',
  },
  totalText: {
    fontSize: 11,
    color: COLORS.gray700,
    width: 80,
    textAlign: 'right',
  },
  thresholdText: {
    fontSize: 11,
    color: COLORS.gray500,
    flex: 1,
    marginLeft: 8,
  },
  watermark: {
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.gray500,
    marginTop: 16,
  },
  comparisonActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
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
    fontWeight: '600',
  },
  actionButtonSecondary: {
    backgroundColor: COLORS.gray100,
  },
  actionButtonTextSecondary: {
    color: COLORS.black,
  },
  // Saved comparisons
  savedComparisonsContainer: {
    padding: 16,
  },
  savedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: 16,
  },
  savedItem: {
    backgroundColor: COLORS.gray100,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  savedName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.black,
  },
  savedDate: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 4,
  },
  // Compass styles
  compassLocked: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  compassLockedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  compassLockedText: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
    marginBottom: 16,
  },
  compassProgress: {
    fontSize: 14,
    color: COLORS.gray700,
    marginBottom: 8,
  },
  progressBar: {
    width: 200,
    height: 8,
    backgroundColor: COLORS.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.black,
  },
  compassContainer: {
    flex: 1,
    padding: 16,
  },
  compassCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  compassTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: 24,
  },
  compassGrid: {
    backgroundColor: COLORS.gray100,
    position: 'relative',
  },
  quadrantLabel: {
    position: 'absolute',
    fontSize: 10,
    color: COLORS.gray500,
    textAlign: 'center',
  },
  quadrantTopLeft: {
    top: 8,
    left: 8,
    width: '45%',
  },
  quadrantTopRight: {
    top: 8,
    right: 8,
    width: '45%',
    textAlign: 'right',
  },
  quadrantBottomLeft: {
    bottom: 8,
    left: 8,
    width: '45%',
  },
  quadrantBottomRight: {
    bottom: 8,
    right: 8,
    width: '45%',
    textAlign: 'right',
  },
  axisHorizontal: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.gray300,
  },
  axisVertical: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.gray300,
  },
  compassDot: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.gold,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  compassQuadrant: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginTop: 24,
  },
  compassWatermark: {
    fontSize: 12,
    color: COLORS.gray500,
    marginTop: 16,
  },
  shareCompassButton: {
    backgroundColor: COLORS.black,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  shareCompassButtonText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 16,
  },
});
