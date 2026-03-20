// app/(tabs)/search.tsx
// Search & History Dashboard

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { COLORS, RESULT_THRESHOLDS } from '../../lib/constants';
import { supabase, getCurrentUser } from '../../lib/supabase';

type TabType = 'votes' | 'search' | 'compare' | 'compass';

interface Vote {
  id: string;
  question_id: string;
  vote_value: string;
  voted_at: string;
  question: {
    word: string;
    yes_count: number;
    no_count: number;
    total_votes: number;
  };
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
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (activeTab === 'votes' && userId) {
      loadVotes();
    }
  }, [activeTab, userId]);

  useEffect(() => {
    if (activeTab === 'search' && searchQuery.length > 0) {
      const timer = setTimeout(() => {
        searchQuestions();
      }, 300);
      return () => clearTimeout(timer);
    }
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
      const { data } = await supabase
        .from('votes')
        .select(`
          id,
          question_id,
          vote_value,
          voted_at,
          questions!inner (
            word,
            yes_count,
            no_count,
            total_votes
          )
        `)
        .eq('user_id', userId)
        .order('voted_at', { ascending: false })
        .limit(50);

      if (data) {
        setVotes(data.map(v => ({
          ...v,
          question: v.questions as any,
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

    await supabase
      .from('user_archives')
      .delete()
      .eq('user_id', userId)
      .eq('question_id', questionId);

    // Update local state
    setSearchResults(prev => 
      prev.map(q => q.id === questionId ? { ...q, isArchived: false } : q)
    );
  }

  function toggleComparisonSelection(questionId: string) {
    setSelectedForComparison(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else if (newSet.size < 5) {
        newSet.add(questionId);
      }
      return newSet;
    });
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

  const threshold = RESULT_THRESHOLDS[membershipType as keyof typeof RESULT_THRESHOLDS] || 500;

  function renderVoteItem({ item }: { item: Vote }) {
    const q = item.question;
    const showResult = q.total_votes >= threshold;
    const yesPct = showResult ? Math.round((q.yes_count * 100) / q.total_votes) : 0;

    return (
      <View style={styles.voteItem}>
        <View style={styles.voteHeader}>
          <Text style={styles.voteWord}>{q.word}</Text>
          <Text style={styles.voteIcon}>{getVoteIcon(item.vote_value)}</Text>
        </View>
        <View style={styles.voteFooter}>
          <Text style={styles.voteTime}>{formatTimeAgo(item.voted_at)}</Text>
          {showResult && (
            <Text style={styles.voteResult}>
              {yesPct}% {t('swipe.yes')} · {q.total_votes.toLocaleString()} {t('common.votes')}
            </Text>
          )}
        </View>
      </View>
    );
  }

  function renderSearchItem({ item }: { item: SearchResult }) {
    const showResult = item.status === 'active' && item.total_votes >= threshold;
    const yesPct = showResult ? Math.round((item.yes_count * 100) / item.total_votes) : 0;
    const isSelected = selectedForComparison.has(item.id);

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
                ? `${item.total_votes} ${t('common.votes')}`
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['votes', 'search', 'compare', 'compass'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
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
          {selectedForComparison.size >= 2 && (
            <View style={styles.compareBar}>
              <Text style={styles.compareText}>
                {t('comparison.selected', { count: selectedForComparison.size })}
              </Text>
              <TouchableOpacity style={styles.compareButton}>
                <Text style={styles.compareButtonText}>{t('comparison.compare')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : activeTab === 'compass' ? (
        <View style={styles.compassContainer}>
          <Text style={styles.compassLocked}>{t('compass.locked')}</Text>
        </View>
      ) : (
        <View style={styles.compassContainer}>
          <Text style={styles.compassLocked}>{t('comparison.select_questions')}</Text>
        </View>
      )}
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
    fontSize: 13,
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
  voteResult: {
    fontSize: 14,
    color: COLORS.gray700,
  },
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
  compassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  compassLocked: {
    fontSize: 16,
    color: COLORS.gray500,
    textAlign: 'center',
  },
});
