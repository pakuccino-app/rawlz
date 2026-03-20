// EF-07: /functions/v1/get-daily-pulse
// Returns today's Daily Pulse question if one exists
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Auth is optional for this endpoint
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id || null;
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Get today's daily pulse
    const { data: dailyPulse, error } = await supabase
      .from('questions')
      .select('*')
      .eq('is_daily_pulse', true)
      .eq('daily_pulse_date', today)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!dailyPulse) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          hasDailyPulse: false,
          dailyPulse: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already voted on it
    let userVoted = false;
    if (userId) {
      const { data: vote } = await supabase
        .from('votes')
        .select('id')
        .eq('question_id', dailyPulse.id)
        .eq('user_id', userId)
        .maybeSingle();
      
      userVoted = !!vote;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        hasDailyPulse: true,
        dailyPulse,
        userVoted,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Daily pulse error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get daily pulse' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
