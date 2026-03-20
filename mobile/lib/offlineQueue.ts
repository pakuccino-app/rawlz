// lib/offlineQueue.ts
// Complete offline vote queue with sync capability
// INV-17: Full offline support with conflict resolution

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { supabase } from './supabase';

const QUEUE_KEY = 'rawlz_offline_vote_queue';
const CACHE_KEY = 'rawlz_question_cache';
const SYNC_LOCK_KEY = 'rawlz_sync_lock';
const LAST_SYNC_KEY = 'rawlz_last_sync';

export interface QueuedVote {
  questionId: string;
  voteValue: 'yes' | 'no' | 'skip' | 'deep_dive';
  membershipType: string;
  isVerified: boolean;
  geoCountry?: string;
  geoPreference: string;
  queuedAt: string;
  retryCount: number;
}

export interface QueuedAbuseReport {
  questionId: string;
  queuedAt: string;
}

export interface CachedQuestion {
  id: string;
  word: string;
  status: string;
  yes_count: number;
  no_count: number;
  total_votes: number;
  relevance_threshold: number;
  geo_scope: string;
  geo_country?: string;
  is_daily_pulse: boolean;
  ai_context_cache?: any;
}

interface OfflineQueueData {
  votes: QueuedVote[];
  abuseReports: QueuedAbuseReport[];
  lastModified: string;
}

interface CacheData {
  questions: CachedQuestion[];
  dailyPulse: CachedQuestion | null;
  cachedAt: number;
  userId: string;
}

interface SyncResult {
  votesProcessed: number;
  votesFailed: number;
  reportsProcessed: number;
  reportsFailed: number;
}

// Listeners for sync events
type SyncListener = (result: SyncResult) => void;
const syncListeners: Set<SyncListener> = new Set();

/**
 * Subscribe to sync completion events
 */
export function onSyncComplete(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

/**
 * Notify all listeners of sync completion
 */
function notifySyncComplete(result: SyncResult) {
  syncListeners.forEach(listener => {
    try {
      listener(result);
    } catch (e) {
      console.error('Sync listener error:', e);
    }
  });
}

/**
 * Get the offline queue data
 */
async function getQueueData(): Promise<OfflineQueueData> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) {
    return { votes: [], abuseReports: [], lastModified: new Date().toISOString() };
  }
  return JSON.parse(raw);
}

/**
 * Save the offline queue data
 */
async function saveQueueData(data: OfflineQueueData): Promise<void> {
  data.lastModified = new Date().toISOString();
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(data));
}

/**
 * Prefetch questions for offline use
 */
export async function prefetchQuestions(
  userId: string,
  geoPreference: string,
  geoCountry?: string,
  geoRegion?: string
): Promise<void> {
  try {
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

    if (geoPreference === 'global') {
      query = query.eq('geo_scope', 'global');
    } else if (geoPreference === 'country' && geoCountry) {
      query = query.or(`geo_scope.eq.global,and(geo_scope.eq.country,geo_country.eq.${geoCountry})`);
    } else if (geoPreference === 'region' && geoRegion) {
      query = query.or(`geo_scope.eq.global,and(geo_scope.eq.region,geo_region.eq.${geoRegion})`);
    }

    // Get questions not yet voted on
    const { data: votedIds } = await supabase
      .from('votes')
      .select('question_id')
      .eq('user_id', userId);

    const votedSet = new Set((votedIds || []).map(v => v.question_id));

    query = query.order('total_votes', { ascending: false }).limit(30);
    const { data } = await query;

    // Filter out already voted questions
    const filteredQuestions = (data || []).filter(q => !votedSet.has(q.id));

    const cacheData: CacheData = {
      questions: filteredQuestions,
      dailyPulse: dailyPulse && !votedSet.has(dailyPulse.id) ? dailyPulse : null,
      cachedAt: Date.now(),
      userId,
    };

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Prefetch error:', error);
  }
}

/**
 * Get cached questions (valid for 1 hour)
 */
