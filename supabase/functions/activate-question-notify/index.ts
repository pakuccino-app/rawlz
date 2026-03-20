// EF-02: /functions/v1/activate-question-notify
// Sends push notifications when a question gets activated
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

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

  const { questionId } = await req.json();

  if (!questionId) {
    return new Response(
      JSON.stringify({ error: 'questionId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get question
  const { data: q } = await supabase
    .from('questions')
    .select('word,status')
    .eq('id', questionId)
    .single();

  if (!q || q.status !== 'active') {
    return new Response(
      JSON.stringify({ error: 'Not active' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get subscribers with push tokens
  const { data: subs } = await supabase
    .from('question_notification_requests')
    .select('user_id,users!inner(push_token)')
    .eq('question_id', questionId);

  const valid = (subs || []).filter((s: any) => s.users?.push_token);
  let sent = 0;
  let failed = 0;

  // Send push notifications in batches of 100
  for (let i = 0; i < valid.length; i += 100) {
    const batch = valid.slice(i, i + 100);

    try {
      const res = await fetch(EXPO_PUSH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          batch.map((s: any) => ({
            to: s.users.push_token,
            title: 'Deine Frage ist jetzt live!',
            body: `${q.word} wurde freigeschaltet – jetzt abstimmen!`,
            data: { screen: 'swipe', questionId },
            sound: 'default',
            priority: 'high',
          }))
        ),
      });

      const result = await res.json();
      (result.data || []).forEach((t: any) => {
        if (t.status === 'ok') sent++;
        else failed++;
      });
    } catch {
      failed += batch.length;
    }
  }

  // Delete notification requests (INV-19: one-time only)
  await supabase
    .from('question_notification_requests')
    .delete()
    .eq('question_id', questionId);

  // Log action
  await supabase.from('admin_audit_log').insert({
    admin_id: 'system',
    action: 'activation_notifications_sent',
    entity_type: 'question',
    entity_id: questionId,
    details: { word: q.word, sent, failed, total: valid.length },
  });

  return new Response(
    JSON.stringify({ success: true, sent, failed, total: valid.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
