// EF-08: /functions/v1/admin-login  (FIX: IP aus Header, korrekte Response-Felder)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // FIX 2: IP aus Request-Headern lesen (nicht aus Body)
  const clientIp =
    req.headers.get('X-Real-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    '0.0.0.0';

  const { email, password } = await req.json();

  if (!email || !password) {
    return json({ error: 'email und password erforderlich' }, 400);
  }

  // IP Whitelist prüfen (nur wenn Einträge vorhanden – optional für Entwicklung)
  const { data: ipEntries } = await supabase
    .from('admin_ip_whitelist')
    .select('id')
    .limit(1);

  if (ipEntries && ipEntries.length > 0) {
    const { data: ipEntry } = await supabase
      .from('admin_ip_whitelist')
      .select('id')
      .eq('ip_address', clientIp)
      .single();

    if (!ipEntry) {
      await supabase.from('admin_audit_log').insert({
        action: 'login_ip_rejected',
        details: { email, ip: clientIp },
      });
      return json({ error: 'IP nicht autorisiert' }, 403);
    }
  }

  // Admin-User laden
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role, is_active, totp_enabled, failed_attempts, locked_until, display_name')
    .eq('email', email)
    .single();

  if (!admin || !admin.is_active) {
    return json({ error: 'Keine Berechtigung' }, 403);
  }

  // Account gesperrt?
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const remaining = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 1000);
    return json({ error: 'Konto gesperrt', lockedForSeconds: remaining }, 429);
  }

  // Passwort via separatem Anon-Client prüfen (verhindert, dass der Service-Role-Client
  // intern auf User-Token wechselt und dadurch RLS-Fehler bei DB-Writes entstehen)
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } }
  );

  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    const newAttempts = (admin.failed_attempts ?? 0) + 1;
    const update: any = { failed_attempts: newAttempts };
    if (newAttempts >= 5) {
      update.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    await supabase.from('admin_users').update(update).eq('id', admin.id);
    return json({
      error: 'Ungültige Anmeldedaten',
      attemptsRemaining: Math.max(0, 5 - newAttempts),
    }, 401);
  }

  // Session-Token generieren und in admin_sessions speichern
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

  const { error: insertError } = await supabase.from('admin_sessions').insert({
    admin_id: admin.id,
    session_token: token,
    ip_address: clientIp,
    totp_verified: false,
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });

  if (insertError) {
    console.error('[admin-login] Session INSERT Fehler:', JSON.stringify(insertError));
    return json({ error: `Session-Fehler: ${insertError.message} (Code: ${insertError.code})` }, 500);
  }

  await supabase.from('admin_audit_log').insert({
    admin_id: admin.id,
    action: 'login_password_ok',
    details: { ip: clientIp },
  });

  // FIX 3: Korrekte Response-Felder (passend zum Frontend)
  return json({
    tempToken: token,
    needsTotp: admin.totp_enabled === true,
    needsTotpSetup: admin.totp_enabled !== true,
    displayName: admin.display_name ?? email,
    role: admin.role,
  });
});
