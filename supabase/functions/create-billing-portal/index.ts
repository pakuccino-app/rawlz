// EF-13: /functions/v1/create-billing-portal
// Creates Stripe Billing Portal session for Lobby accounts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const RETURN_URL = Deno.env.get('LOBBY_RETURN_URL') || 'https://lobby.rawlz.app/settings';

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

  try {
    // Get lobby account
    const { data: lobbyAccount, error: lobbyError } = await supabase
      .from('lobby_accounts')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (lobbyError || !lobbyAccount?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No billing account found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: lobbyAccount.stripe_customer_id,
      return_url: RETURN_URL,
    });

    return new Response(
      JSON.stringify({
        success: true,
        portalUrl: session.url,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Billing portal error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to create billing portal' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