export async function getCachedQuestions(userId: string): Promise<{
  questions: CachedQuestion[];
  dailyPulse: CachedQuestion | null;
  isFresh: boolean;
}> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) {
    return { questions: [], dailyPulse: null, isFresh: false };
  }

  const cacheData: CacheData = JSON.parse(raw);
  
  // Check if cache belongs to current user
  if (cacheData.userId !== userId) {
    return { questions: [], dailyPulse: null, isFresh: false };
  }
  
  // Cache valid for 1 hour
  const isFresh = Date.now() - cacheData.cachedAt < 60 * 60 * 1000;

  return {
    questions: cacheData.questions || [],
    dailyPulse: cacheData.dailyPulse,
    isFresh,
  };
}

/**
 * Queue a vote for later sync (offline mode)
 */
export async function queueVote(vote: Omit<QueuedVote, 'queuedAt' | 'retryCount'>): Promise<void> {
  const queueData = await getQueueData();
  
  // Remove any existing vote for this question (user might change their mind)
  queueData.votes = queueData.votes.filter(v => v.questionId !== vote.questionId);
  
  queueData.votes.push({
    ...vote,
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  });
  
  await saveQueueData(queueData);

  // Update cached question with optimistic count
  await updateCachedQuestionOptimistically(vote.questionId, vote.voteValue);
}

/**
 * Queue an abuse report for later sync
 */
export async function queueAbuseReport(questionId: string): Promise<void> {
  const queueData = await getQueueData();
  
  // Check for duplicate
  if (queueData.abuseReports.some(r => r.questionId === questionId)) {
    return;
  }
  
  queueData.abuseReports.push({
    questionId,
    queuedAt: new Date().toISOString(),
  });
  
  await saveQueueData(queueData);
}

/**
 * Update cached question counts optimistically
 */
async function updateCachedQuestionOptimistically(
  questionId: string,
  voteValue: string
): Promise<void> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return;

  const cacheData: CacheData = JSON.parse(raw);
  
  // Update in questions array
  const idx = cacheData.questions.findIndex(q => q.id === questionId);
  if (idx !== -1) {
    if (voteValue === 'yes') {
      cacheData.questions[idx].yes_count += 1;
      cacheData.questions[idx].total_votes += 1;
    } else if (voteValue === 'no') {
      cacheData.questions[idx].no_count += 1;
      cacheData.questions[idx].total_votes += 1;
    }
  }
  
  // Update daily pulse if relevant
  if (cacheData.dailyPulse?.id === questionId) {
    if (voteValue === 'yes') {
      cacheData.dailyPulse.yes_count += 1;
      cacheData.dailyPulse.total_votes += 1;
    } else if (voteValue === 'no') {
      cacheData.dailyPulse.no_count += 1;
      cacheData.dailyPulse.total_votes += 1;
    }
  }

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
}

/**
 * Check if sync is currently running
 */
async function isSyncLocked(): Promise<boolean> {
  const lock = await AsyncStorage.getItem(SYNC_LOCK_KEY);
  if (!lock) return false;
  
  // Lock expires after 30 seconds
  const lockTime = parseInt(lock, 10);
  return Date.now() - lockTime < 30000;
}

/**
 * Acquire sync lock
 */
async function acquireSyncLock(): Promise<boolean> {
  if (await isSyncLocked()) return false;
  await AsyncStorage.setItem(SYNC_LOCK_KEY, Date.now().toString());
  return true;
}

/**
 * Release sync lock
 */
async function releaseSyncLock(): Promise<void> {
  await AsyncStorage.removeItem(SYNC_LOCK_KEY);
}

/**
 * Sync offline votes when connection is restored
 */
