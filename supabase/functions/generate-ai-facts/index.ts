// EF-08: /functions/v1/generate-ai-facts
// Generates AI facts for a question using GPT-4o-mini
// Caches results in ai_context_cache for 7 days
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const EMERGENT_LLM_KEY = Deno.env.get('EMERGENT_LLM_KEY') || 'sk-emergent-6F05870F3094c276fA';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const CACHE_TTL_DAYS = 7;

interface AIFactsResponse {
  sentence: string;
  bullets: string[];
  generatedAt: string;
}

function getSystemPrompt(languageCode: string, word: string): string {
  // Punkt 5: PRO/CONTRA Keyword-Format für alle Sprachen
  const lang = languageCode === 'en' ? 'English' : 'German';
  return `Generate in ${lang}. Format EXACTLY as follows — no deviations:

${word}
[1 sentence definition, max 20 words]

PRO
• [keyword only]
• [keyword only]
• [keyword only]

CONTRA
• [keyword only]
• [keyword only]
• [keyword only]

Rules:
- Short keywords only in bullets. No full sentences.
- No opinions. Factual only.
- No political standpoint.
- Keep the exact hashtag word as the first line.

Reply ONLY with this exact format. No JSON. No markdown. No extra text.`;
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

  const { questionId } = await req.json();

  if (!questionId) {
    return new Response(
      JSON.stringify({ error: 'questionId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get question data
    const { data: question, error: qError } = await supabase
      .from('questions')
      .select('word, ai_context_cache, cache_updated_at, language_code')
      .eq('id', questionId)
      .single();

    if (qError || !question) {
      return new Response(
        JSON.stringify({ error: 'Question not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check cache validity (7 days)
    if (question.ai_context_cache && question.cache_updated_at) {
      const cacheAge = Date.now() - new Date(question.cache_updated_at).getTime();
      const cacheTTL = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
      
      if (cacheAge < cacheTTL) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            facts: question.ai_context_cache,
            fromCache: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate new facts using GPT-4o-mini
    const systemPrompt = getSystemPrompt(question.language_code || 'de', question.word);
    const userPrompt = question.language_code === 'de'
      ? `Generiere neutrale Fakten zum Thema: ${question.word}`
      : `Generate neutral facts about the topic: ${question.word}`;

    const openaiResponse = await fetch(OPENAI_API_URL, {
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
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    // Parse JSON response
    let facts: AIFactsResponse;
    try {
      // Remove potential markdown code blocks
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      facts = JSON.parse(cleanContent);
      facts.generatedAt = new Date().toISOString();
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      // Fallback: create structured response from raw text
      facts = {
        sentence: content.slice(0, 100),
        bullets: ['Information wird geladen...'],
        generatedAt: new Date().toISOString(),
      };
    }

    // Update cache in database
    await supabase
      .from('questions')
      .update({
        ai_context_cache: facts,
        cache_updated_at: new Date().toISOString(),
      })
      .eq('id', questionId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        facts,
        fromCache: false,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('AI facts error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate facts' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
