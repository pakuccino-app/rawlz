// EF-26: /functions/v1/cron-daily-pulse
// CRON 7: Daily Pulse Push-Benachrichtigung – jeden Morgen um 08:00 Uhr
// Supabase CRON Konfiguration (supabase/migrations/cron.sql):
//   SELECT cron.schedule('daily-pulse-push', '0 8 * * *',
//     $$SELECT net.http_post('https://PROJECT.supabase.co/functions/v1/cron-daily-pulse',
//       '{}', 'application/json',
//       ARRAY[http_header('Authorization', 'Bearer SERVICE_ROLE_KEY')])$$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const PUSH_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`;

Deno.serve(async (req: Request) => {
  // Only allow service-role or internal calls
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') ?? '';
  const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!isServiceRole) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Get today's daily pulse question
    const today = new Date().toISOString().split('T')[0];
    const { data: pulse } = await supabase
      .from('questions')
      .select('id, word')
      .eq('status', 'active')
      .eq('is_daily_pulse', true)
      .gte('pulse_date', today)
      .single();

    if (!pulse) {
      // If no explicit daily pulse, get the question with most recent activity
      const { data: fallback } = await supabase
        .from('questions')
        .select('id, word')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (!fallback) {
        return new Response(JSON.stringify({ skipped: true, reason: 'No active question' }), { status: 200 });
      }

      // Send push with fallback question
      await sendPush(
        'Tages-Frage wartet',
        `Was denkst du: "${fallback.word}"?`,
        'all',
        { questionId: fallback.id, type: 'daily_pulse' }
      );

      return new Response(JSON.stringify({ success: true, questionId: fallback.id, type: 'fallback' }), { status: 200 });
    }

    // Send daily pulse push
    await sendPush(
      'Dein Tages-Puls',
      `Neue Frage: "${pulse.word}" – jetzt abstimmen`,
      'all',
      { questionId: pulse.id, type: 'daily_pulse' }
    );

    // Log to audit
    await supabase.from('admin_audit_log').insert({
      admin_id: null,
      action: 'cron_daily_pulse',
      entity_type: 'question',
      entity_id: pulse.id,
      details: { word: pulse.word, sentAt: new Date().toISOString() },
    });

    return new Response(JSON.stringify({ success: true, questionId: pulse.id, word: pulse.word }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[cron-daily-pulse]', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

async function sendPush(title: string, body: string, targetGroup: string, data?: any) {
  const res = await fetch(PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ title, body, targetGroup, data }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? 'Push failed');
  }

  return res.json();
}
