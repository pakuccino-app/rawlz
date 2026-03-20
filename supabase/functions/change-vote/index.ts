// EF-01: /functions/v1/change-vote
// 3-minute server-side lock for vote changes
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const LOCK_MS = 3 * 60 * 1000; // 3 minutes in milliseconds

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify user authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { questionId, newValue } = await req.json();

  // Validate new vote value
  if (!['yes', 'no', 'skip', 'deep_dive'].includes(newValue)) {
    return new Response(
      JSON.stringify({ error: 'Invalid vote value' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get existing vote
  const { data: existingVote } = await supabase
    .from('votes')
    .select('vote_value,voted_at')
    .eq('question_id', questionId)
    .eq('user_id', user.id)
    .single();

  if (!existingVote) {
    return new Response(
      JSON.stringify({ error: 'Vote not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check 3-minute lock (INV-15)
  const elapsedMs = Date.now() - new Date(existingVote.voted_at).getTime();
  if (elapsedMs < LOCK_MS) {
    return new Response(
      JSON.stringify({
        error: 'Too soon',
        remainingSeconds: Math.ceil((LOCK_MS - elapsedMs) / 1000),
        lockUntil: new Date(
          new Date(existingVote.voted_at).getTime() + LOCK_MS
        ).toISOString(),
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const oldValue = existingVote.vote_value;

  // Check if vote is actually changing
  if (oldValue === newValue) {
    return new Response(
      JSON.stringify({ error: 'Vote unchanged' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Log vote change history (INV-17)
  await supabase.from('vote_history').insert({
    question_id: questionId,
    user_id: user.id,
    old_value: oldValue,
    new_value: newValue,
  });

  // Update vote with new timestamp
  const now = new Date().toISOString();
  await supabase
    .from('votes')
    .update({ vote_value: newValue, voted_at: now })
    .eq('question_id', questionId)
    .eq('user_id', user.id);

  // Adjust question counts (INV-16: qualitative change only, total_votes stays same)
  let yD = 0, nD = 0, tD = 0;

  // Decrement old value
  if (oldValue === 'yes') yD = -1;
  if (oldValue === 'no') nD = -1;

  // Increment new value
  if (newValue === 'yes') yD += 1;
  if (newValue === 'no') nD += 1;

  // Adjust total_votes only if moving to/from deliberate vote
  if (['yes', 'no'].includes(oldValue) && !['yes', 'no'].includes(newValue)) {
    tD = -1; // Moving away from deliberate vote
  }
  if (!['yes', 'no'].includes(oldValue) && ['yes', 'no'].includes(newValue)) {
    tD = 1; // Moving to deliberate vote
  }

  if (yD !== 0 || nD !== 0 || tD !== 0) {
    await supabase.rpc('adjust_question_counts', {
      p_question_id: questionId,
      p_yes_delta: yD,
      p_no_delta: nD,
      p_total_delta: tD,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      oldValue,
      newValue,
      lockUntil: new Date(Date.now() + LOCK_MS).toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
