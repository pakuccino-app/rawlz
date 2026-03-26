// EF-15: /functions/v1/create-subsidized-checkout
// Admin function to create one-time payment checkout for subsidized lobbies with custom amount
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const SUCCESS_URL = Deno.env.get('LOBBY_SUCCESS_URL') || 'https://lobby.rawlz.app/success';
const CANCEL_URL = Deno.env.get('LOBBY_CANCEL_URL') || 'https://lobby.rawlz.app/checkout-cancelled';

interface SubsidizedCheckoutRequest {
  lobbyAccountId: string;
  amountEur: number; // Amount in EUR (e.g., 100 for €100)
  validMonths: number; // How many months the access is valid
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

  // Verify admin auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Check if admin
  const { data: adminData } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('session_token', token)
    .single();

  if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
    return new Response(
      JSON.stringify({ error: 'Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const body: SubsidizedCheckoutRequest = await req.json();
  const { lobbyAccountId, amountEur, validMonths } = body;

  if (amountEur <= 0) {
    return new Response(
      JSON.stringify({ error: 'Amount must be greater than 0. Use activate-subsidized-lobby for €0 activations.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get lobby account
    const { data: lobbyAccount, error: lobbyError } = await supabase
      .from('lobby_accounts')
      .select('*')
      .eq('id', lobbyAccountId)
      .single();

    if (lobbyError || !lobbyAccount) {
      return new Response(
        JSON.stringify({ error: 'Lobby account not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create or retrieve Stripe customer
    let stripeCustomerId = lobbyAccount.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: lobbyAccount.contact_email,
        name: lobbyAccount.company_name || lobbyAccount.contact_name,
        metadata: {
          lobby_account_id: lobbyAccountId,
          user_id: lobbyAccount.user_id,
          account_type: 'subsidized',
        },
      });
      stripeCustomerId = customer.id;

      await supabase
        .from('lobby_accounts')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', lobbyAccountId);
    }

    // Calculate valid until date
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + validMonths);

    // Create one-time payment checkout
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card', 'sepa_debit'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amountEur * 100, // Convert to cents
            product_data: {
              name: `RAWLZ Lobby Förder-Zugang (${validMonths} Monate)`,
              description: `Geförderter Zugang bis ${validUntil.toLocaleDateString('de-DE')}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CANCEL_URL,
      metadata: {
        lobby_account_id: lobbyAccountId,
        user_id: lobbyAccount.user_id,
        account_type: 'subsidized',
        valid_until: validUntil.toISOString(),
      },
      payment_intent_data: {
        metadata: {
          lobby_account_id: lobbyAccountId,
          account_type: 'subsidized',
          valid_until: validUntil.toISOString(),
        },
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        validUntil: validUntil.toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Subsidized checkout error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Checkout creation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
