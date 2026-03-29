// EF-09: /functions/v1/admin-totp-setup
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import otplib from 'https://esm.sh/otplib@12.0.1?bundle-deps';
const { authenticator } = otplib;

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

async function encrypt(plaintext: string): Promise<string> {
  const keyMaterial = Deno.env.get('ADMIN_TOTP_ENCRYPTION_KEY')!
    .padEnd(32, '0')
    .slice(0, 32);
  
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  
  const combined = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Verify session
  const { data: sess } = await supabase
    .from('admin_sessions')
    .select('admin_id,expires_at')
    .eq('session_token', token)
    .single();

  if (!sess || new Date(sess.expires_at) < new Date()) {
    return new Response('Session expired', { status: 401 });
  }

  // Get admin user
  const { data: admin } = await supabase
    .from('admin_users')
    .select('email,totp_enabled')
    .eq('id', sess.admin_id)
    .single();

  if (!admin || admin.totp_enabled) {
    return new Response(
      JSON.stringify({ error: 'TOTP already configured' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate TOTP secret
  const secret = authenticator.generateSecret(20);
  const encryptedSecret = await encrypt(secret);

  // Store encrypted secret
  await supabase
    .from('admin_users')
    .update({ totp_secret: encryptedSecret })
    .eq('id', sess.admin_id);

  // Generate OTP auth URI for QR code
  const otpauthUri = authenticator.keyuri(admin.email, 'RAWLZ Admin', secret);

  return new Response(
    JSON.stringify({
      otpauthUri,
      manualCode: secret,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
