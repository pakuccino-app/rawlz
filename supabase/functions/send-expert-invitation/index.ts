// EF-18: /functions/v1/send-expert-invitation
// Sends magic link invitation to nominated experts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface InvitationRequest {
  nominationId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Verify admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role')
    .eq('session_token', token)
    .single();

  if (!admin) {
    return new Response(JSON.stringify({ error: 'Invalid admin session' }), { status: 401 });
  }

  const body: InvitationRequest = await req.json();

  try {
    const { data: nomination, error: nomError } = await supabase
      .from('expert_nominations')
      .select('*')
      .eq('id', body.nominationId)
      .single();

    if (nomError || !nomination) {
      return new Response(JSON.stringify({ error: 'Nomination not found' }), { status: 404 });
    }

    if (nomination.nomination_count < 25) {
      return new Response(
        JSON.stringify({ error: 'Minimum 25 nominations required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (nomination.status === 'invited') {
      return new Response(
        JSON.stringify({ error: 'Already invited' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: nomination.email,
      options: {
        redirectTo: 'rawlz://expert-onboarding',
      },
    });

    if (linkError) throw linkError;

    // Update nomination status
    await supabase
      .from('expert_nominations')
      .update({
        status: 'invited',
        invited_at: new Date().toISOString(),
        invited_by: admin.id,
      })
      .eq('id', body.nominationId);

    // Log action
    await supabase.from('admin_audit_log').insert({
      admin_id: admin.id,
      action: 'send_expert_invitation',
      entity_type: 'expert_nomination',
      entity_id: body.nominationId,
      details: { email: nomination.email },
    });

    return new Response(
      JSON.stringify({ success: true, email: nomination.email }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Invitation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
