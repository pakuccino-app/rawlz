// EF-11: /functions/v1/admin-auth-check
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Real-IP, X-Forwarded-For',
      },
    });
  }

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const ip = req.headers.get('X-Real-IP') ||
             req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
             '';

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'No session token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get session
  const { data: sess } = await supabase
    .from('admin_sessions')
    .select('admin_id,expires_at,totp_verified,ip_address,last_used_at')
    .eq('session_token', token)
    .single();

  if (!sess) {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check session expiry
  if (new Date(sess.expires_at) < new Date()) {
    await supabase.from('admin_sessions').delete().eq('session_token', token);
    return new Response(
      JSON.stringify({ error: 'Session expired' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check session timeout (2 hours of inactivity)
  if (Date.now() - new Date(sess.last_used_at).getTime() > 2 * 60 * 60 * 1000) {
    await supabase.from('admin_sessions').delete().eq('session_token', token);
    return new Response(
      JSON.stringify({ error: 'Session timed out' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check 2FA verification
  if (!sess.totp_verified) {
    return new Response(
      JSON.stringify({ error: '2FA not verified' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check IP match
  if (sess.ip_address !== ip && ip !== '') {
    await supabase.from('admin_audit_log').insert({
      admin_id: sess.admin_id,
      action: 'session_ip_mismatch',
      details: { expected: sess.ip_address, got: ip },
    });
    return new Response(
      JSON.stringify({ error: 'IP mismatch' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Update last_used_at
  await supabase
    .from('admin_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('session_token', token);

  // Get admin user
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id,role,display_name,is_active')
    .eq('id', sess.admin_id)
    .single();

  if (!admin || !admin.is_active) {
    return new Response(
      JSON.stringify({ error: 'Admin inactive' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      adminId: admin.id,
      role: admin.role,
      displayName: admin.display_name,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
