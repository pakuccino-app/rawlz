// EF-07: /functions/v1/tag-question
// AI-powered tagging using OpenAI gpt-4o-mini
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

  const { questionId } = await req.json();

  if (!questionId) {
    return new Response(
      JSON.stringify({ error: 'questionId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get question
  const { data: q } = await supabase
    .from('questions')
    .select('word,language_code')
    .eq('id', questionId)
    .single();

  if (!q) {
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Call OpenAI gpt-4o-mini for tagging
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 80,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `Return ONLY a JSON array of 3-6 lowercase topic tags in ${
            q.language_code === 'de' ? 'German' : 'English'
          }. No # symbols. Single words only. No other text.`,
        },
        {
          role: 'user',
          content: `Word: ${q.word}`,
        },
      ],
    }),
  });

  const ai = await res.json();
  let tags: string[] = [];

  try {
    tags = JSON.parse(ai.choices?.[0]?.message?.content?.trim() || '[]');
    tags = tags
      .map((t: any) =>
        String(t)
          .toLowerCase()
          .replace(/[^a-z0-9äöüß]/g, '')
      )
      .filter((t: string) => t.length > 0 && t.length <= 20)
      .slice(0, 6);
  } catch {
    tags = [];
  }

  // Update question with tags
  await supabase.from('questions').update({ ai_tags: tags }).eq('id', questionId);

  return new Response(
    JSON.stringify({ success: true, tags }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
