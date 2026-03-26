// EF-09: /functions/v1/revenuecat-webhook
// Handles RevenueCat webhooks for Supporter purchases and refunds
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const REVENUECAT_WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') || '';

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id: string;
    product_id: string;
    purchased_at_ms: number;
  };
  api_version: string;
}

Deno.serve(async (req: Request) => {
  // Verify webhook signature (optional but recommended)
  const authHeader = req.headers.get('Authorization');
  if (REVENUECAT_WEBHOOK_SECRET && authHeader !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
    console.error('Invalid webhook signature');
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body: RevenueCatEvent = await req.json();
    const { event } = body;

    console.log('RevenueCat webhook received:', event.type, event.app_user_id);

    const userId = event.app_user_id;

    switch (event.type) {
      case 'NON_RENEWING_PURCHASE':
      case 'INITIAL_PURCHASE': {
        if (event.product_id === 'rawlz_supporter_onetime') {
          // Check if trust bonus already granted (idempotent)
          const { data: historyCheck } = await supabase
            .from('trust_score_history')
            .select('id')
            .eq('user_id', userId)
            .eq('reason', 'supporter_purchase')
            .maybeSingle();

          const trustBonus = historyCheck ? 0 : 10;

          // Update user to supporter
          const { error: userError } = await supabase
            .from('users')
            .update({
              membership_type: 'supporter',
              is_verified: true,
              supporter_since: new Date().toISOString(),
              trust_score: supabase.rpc('increment_trust_score', { 
                user_id: userId, 
                amount: trustBonus 
              }),
            })
            .eq('id', userId);

          if (userError) {
            // Fallback: direct update
            await supabase.rpc('grant_supporter_status', { p_user_id: userId });
          }

          // Record trust bonus if not already granted
          if (!historyCheck) {
            await supabase.from('trust_score_history').insert({
              user_id: userId,
              change_amount: 10,
              reason: 'supporter_purchase',
              new_score: 110, // Will be calculated by trigger
            });
          }

          // Update pending questions threshold
          await supabase
            .from('questions')
            .update({ relevance_threshold: 30 })
            .eq('submitted_by', userId)
            .eq('status', 'pending');

          // Grant supporter badge
          await supabase.from('badges').upsert(
            { user_id: userId, badge_type: 'supporter' },
            { onConflict: 'user_id,badge_type' }
          );

          console.log('Supporter status granted to:', userId);
        }
        break;
      }

      case 'REFUND':
      case 'CANCELLATION': {
        if (event.product_id === 'rawlz_supporter_onetime') {
          // Downgrade to basis
          await supabase
            .from('users')
            .update({
              membership_type: 'basis',
              is_verified: false,
            })
            .eq('id', userId);

          // Remove supporter badge
          await supabase
            .from('badges')
            .delete()
            .eq('user_id', userId)
            .eq('badge_type', 'supporter');

          // Log trust score change
          await supabase.from('trust_score_history').insert({
            user_id: userId,
            change_amount: -10,
            reason: 'supporter_refund',
          });

          console.log('Supporter status revoked from:', userId);
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
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
