// EF-14: /functions/v1/activate-subsidized-lobby
// Admin function to activate subsidized lobby accounts (€0)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface ActivateRequest {
  lobbyAccountId: string;
  validUntil: string; // ISO date string
  approvedBy: string; // Admin user ID
  notes?: string;
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

  const body: ActivateRequest = await req.json();
  const { lobbyAccountId, validUntil, approvedBy, notes } = body;

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

    if (lobbyAccount.account_type !== 'subsidized') {
      return new Response(
        JSON.stringify({ error: 'This function is only for subsidized accounts' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Activate subsidized account (€0)
    await supabase
      .from('lobby_accounts')
      .update({
        subscription_status: 'active',
        kyc_status: 'approved',
        subsidy_valid_until: validUntil,
        subsidy_approved_by: approvedBy,
        subsidy_approved_at: new Date().toISOString(),
        subsidy_notes: notes,
      })
      .eq('id', lobbyAccountId);

    // Update user membership
    await supabase
      .from('users')
      .update({
        membership_type: 'lobby',
        is_verified: true,
      })
      .eq('id', lobbyAccount.user_id);

    // Grant lobby badge
    await supabase.from('badges').upsert(
      { user_id: lobbyAccount.user_id, badge_type: 'lobby_subsidized' },
      { onConflict: 'user_id,badge_type' }
    );

    // Update moderation queue
    await supabase
      .from('moderation_queue')
      .update({ status: 'approved' })
      .eq('entity_type', 'lobby_account')
      .eq('entity_id', lobbyAccountId);

    console.log('Subsidized lobby activated:', lobbyAccountId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Activation error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Activation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
