// EF-04: /functions/v1/report-abuse
// Handles abuse reporting with rate limiting
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const { questionId } = await req.json();

  if (!questionId) {
    return new Response(
      JSON.stringify({ error: 'questionId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Check if user already reported this question
    const { data: existingReport } = await supabase
      .from('abuse_reports')
      .select('id')
      .eq('question_id', questionId)
      .eq('reported_by', user.id)
      .maybeSingle();

    if (existingReport) {
      return new Response(
        JSON.stringify({ error: 'Already reported', alreadyReported: true }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: max 10 reports per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentReports } = await supabase
      .from('abuse_reports')
      .select('*', { count: 'exact', head: true })
      .eq('reported_by', user.id)
      .gte('created_at', oneHourAgo);

    if ((recentReports || 0) >= 10) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', rateLimited: true }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insert abuse report (triggers handle_abuse_report() via DB trigger)
    const { error: insertError } = await supabase
      .from('abuse_reports')
      .insert({
        question_id: questionId,
        reported_by: user.id,
      });

    if (insertError) throw insertError;

    // Get updated question abuse count
    const { data: question } = await supabase
      .from('questions')
      .select('abuse_report_count, status')
      .eq('id', questionId)
      .single();

    return new Response(
      JSON.stringify({ 
        success: true,
        newAbuseCount: question?.abuse_report_count || 0,
        questionStatus: question?.status || 'unknown',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Abuse report error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Report failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
