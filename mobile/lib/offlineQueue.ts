// lib/offlineQueue.ts
// Offline vote queue with sync capability

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';

const QUEUE_KEY = 'rawlz_offline_vote_queue';
const CACHE_KEY = 'rawlz_question_cache';

interface QueuedVote {
  questionId: string;
  voteValue: 'yes' | 'no' | 'skip' | 'deep_dive';
  membershipType: string;
  isVerified: boolean;
  geoCountry?: string;
  geoPreference: string;
  queuedAt: string;
}

interface CachedQuestion {
  id: string;
  word: string;
  status: string;
  yes_count: number;
  no_count: number;
  total_votes: number;
  relevance_threshold: number;
  geo_scope: string;
  is_daily_pulse: boolean;
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
  let query = supabase
    .from('questions')
    .select('*')
    .eq('status', 'active');

  if (geoPreference === 'global') {
    query = query.eq('geo_scope', 'global');
  } else if (geoPreference === 'country' && geoCountry) {
    query = query.eq('geo_scope', 'country').eq('geo_country', geoCountry);
  } else if (geoPreference === 'region' && geoRegion) {
    query = query.eq('geo_scope', 'region').eq('geo_region', geoRegion);
  }

  query = query.order('total_votes', { ascending: false }).limit(20);

  const { data } = await query;
  
  if (data) {
    await AsyncStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        questions: data,
        cachedAt: Date.now(),
      })
    );
  }
}

/**
 * Get cached questions (valid for 1 hour)
 */
export async function getCachedQuestions(): Promise<CachedQuestion[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return [];

  const { questions, cachedAt } = JSON.parse(raw);
  
  // Cache valid for 1 hour
  if (Date.now() - cachedAt > 60 * 60 * 1000) {
    return [];
  }

  return questions || [];
}

/**
 * Queue a vote for later sync
 */
export async function queueVote(vote: QueuedVote): Promise<void> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  const queue: QueuedVote[] = raw ? JSON.parse(raw) : [];
  queue.push(vote);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Sync offline votes when connection is restored
 */
export async function syncOfflineQueue(): Promise<void> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return;

  const queue: QueuedVote[] = JSON.parse(raw);
  if (queue.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const failed: QueuedVote[] = [];

  for (const vote of queue) {
    // Check if a newer vote exists
    const { data: existing } = await supabase
      .from('votes')
      .select('voted_at')
      .eq('question_id', vote.questionId)
      .eq('user_id', user.id)
      .single();

    if (existing && new Date(existing.voted_at) > new Date(vote.queuedAt)) {
      // Online vote is newer — discard queued offline vote
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
      failed.push(vote);
    }
  }

  // Save failed votes for retry
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
}

/**
 * Get pending offline vote count
 */
export async function getPendingVoteCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return 0;
  return JSON.parse(raw).length;
}

/**
 * Clear offline queue
 */
export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
