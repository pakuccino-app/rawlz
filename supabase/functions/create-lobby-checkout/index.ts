// EF-11: /functions/v1/create-lobby-checkout
// Creates Stripe Checkout session for commercial Lobby accounts (€2,400/year)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const LOBBY_PRICE_ID = Deno.env.get('STRIPE_LOBBY_PRICE_ID') || 'price_lobby_yearly';
const SUCCESS_URL = Deno.env.get('LOBBY_SUCCESS_URL') || 'https://lobby.rawlz.app/success';
const CANCEL_URL = Deno.env.get('LOBBY_CANCEL_URL') || 'https://lobby.rawlz.app/checkout-cancelled';

interface CheckoutRequest {
  lobbyAccountId: string;
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

  const body: CheckoutRequest = await req.json();
  const { lobbyAccountId } = body;

  try {
    // Get lobby account
    const { data: lobbyAccount, error: lobbyError } = await supabase
      .from('lobby_accounts')
      .select('*')
      .eq('id', lobbyAccountId)
      .eq('user_id', user.id)
      .single();

    if (lobbyError || !lobbyAccount) {
      return new Response(
        JSON.stringify({ error: 'Lobby account not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (lobbyAccount.account_type !== 'commercial') {
      return new Response(
        JSON.stringify({ error: 'This checkout is only for commercial accounts' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = lobbyAccount.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: lobbyAccount.contact_email,
        name: lobbyAccount.company_name,
        metadata: {
          lobby_account_id: lobbyAccountId,
          user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID
      await supabase
        .from('lobby_accounts')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', lobbyAccountId);
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card', 'sepa_debit'],
      mode: 'subscription',
      line_items: [
        {
          price: LOBBY_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      metadata: {
        lobby_account_id: lobbyAccountId,
        user_id: user.id,
        account_type: 'commercial',
      },
      subscription_data: {
        metadata: {
          lobby_account_id: lobbyAccountId,
          user_id: user.id,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
    });

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Checkout creation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
