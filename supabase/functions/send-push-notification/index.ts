// EF-19: /functions/v1/send-push-notification
// Sends push notifications via Expo Push API
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushRequest {
  title: string;
  body: string;
  targetGroup: 'all' | 'supporter' | 'expert' | 'lobby';
  data?: Record<string, any>;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound: 'default';
  priority: 'high';
}

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

  // Verify admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('session_token', token)
    .single();

  if (!admin) {
    return new Response(JSON.stringify({ error: 'Invalid admin session' }), { status: 401 });
  }

  const body: PushRequest = await req.json();

  // Validate
  if (!body.title || body.title.length > 60) {
    return new Response(JSON.stringify({ error: 'Title required (max 60 chars)' }), { status: 400 });
  }
  if (!body.body || body.body.length > 140) {
    return new Response(JSON.stringify({ error: 'Body required (max 140 chars)' }), { status: 400 });
  }

  try {
    // Get push tokens based on target group
    let query = supabase
      .from('users')
      .select('expo_push_token')
      .not('expo_push_token', 'is', null);

    if (body.targetGroup !== 'all') {
      query = query.eq('membership_type', body.targetGroup);
    }

    const { data: users, error: usersError } = await query;
    if (usersError) throw usersError;

    const tokens = (users || [])
      .map(u => u.expo_push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No push tokens found' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send in batches of 100
    const BATCH_SIZE = 100;
    let totalSent = 0;
    let totalFailed = 0;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const messages: ExpoPushMessage[] = batch.map(token => ({
        to: token,
        title: body.title,
        body: body.body,
        data: body.data,
        sound: 'default',
        priority: 'high',
      }));

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        const result = await response.json();
        totalSent += batch.length;
        // Count errors in result.data
        if (result.data) {
          totalFailed += result.data.filter((r: any) => r.status === 'error').length;
        }
      } else {
        totalFailed += batch.length;
      }
    }

    // Log the push notification
    await supabase.from('admin_audit_log').insert({
      admin_id: admin.id,
      action: 'send_push_notification',
      entity_type: 'push_notification',
      details: {
        title: body.title,
        body: body.body,
        targetGroup: body.targetGroup,
        totalTokens: tokens.length,
        sent: totalSent - totalFailed,
        failed: totalFailed,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent - totalFailed,
        failed: totalFailed,
        total: tokens.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Push error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
