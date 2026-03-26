// EF-12: /functions/v1/stripe-webhook
// Handles all Stripe webhook events for Lobby subscriptions
// Events: checkout.session.completed, invoice.payment_succeeded,
//         invoice.payment_failed, customer.subscription.deleted,
//         charge.refunded, charge.dispute.created, charge.dispute.closed
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event: Stripe.Event;

  try {
    if (STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(body, signature!, STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(body);
    }
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log('Stripe webhook received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { lobby_account_id, user_id, account_type } = session.metadata || {};

        if (!lobby_account_id) break;

        // Sofortiger Zugang (INV-26) - no KYC gate for commercial
        if (account_type === 'commercial') {
          await supabase
            .from('lobby_accounts')
            .update({
              subscription_status: 'active',
              stripe_subscription_id: session.subscription as string,
              kyc_status: 'approved', // Auto-approve commercial after payment
            })
            .eq('id', lobby_account_id);

          // Update user membership
          await supabase
            .from('users')
            .update({
              membership_type: 'lobby',
              is_verified: true,
            })
            .eq('id', user_id);

          // Grant lobby badge
          await supabase.from('badges').upsert(
            { user_id, badge_type: 'lobby' },
            { onConflict: 'user_id,badge_type' }
          );

          console.log('Commercial lobby activated:', lobby_account_id);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (!subscriptionId) break;

        // Find lobby account by subscription
        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id, user_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (lobbyAccount) {
          await supabase
            .from('lobby_accounts')
            .update({ subscription_status: 'active' })
            .eq('id', lobbyAccount.id);

          console.log('Invoice paid, subscription active:', lobbyAccount.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (!subscriptionId) break;

        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (lobbyAccount) {
          await supabase
            .from('lobby_accounts')
            .update({ subscription_status: 'past_due' })
            .eq('id', lobbyAccount.id);

          console.log('Payment failed, status past_due:', lobbyAccount.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id, user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (lobbyAccount) {
          // Downgrade to basis
          await supabase
            .from('lobby_accounts')
            .update({ subscription_status: 'cancelled' })
            .eq('id', lobbyAccount.id);

          await supabase
            .from('users')
            .update({ membership_type: 'basis' })
            .eq('id', lobbyAccount.user_id);

          console.log('Subscription cancelled, downgraded to basis:', lobbyAccount.id);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const customerId = charge.customer as string;

        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id, user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (lobbyAccount) {
          // Downgrade and mark KYC as rejected
          await supabase
            .from('lobby_accounts')
            .update({
              subscription_status: 'cancelled',
              kyc_status: 'rejected',
            })
            .eq('id', lobbyAccount.id);

          await supabase
            .from('users')
            .update({ membership_type: 'basis' })
            .eq('id', lobbyAccount.user_id);

          console.log('Charge refunded, account downgraded:', lobbyAccount.id);
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = dispute.charge as string;
        const charge = await stripe.charges.retrieve(chargeId);
        const customerId = charge.customer as string;

        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id, user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (lobbyAccount) {
          // Ban user and add to moderation queue
          await supabase
            .from('users')
            .update({ is_banned: true })
            .eq('id', lobbyAccount.user_id);

          await supabase.from('moderation_queue').insert({
            entity_type: 'lobby_account',
            entity_id: lobbyAccount.id,
            reason: 'stripe_dispute_created',
            priority: 1,
            status: 'pending',
          });

          console.log('Dispute created, user banned:', lobbyAccount.id);
        }
        break;
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = dispute.charge as string;
        const charge = await stripe.charges.retrieve(chargeId);
        const customerId = charge.customer as string;

        const { data: lobbyAccount } = await supabase
          .from('lobby_accounts')
          .select('id, user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (lobbyAccount) {
          if (dispute.status === 'won') {
            // Merchant won dispute, reinstate user
            await supabase
              .from('users')
              .update({
                membership_type: 'lobby',
                is_banned: false,
              })
              .eq('id', lobbyAccount.user_id);

            console.log('Dispute won, user reinstated:', lobbyAccount.id);
          } else {
            // Lost dispute, keep banned and downgrade
            await supabase
              .from('lobby_accounts')
              .update({ subscription_status: 'cancelled' })
              .eq('id', lobbyAccount.id);

            await supabase
              .from('users')
              .update({ membership_type: 'basis' })
              .eq('id', lobbyAccount.user_id);

            console.log('Dispute lost, user remains banned:', lobbyAccount.id);
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
