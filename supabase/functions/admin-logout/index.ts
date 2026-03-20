// EF-12: /functions/v1/admin-logout
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

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

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get session for logging
  const { data: sess } = await supabase
    .from('admin_sessions')
    .select('admin_id')
    .eq('session_token', token)
    .single();

  // Delete session
  await supabase.from('admin_sessions').delete().eq('session_token', token);

  // Log logout
  if (sess?.admin_id) {
    await supabase.from('admin_audit_log').insert({
      admin_id: sess.admin_id,
      action: 'logout',
    });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
