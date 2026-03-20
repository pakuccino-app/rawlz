// EF-10: /functions/v1/admin-totp-verify
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticator } from 'https://esm.sh/otplib@12';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function decrypt(encrypted: string): Promise<string> {
  const keyMaterial = Deno.env.get('ADMIN_TOTP_ENCRYPTION_KEY')!
    .padEnd(32, '0')
    .slice(0, 32);
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
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

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const { totpCode, isSetupConfirmation } = await req.json();

  if (!token || !totpCode) {
    return new Response(
      JSON.stringify({ error: 'sessionToken and totpCode required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify session
  const { data: sess } = await supabase
    .from('admin_sessions')
    .select('admin_id,expires_at,ip_address')
    .eq('session_token', token)
    .single();

  if (!sess || new Date(sess.expires_at) < new Date()) {
    return new Response('Session expired', { status: 401 });
  }

  // Get admin user
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id,role,display_name,totp_secret,failed_attempts,locked_until')
    .eq('id', sess.admin_id)
    .single();

  if (!admin?.totp_secret) {
    return new Response(
      JSON.stringify({ error: 'TOTP not configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
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

  // Decrypt and verify TOTP
  const secret = await decrypt(admin.totp_secret);
  authenticator.options = { window: 1 };
  const isValid = authenticator.check(totpCode, secret);

  if (!isValid) {
    const newAttempts = admin.failed_attempts + 1;
    const update: any = { failed_attempts: newAttempts };
    
    if (newAttempts >= 5) {
      update.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    
    await supabase.from('admin_users').update(update).eq('id', admin.id);
    await supabase.from('admin_audit_log').insert({
      admin_id: admin.id,
      action: 'totp_failed',
      details: { attempts: newAttempts },
    });

    return new Response(
      JSON.stringify({
        error: 'Invalid code',
        attemptsRemaining: Math.max(0, 5 - newAttempts),
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // TOTP verified successfully
  const userUpdate: any = {
    failed_attempts: 0,
    locked_until: null,
    last_login_at: new Date().toISOString(),
  };

  if (isSetupConfirmation) {
    userUpdate.totp_enabled = true;
    userUpdate.totp_setup_at = new Date().toISOString();
  }

  await supabase.from('admin_users').update(userUpdate).eq('id', admin.id);

  // Mark session as TOTP verified
  await supabase
    .from('admin_sessions')
    .update({
      totp_verified: true,
      last_used_at: new Date().toISOString(),
    })
    .eq('session_token', token);

  // Log success
  await supabase.from('admin_audit_log').insert({
    admin_id: admin.id,
    action: isSetupConfirmation ? 'totp_setup_completed' : 'login_success',
    details: { ip: sess.ip_address, role: admin.role },
  });

  return new Response(
    JSON.stringify({
      success: true,
      role: admin.role,
      displayName: admin.display_name,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
