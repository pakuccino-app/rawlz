// EF-13: /functions/v1/admin-manage-user
// Handles: add moderator, reset password, deactivate
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

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify super_admin via admin-auth-check
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  const authCheck = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/admin-auth-check`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!authCheck.ok) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { role } = await authCheck.json();
  if (role !== 'super_admin') {
    return new Response(
      JSON.stringify({ error: 'Super admin only' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { action, email, displayName, targetAdminId, newPassword } = await req.json();

  switch (action) {
    case 'add_moderator': {
      // Generate temp password
      const tempPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 16) + '!A1';

      // Create Supabase Auth user
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (authErr || !authUser.user) {
        return new Response(
          JSON.stringify({ error: authErr?.message || 'Auth creation failed' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Create admin user record
      await supabase.from('admin_users').insert({
        supabase_auth_id: authUser.user.id,
        email,
        display_name: displayName,
        role: 'moderator',
      });

      // Send magic link for email confirmation
      await supabase.auth.admin.generateLink({ type: 'magiclink', email });

      // Log action
      await supabase.from('admin_audit_log').insert({
        admin_id: 'super_admin',
        action: 'moderator_created',
        details: { email, display_name: displayName },
      });

      return new Response(
        JSON.stringify({ success: true, tempPassword }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    case 'reset_password': {
      // Get target admin
      const { data: target } = await supabase
        .from('admin_users')
        .select('supabase_auth_id,email')
        .eq('id', targetAdminId)
        .single();

      if (!target) {
        return new Response(
          JSON.stringify({ error: 'Admin not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Generate new temp password
      const tempPw = crypto.randomUUID().replace(/-/g, '').slice(0, 16) + '!A1';

      // Update password
      await supabase.auth.admin.updateUserById(target.supabase_auth_id, {
        password: tempPw,
      });

      // Invalidate all sessions
      await supabase.from('admin_sessions').delete().eq('admin_id', targetAdminId);

      // Log action
      await supabase.from('admin_audit_log').insert({
        admin_id: 'super_admin',
        action: 'moderator_password_reset',
        details: { target_id: targetAdminId },
      });

      return new Response(
        JSON.stringify({ success: true, tempPassword: tempPw }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    case 'deactivate': {
      // Deactivate admin
      await supabase
        .from('admin_users')
        .update({ is_active: false })
        .eq('id', targetAdminId);

      // Delete all sessions
      await supabase.from('admin_sessions').delete().eq('admin_id', targetAdminId);

      // Log action
      await supabase.from('admin_audit_log').insert({
        admin_id: 'super_admin',
        action: 'moderator_deactivated',
        details: { target_id: targetAdminId },
      });

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    default:
      return new Response(
        JSON.stringify({ error: 'Unknown action' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
  }
});
