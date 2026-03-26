// EF-10: /functions/v1/user-totp-setup
// Handles TOTP 2FA setup for Expert users
// Actions: generate, confirm, verify
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as OTPAuth from 'https://esm.sh/otpauth@9.2.2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface TOTPRequest {
  action: 'generate' | 'confirm' | 'verify';
  totpCode?: string;
}

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

  const body: TOTPRequest = await req.json();
  const { action, totpCode } = body;

  try {
    // Get user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, membership_type, totp_secret, has_2fa')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is expert (required for 2FA)
    if (userData.membership_type !== 'expert' && action !== 'verify') {
      return new Response(
        JSON.stringify({ error: '2FA only available for experts' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'generate': {
        // Generate new TOTP secret
        const secret = new OTPAuth.Secret({ size: 20 });
        
        const totp = new OTPAuth.TOTP({
          issuer: 'RAWLZ',
          label: user.email || user.id,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: secret,
        });

        const otpauthUri = totp.toString();
        const manualCode = secret.base32;

        // Store secret temporarily (not confirmed yet)
        await supabase
          .from('users')
          .update({ totp_secret_pending: manualCode })
          .eq('id', user.id);

        return new Response(
          JSON.stringify({
            success: true,
            otpauthUri,
            manualCode,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'confirm': {
        if (!totpCode || totpCode.length !== 6) {
          return new Response(
            JSON.stringify({ error: 'Invalid TOTP code format' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Get pending secret
        const { data: pendingData } = await supabase
          .from('users')
          .select('totp_secret_pending')
          .eq('id', user.id)
          .single();

        if (!pendingData?.totp_secret_pending) {
          return new Response(
            JSON.stringify({ error: 'No pending 2FA setup. Please generate first.' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Verify the code
        const totp = new OTPAuth.TOTP({
          issuer: 'RAWLZ',
          label: user.email || user.id,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(pendingData.totp_secret_pending),
        });

        const isValid = totp.validate({ token: totpCode, window: 1 }) !== null;

        if (!isValid) {
          return new Response(
            JSON.stringify({ error: 'Invalid TOTP code' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Confirm 2FA setup
        await supabase
          .from('users')
          .update({
            totp_secret: pendingData.totp_secret_pending,
            totp_secret_pending: null,
            has_2fa: true,
          })
          .eq('id', user.id);

        return new Response(
          JSON.stringify({ success: true, message: '2FA enabled successfully' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'verify': {
        if (!totpCode || totpCode.length !== 6) {
          return new Response(
            JSON.stringify({ error: 'Invalid TOTP code format' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (!userData.totp_secret || !userData.has_2fa) {
          return new Response(
            JSON.stringify({ error: '2FA not enabled for this user' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Verify the code
        const totp = new OTPAuth.TOTP({
          issuer: 'RAWLZ',
          label: user.email || user.id,
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(userData.totp_secret),
        });

        const isValid = totp.validate({ token: totpCode, window: 1 }) !== null;

        if (!isValid) {
          return new Response(
            JSON.stringify({ error: 'Invalid TOTP code', verified: false }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, verified: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('TOTP error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'TOTP operation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