export async function syncOfflineQueue(): Promise<SyncResult> {
  const result: SyncResult = {
    votesProcessed: 0,
    votesFailed: 0,
    reportsProcessed: 0,
    reportsFailed: 0,
  };

  // Check network
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    return result;
  }

  // Acquire lock
  if (!(await acquireSyncLock())) {
    return result;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return result;
    }

    const queueData = await getQueueData();
    
    // Process votes
    const failedVotes: QueuedVote[] = [];

    for (const vote of queueData.votes) {
      try {
        // Check if a newer vote exists on the server
        const { data: serverVote } = await supabase
          .from('votes')
          .select('voted_at')
          .eq('question_id', vote.questionId)
          .eq('user_id', user.id)
          .maybeSingle();

        // If server vote is newer, discard offline vote
        if (serverVote && new Date(serverVote.voted_at) > new Date(vote.queuedAt)) {
          result.votesProcessed++;
          continue;
        }

        // Upsert vote
        const { error } = await supabase.from('votes').upsert(
          {
            question_id: vote.questionId,
            user_id: user.id,
            vote_value: vote.voteValue,
            membership_type: vote.membershipType,
            is_verified: vote.isVerified,
            geo_country: vote.geoCountry,
            geo_preference: vote.geoPreference,
            voted_at: vote.queuedAt,
          },
          { onConflict: 'question_id,user_id' }
        );

        if (error) {
          throw error;
        }

        result.votesProcessed++;
      } catch (error) {
        console.error('Vote sync error:', error);
        vote.retryCount++;
        
        // Keep for retry if less than 3 attempts
        if (vote.retryCount < 3) {
          failedVotes.push(vote);
        }
        result.votesFailed++;
      }
    }

    // Process abuse reports
    const failedReports: QueuedAbuseReport[] = [];

    for (const report of queueData.abuseReports) {
      try {
        // Check if already reported
        const { data: existing } = await supabase
          .from('abuse_reports')
          .select('id')
          .eq('question_id', report.questionId)
          .eq('reported_by', user.id)
          .maybeSingle();

        if (existing) {
          result.reportsProcessed++;
          continue;
        }

        const { error } = await supabase.from('abuse_reports').insert({
          question_id: report.questionId,
          reported_by: user.id,
        });

        if (error) throw error;
        result.reportsProcessed++;
      } catch (error) {
        console.error('Abuse report sync error:', error);
        failedReports.push(report);
        result.reportsFailed++;
      }
    }

    // Save remaining failed items
    await saveQueueData({
      votes: failedVotes,
      abuseReports: failedReports,
      lastModified: new Date().toISOString(),
    });

    // Update last sync time
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

    // Notify listeners
    notifySyncComplete(result);

    return result;
  } finally {
    await releaseSyncLock();
  }
}

/**
 * Get pending offline item counts
 */
export async function getPendingCounts(): Promise<{
  votes: number;
  reports: number;
}> {
  const queueData = await getQueueData();
  return {
    votes: queueData.votes.length,
    reports: queueData.abuseReports.length,
  };
}

/**
 * Get pending offline vote count
 */
export async function getPendingVoteCount(): Promise<number> {
  const counts = await getPendingCounts();
  return counts.votes;
}

/**
 * Clear offline queue completely
 */
export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

/**
 * Clear question cache
 */
export async function clearQuestionCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}

/**
 * Get last sync time
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
  return raw ? new Date(raw) : null;
}

/**
 * Check if there are pending items to sync
 */
export async function hasPendingSync(): Promise<boolean> {
  const counts = await getPendingCounts();
  return counts.votes > 0 || counts.reports > 0;
}

/**
 * Network listener for auto-sync
 */
let networkUnsubscribe: (() => void) | null = null;

export function startNetworkListener(): void {
  if (networkUnsubscribe) return;

  networkUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    if (state.isConnected && state.isInternetReachable) {
      // Slight delay to ensure stable connection
      setTimeout(() => {
        syncOfflineQueue().catch(console.error);
      }, 2000);
    }
  });
}

export function stopNetworkListener(): void {
  if (networkUnsubscribe) {
    networkUnsubscribe();
    networkUnsubscribe = null;
  }
}

/**
 * Remove a specific question from the cache (after voting)
 */
export async function removeFromCache(questionId: string): Promise<void> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return;

  const cacheData: CacheData = JSON.parse(raw);
  cacheData.questions = cacheData.questions.filter(q => q.id !== questionId);
  
  if (cacheData.dailyPulse?.id === questionId) {
    cacheData.dailyPulse = null;
  }

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
}

/**
 * Get queued vote for a specific question (if any)
 */
export async function getQueuedVoteForQuestion(questionId: string): Promise<QueuedVote | null> {
  const queueData = await getQueueData();
  return queueData.votes.find(v => v.questionId === questionId) || null;
}

/**
 * Check if a question has a queued abuse report
 */
export async function hasQueuedAbuseReport(questionId: string): Promise<boolean> {
  const queueData = await getQueueData();
  return queueData.abuseReports.some(r => r.questionId === questionId);
}
