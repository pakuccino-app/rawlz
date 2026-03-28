// EF-17: /functions/v1/tag-question
// Uses GPT-4o-mini to generate 3-6 tags for a question
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const EMERGENT_LLM_KEY = Deno.env.get('EMERGENT_LLM_KEY') || 'sk-emergent-6F05870F3094c276fA';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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

  try {
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('word, language_code')
      .eq('id', questionId)
      .single();

    if (qError || !question) {
      return new Response(
        JSON.stringify({ error: 'Question not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = question.language_code === 'de'
      ? `Du bist ein Tag-Generator. Generiere 3-6 relevante Tags für das Thema. Antworte NUR mit einem JSON-Array von Strings, keine Erklärungen. Beispiel: ["Politik", "Wirtschaft", "Deutschland"]`
      : `You are a tag generator. Generate 3-6 relevant tags for the topic. Reply ONLY with a JSON array of strings, no explanations. Example: ["Politics", "Economy", "Germany"]`;

    const userPrompt = `Thema: ${question.word}`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMERGENT_LLM_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 100,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    
    let tags: string[];
    try {
      tags = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      tags = [];
    }

    await supabase
      .from('questions')
      .update({ ai_tags: tags })
      .eq('id', questionId);

    return new Response(
      JSON.stringify({ success: true, tags }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Tag error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
