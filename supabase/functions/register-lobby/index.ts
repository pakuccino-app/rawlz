// EF-16: /functions/v1/register-lobby
// Handles Lobby account registration (both commercial and subsidized)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface CommercialRegistration {
  accountType: 'commercial';
  companyName: string;
  companyType: string;
  tradeRegisterNo: string;
  companyWebsite: string;
  contactName: string;
  contactEmail: string;
}

interface SubsidizedRegistration {
  accountType: 'subsidized';
  subsidyOrgType: string;
  tradeRegisterNo: string;
  companyWebsite: string;
  contactName: string;
  contactEmail: string;
  subsidyProofUrl?: string;
  subsidyReason: string;
  suggestedAmount?: number;
}

type RegistrationRequest = CommercialRegistration | SubsidizedRegistration;

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

  const body: RegistrationRequest = await req.json();

  try {
    // Check if user already has a lobby account
    const { data: existing } = await supabase
      .from('lobby_accounts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'User already has a lobby account' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.accountType === 'commercial') {
      // Commercial registration
      const { data: lobbyAccount, error } = await supabase
        .from('lobby_accounts')
        .insert({
          user_id: user.id,
          account_type: 'commercial',
          company_name: body.companyName,
          company_type: body.companyType,
          trade_register_no: body.tradeRegisterNo,
          company_website: body.companyWebsite,
          contact_name: body.contactName,
          contact_email: body.contactEmail,
          kyc_status: 'pending',
          subscription_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          lobbyAccountId: lobbyAccount.id,
          accountType: 'commercial',
          nextStep: 'checkout', // User should now proceed to checkout
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      // Subsidized registration
      const { data: lobbyAccount, error } = await supabase
        .from('lobby_accounts')
        .insert({
          user_id: user.id,
          account_type: 'subsidized',
          subsidy_org_type: body.subsidyOrgType,
          trade_register_no: body.tradeRegisterNo,
          company_website: body.companyWebsite,
          contact_name: body.contactName,
          contact_email: body.contactEmail,
          subsidy_proof_url: body.subsidyProofUrl,
          subsidy_reason: body.subsidyReason,
          subsidy_suggested_amount: body.suggestedAmount,
          kyc_status: 'pending',
          subscription_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Add to moderation queue (INV-28: no immediate access)
      await supabase.from('moderation_queue').insert({
        entity_type: 'lobby_account',
        entity_id: lobbyAccount.id,
        reason: 'subsidized_lobby_application',
        priority: 2,
        status: 'pending',
      });

      return new Response(
        JSON.stringify({
          success: true,
          lobbyAccountId: lobbyAccount.id,
          accountType: 'subsidized',
          nextStep: 'pending_review', // Application submitted, awaiting review
          message: 'Antrag eingereicht. Prüfung innerhalb von 5 Werktagen.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('Registration error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Registration failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
