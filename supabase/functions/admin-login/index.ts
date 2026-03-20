// EF-08: /functions/v1/admin-login
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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

  const { email, password, ipAddress } = await req.json();
  
  if (!email || !password || !ipAddress) {
    return new Response(
      JSON.stringify({ error: 'email, password, ipAddress required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check IP whitelist
  const { data: ipEntry } = await supabase
    .from('admin_ip_whitelist')
    .select('id')
    .eq('ip_address', ipAddress)
    .single();

  if (!ipEntry) {
    await supabase.from('admin_audit_log').insert({
      admin_id: 'unknown',
      action: 'login_ip_rejected',
      details: { email, ip: ipAddress },
    });
    return new Response(
      JSON.stringify({ error: 'IP not authorized' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get admin user
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id,role,is_active,totp_enabled,failed_attempts,locked_until,display_name')
    .eq('email', email)
    .single();

  if (!admin || !admin.is_active) {
    return new Response(
      JSON.stringify({ error: 'Not authorized' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if account is locked
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const remaining = Math.ceil(
      (new Date(admin.locked_until).getTime() - Date.now()) / 1000
    );
    return new Response(
      JSON.stringify({ error: 'Account locked', lockedForSeconds: remaining }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify password with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    const newAttempts = admin.failed_attempts + 1;
    const update: any = { failed_attempts: newAttempts };
    
    if (newAttempts >= 5) {
      update.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    
    await supabase.from('admin_users').update(update).eq('id', admin.id);
    
    return new Response(
      JSON.stringify({
        error: 'Invalid credentials',
        attemptsRemaining: Math.max(0, 5 - newAttempts),
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate session token
  const token = crypto.randomUUID().replace(/-/g, '') + 
                crypto.randomUUID().replace(/-/g, '');

  // Create admin session
  await supabase.from('admin_sessions').insert({
    admin_id: admin.id,
    session_token: token,
    ip_address: ipAddress,
    totp_verified: false,
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });

  // Log successful password verification
  await supabase.from('admin_audit_log').insert({
    admin_id: admin.id,
    action: 'login_password_ok',
    details: { ip: ipAddress },
  });

  return new Response(
    JSON.stringify({
      sessionToken: token,
      requiresTotpSetup: !admin.totp_enabled,
      displayName: admin.display_name,
      role: admin.role,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
