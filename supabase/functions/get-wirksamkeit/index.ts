// EF-05: /functions/v1/get-wirksamkeit
// Returns user's effectiveness data for the Wirksamkeits-Anzeige overlay
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Verify auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get user's vote count
    const { count: totalVotes } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('vote_value', ['yes', 'no']);

    // Get "effective" votes count
    // A vote is effective if it was cast before the question reached threshold + 50
    const { data: effectiveVotes } = await supabase
      .from('votes')
      .select(`
        id,
        questions!inner (
          total_votes,
          relevance_threshold
        )
      `)
      .eq('user_id', user.id)
      .in('vote_value', ['yes', 'no']);

    let effectiveCount = 0;
    for (const vote of effectiveVotes || []) {
      const question = vote.questions as any;
      if (question.total_votes <= question.relevance_threshold + 50) {
        effectiveCount++;
      }
    }

    // Check if user has already seen Wirksamkeit overlay
    const { data: userData } = await supabase
      .from('users')
      .select('wirksamkeit_shown')
      .eq('id', user.id)
      .single();

    // Calculate effectiveness percentage
    const effectivenessPct = (totalVotes || 0) > 0 
      ? Math.round((effectiveCount * 100) / (totalVotes || 1))
      : 0;

    // Determine if overlay should show (100+ votes and not shown before)
    const shouldShowOverlay = (totalVotes || 0) >= 100 && !userData?.wirksamkeit_shown;

    return new Response(
      JSON.stringify({ 
        success: true,
        totalVotes: totalVotes || 0,
        effectiveVotes: effectiveCount,
        effectivenessPct,
        shouldShowOverlay,
        alreadyShown: userData?.wirksamkeit_shown || false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Wirksamkeit error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get effectiveness' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
