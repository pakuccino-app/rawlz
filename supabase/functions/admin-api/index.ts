// EF-21: /functions/v1/admin-api
// Unified admin API for all admin operations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

interface AdminRequest {
  action: string;
  payload?: any;
}

// Verify admin session and IP  – FIX 6: admin_sessions statt admin_users
async function verifyAdmin(token: string, clientIp: string): Promise<{ admin: any; error?: string }> {
  // Session in admin_sessions suchen (mit totp_verified = true)
  const { data: sess, error: sessErr } = await supabase
    .from('admin_sessions')
    .select('admin_id, expires_at, ip_address, totp_verified')
    .eq('session_token', token)
    .single();

  if (sessErr || !sess) {
    return { admin: null, error: 'Ungültige Session' };
  }

  if (new Date(sess.expires_at) < new Date()) {
    return { admin: null, error: 'Session abgelaufen' };
  }

  if (!sess.totp_verified) {
    return { admin: null, error: '2FA nicht abgeschlossen' };
  }

  // Admin-User laden
  const { data: admin, error: adminErr } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', sess.admin_id)
    .single();

  if (adminErr || !admin || !admin.is_active) {
    return { admin: null, error: 'Admin nicht gefunden oder inaktiv' };
  }

  // Inaktivitäts-Timeout (2h)
  const inactivity = sess.last_used_at
    ? Date.now() - new Date(sess.last_used_at).getTime()
    : 0;
  if (inactivity > INACTIVITY_TIMEOUT_MS) {
    return { admin: null, error: 'Session-Timeout (Inaktivität)' };
  }

  // IP-Whitelist prüfen (nur wenn Einträge vorhanden)
  const { data: ipEntries } = await supabase
    .from('admin_ip_whitelist')
    .select('id')
    .limit(1);

  if (ipEntries && ipEntries.length > 0) {
    const { data: ipCheck } = await supabase
      .from('admin_ip_whitelist')
      .select('ip')
      .eq('ip', clientIp)
      .maybeSingle();

    if (!ipCheck) {
      return { admin: null, error: 'IP nicht autorisiert' };
    }
  }

  // last_used_at aktualisieren
  await supabase
    .from('admin_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('session_token', token);

  return { admin };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Forwarded-For',
      },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const clientIp = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() || '127.0.0.1';

  const { admin, error: authError } = await verifyAdmin(token, clientIp);
  if (authError) {
    return new Response(JSON.stringify({ error: authError }), { status: 401 });
  }

  const body: AdminRequest = await req.json();

  try {
    switch (body.action) {
      // ==================== QUESTIONS ====================
      case 'get_questions': {
        const { status, language, geoScope, page = 0, limit = 50 } = body.payload || {};
        
        let query = supabase
          .from('questions')
          .select('*', { count: 'exact' })
          .order('submission_count', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1);

        if (status) query = query.eq('status', status);
        if (language) query = query.eq('language_code', language);
        if (geoScope) query = query.eq('geo_scope', geoScope);

        const { data, count, error } = await query;
        if (error) throw error;

        // Get notification subscriber counts
        const questionIds = (data || []).map(q => q.id);
        const { data: notifCounts } = await supabase
          .from('question_notification_requests')
          .select('question_id')
          .in('question_id', questionIds);

        const subscriberMap: Record<string, number> = {};
        (notifCounts || []).forEach(n => {
          subscriberMap[n.question_id] = (subscriberMap[n.question_id] || 0) + 1;
        });

        const questions = (data || []).map(q => ({
          ...q,
          notification_subscribers: subscriberMap[q.id] || 0,
        }));

        return new Response(JSON.stringify({ questions, total: count }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'activate_question': {
        const { questionId } = body.payload;
        
        await supabase
          .from('questions')
          .update({ status: 'active' })
          .eq('id', questionId);

        // Call tag-question
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tag-question`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ questionId }),
        });

        // Call activate-question-notify
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/activate-question-notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ questionId }),
        });

        await supabase.from('admin_audit_log').insert({
          admin_id: admin.id,
          action: 'activate_question',
          entity_type: 'question',
          entity_id: questionId,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'block_question': {
        const { questionId } = body.payload;
        
        await supabase
          .from('questions')
          .update({ status: 'blocked' })
          .eq('id', questionId);

        await supabase.from('admin_audit_log').insert({
          admin_id: admin.id,
          action: 'block_question',
          entity_type: 'question',
          entity_id: questionId,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'set_question_axes': {
        const { questionId, axisX, axisY } = body.payload;
        
        await supabase
          .from('questions')
          .update({ axis_x: axisX, axis_y: axisY })
          .eq('id', questionId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== MODERATION ====================
      case 'get_moderation_queue': {
        const { data, error } = await supabase
          .from('moderation_queue')
          .select('*')
          .eq('status', 'pending')
          .order('priority', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) throw error;
        return new Response(JSON.stringify({ items: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'resolve_moderation': {
        const { itemId, resolution } = body.payload;
        
        await supabase
          .from('moderation_queue')
          .update({ status: resolution, resolved_by: admin.id, resolved_at: new Date().toISOString() })
          .eq('id', itemId);

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== KYC ====================
      case 'get_kyc_queue': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { accountType } = body.payload || {};
        let query = supabase
          .from('lobby_accounts')
          .select('*')
          .eq('kyc_status', 'pending')
          .order('created_at', { ascending: true });

        if (accountType) query = query.eq('account_type', accountType);

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ accounts: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== TRUST SCORE ====================
      case 'search_users': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { deviceHash } = body.payload;
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .ilike('device_hash', `%${deviceHash}%`)
          .limit(20);

        if (error) throw error;
        return new Response(JSON.stringify({ users: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'update_trust_score': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { userId, newScore, reason } = body.payload;
        
        const { data: user } = await supabase
          .from('users')
          .select('trust_score')
          .eq('id', userId)
          .single();

        const change = newScore - (user?.trust_score || 100);

        await supabase
          .from('users')
          .update({ trust_score: newScore })
          .eq('id', userId);

        await supabase.from('trust_score_history').insert({
          user_id: userId,
          change_amount: change,
          reason: reason || 'admin_adjustment',
          new_score: newScore,
        });

        await supabase.from('admin_audit_log').insert({
          admin_id: admin.id,
          action: 'update_trust_score',
          entity_type: 'user',
          entity_id: userId,
          details: { oldScore: user?.trust_score, newScore, reason },
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'ban_user': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { userId, ban } = body.payload;
        
        await supabase
          .from('users')
          .update({ is_banned: ban })
          .eq('id', userId);

        await supabase.from('admin_audit_log').insert({
          admin_id: admin.id,
          action: ban ? 'ban_user' : 'unban_user',
          entity_type: 'user',
          entity_id: userId,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== ANALYTICS ====================
      case 'get_analytics': {
        const isSuperAdmin = admin.role === 'super_admin';

        // DAU/MAU
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const { count: dau } = await supabase
          .from('votes')
          .select('user_id', { count: 'exact', head: true })
          .gte('voted_at', today);

        const { count: mau } = await supabase
          .from('votes')
          .select('user_id', { count: 'exact', head: true })
          .gte('voted_at', thirtyDaysAgo);

        const { count: totalVotes } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true });

        const { count: totalQuestions } = await supabase
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        const analytics: any = { dau, mau, totalVotes, totalQuestions };

        // Revenue (super admin only)
        if (isSuperAdmin) {
          const { count: supporters } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('membership_type', 'supporter');

          const { count: lobbyAccounts } = await supabase
            .from('lobby_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('subscription_status', 'active');

          analytics.supporterRevenue = (supporters || 0) * 1; // €1 each
          analytics.lobbyRevenue = (lobbyAccounts || 0) * 2400; // €2400 each
        }

        return new Response(JSON.stringify({ analytics }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== EXPERT NOMINATIONS ====================
      case 'get_nominations': {
        const { data, error } = await supabase
          .from('expert_nominations')
          .select('*')
          .order('nomination_count', { ascending: false })
          .limit(100);

        if (error) throw error;
        return new Response(JSON.stringify({ nominations: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== ADMIN USER MANAGEMENT ====================
      case 'get_admin_users': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { data, error } = await supabase
          .from('admin_users')
          .select('id, email, name, role, is_active, created_at, last_login_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify({ admins: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'create_admin': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { email, name } = body.payload;
        const tempPassword = crypto.randomUUID().slice(0, 12);

        const { data: newAdmin, error } = await supabase
          .from('admin_users')
          .insert({
            email,
            name,
            password_hash: await hashPassword(tempPassword),
            role: 'moderator',
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ admin: newAdmin, tempPassword }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'get_ip_whitelist': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { data, error } = await supabase
          .from('admin_ip_whitelist')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return new Response(JSON.stringify({ ips: data }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'add_ip_whitelist': {
        if (admin.role !== 'super_admin') {
          return new Response(JSON.stringify({ error: 'Super admin required' }), { status: 403 });
        }

        const { ip, description } = body.payload;
        const { error } = await supabase
          .from('admin_ip_whitelist')
          .insert({ ip, description, created_by: admin.id });

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== PUSH NOTIFICATIONS ====================
      case 'send_push': {
        const { title, body: pushBody, targetGroup, data: pushData } = body.payload;

        const pushResult = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ title, body: pushBody, targetGroup, data: pushData }),
        });

        const pushJson = await pushResult.json();
        if (!pushResult.ok) throw new Error(pushJson.error ?? 'Push fehlgeschlagen');
        return new Response(JSON.stringify(pushJson), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      // ==================== AUDIT LOG ====================
      case 'get_audit_log': {
        const { action: filterAction, limit: logLimit = 50 } = body.payload || {};

        let query = supabase
          .from('admin_audit_log')
          .select('id, action, entity_type, entity_id, details, created_at')
          .order('created_at', { ascending: false })
          .limit(logLimit);

        if (filterAction) query = query.eq('action', filterAction);

        const { data: logs, error: logErr } = await query;
        if (logErr) throw logErr;
        return new Response(JSON.stringify({ logs }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }
  } catch (error: any) {
    console.error('Admin API error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

// Simple password hashing (use bcrypt in production)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
