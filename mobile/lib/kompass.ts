// lib/kompass.ts
// Meinungs-Kompass calculation utilities

import { supabase } from './supabase';

interface KompassResult {
  x: number;
  y: number;
  calibratedVotes: number;
  quadrant: string;
}

/**
 * Get compass quadrant label
 */
export function getKompassQuadrant(x: number, y: number): string {
  if (x >= 0 && y >= 0) return 'Liberal-Markt';      // top-right
  if (x < 0 && y >= 0) return 'Liberal-Sozial';      // top-left
  if (x >= 0 && y < 0) return 'Konservativ-Markt';   // bottom-right
  return 'Konservativ-Sozial';                        // bottom-left
}

/**
 * Calculate user's compass position
 * Only considers questions with calibrated axis values
 * Returns null if fewer than 10 calibrated questions voted on
 */
export async function calculateKompassPosition(userId: string): Promise<KompassResult | null> {
  const { data, error } = await supabase.rpc('get_kompass_position', {
    p_user_id: userId,
  });

  // If RPC doesn't exist, fallback to direct query
  if (error) {
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

    if (!votes || votes.length < 10) {
      return null;
    }

    let sumX = 0;
    let sumY = 0;

    for (const vote of votes) {
      const question = vote.questions as any;
      const multiplier = vote.vote_value === 'yes' ? 1 : -1;
      sumX += question.axis_x * multiplier;
      sumY += question.axis_y * multiplier;
    }

    const x = sumX / votes.length;
    const y = sumY / votes.length;

    return {
      x,
      y,
      calibratedVotes: votes.length,
      quadrant: getKompassQuadrant(x, y),
    };
  }

  if (!data || data.calibrated_votes < 10) {
    return null;
  }

  return {
    x: data.user_x,
    y: data.user_y,
    calibratedVotes: data.calibrated_votes,
    quadrant: getKompassQuadrant(data.user_x, data.user_y),
  };
}

/**
 * Check if compass is unlocked (50+ yes/no votes)
 */
export async function isKompassUnlocked(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('vote_value', ['yes', 'no']);

  return (count || 0) >= 50;
}

/**
 * Get total yes/no vote count for compass unlock progress
 */
export async function getKompassProgress(userId: string): Promise<number> {
  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('vote_value', ['yes', 'no']);

  return count || 0;
}
