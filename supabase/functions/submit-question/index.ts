// EF-03: /functions/v1/submit-question
// Handles question submission with proper threshold calculation
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface SubmitRequest {
  word: string;
  languageCode: string;
  geoScope: 'global' | 'country' | 'region';
  geoCountry?: string;
  geoRegion?: string;
  notifyOnActivate?: boolean;
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

  const body: SubmitRequest = await req.json();
  const { word, languageCode, geoScope, geoCountry, geoRegion, notifyOnActivate } = body;

  // Validate word format (INV-01)
  const wordRegex = /^#[a-zA-Z0-9äöüÄÖÜß]{1,27}$/;
  if (!word || !wordRegex.test(word)) {
    return new Response(
      JSON.stringify({ error: 'Invalid word format' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get user data
  const { data: userData } = await supabase
    .from('users')
    .select('is_verified, membership_type')
    .eq('id', user.id)
    .single();

  const isVerified = userData?.is_verified || false;
  const isSupporter = ['supporter', 'expert', 'lobby'].includes(userData?.membership_type || '');
  
  // Calculate threshold (verified/supporter = 30, basis = 50)
  const threshold = (isVerified || isSupporter) ? 30 : 50;

  try {
    // Check if question already exists
    const { data: existing } = await supabase
      .from('questions')
      .select('*')
      .eq('word', word)
      .eq('language_code', languageCode)
      .maybeSingle();

    let question;

    if (existing) {
      if (existing.status === 'blocked') {
        return new Response(
          JSON.stringify({ error: 'Question is blocked' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (existing.status === 'active') {
        // Already live
        return new Response(
          JSON.stringify({ 
            success: true, 
            question: existing,
            alreadyActive: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Increment submission count for pending
      const newCount = existing.submission_count + 1;
      
      const { data: updated, error: updateError } = await supabase
        .from('questions')
        .update({ 
          submission_count: newCount,
          // Update threshold if lower
          relevance_threshold: Math.min(existing.relevance_threshold, threshold),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;
      question = updated;

      // Check if threshold reached (triggers activation via DB trigger)
      if (newCount >= question.relevance_threshold && existing.status === 'pending') {
        // Update status to active
        await supabase
          .from('questions')
          .update({ status: 'active' })
          .eq('id', existing.id);

        // Send activation notifications
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/activate-question-notify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ questionId: existing.id }),
        });

        question.status = 'active';
      }
    } else {
      // Create new question
      const { data: newQuestion, error: insertError } = await supabase
        .from('questions')
        .insert({
          word,
          language_code: languageCode,
          geo_scope: geoScope,
          geo_country: geoScope === 'country' ? geoCountry : null,
          geo_region: geoScope === 'region' ? geoRegion : null,
          status: 'pending',
          submission_count: 1,
          relevance_threshold: threshold,
          submitted_by: user.id,
          submitted_by_verified: isVerified,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      question = newQuestion;
    }

    // Handle notification subscription
    if (notifyOnActivate && question) {
      await supabase.from('question_notification_requests').upsert({
        user_id: user.id,
        question_id: question.id,
      }, { onConflict: 'user_id,question_id' });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        question,
        alreadyActive: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Submit error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Submission failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
