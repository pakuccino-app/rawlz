// EF-25: /functions/v1/lobby-analytics
// B2B Lobby Analytics API – alle Module mit K-Anonymität (>= 20)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const K = 20;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function groupCount<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function applyK(counts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (v >= K) out[k] = v;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors() });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Ungültiges Token' }, 401);

  const { data: userData } = await supabase
    .from('users')
    .select('membership_type')
    .eq('id', user.id)
    .single();
  if (userData?.membership_type !== 'lobby') return json({ error: 'Lobby-Mitgliedschaft erforderlich' }, 403);

  const { data: lobbyAccount } = await supabase
    .from('lobby_accounts')
    .select('id, subscription_status, account_type, stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  if (!lobbyAccount || !['active', 'trialing'].includes(lobbyAccount.subscription_status)) {
    return json({ error: 'Aktives Lobby-Abo erforderlich' }, 403);
  }

  const body = await req.json();
  const { module, questionIds, dateRange, page = 0, limit = 50, exportModule } = body;
  const dateStart = dateRange?.start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dateEnd = dateRange?.end ?? new Date().toISOString();

  try {
    switch (module) {

      // ─── Account Status ───────────────────────────────────────────────
      case 'status': {
        return json({
          subscriptionStatus: lobbyAccount.subscription_status,
          accountType: lobbyAccount.account_type,
          hasStripe: !!lobbyAccount.stripe_customer_id,
        });
      }

      // ─── Gold-Daten ───────────────────────────────────────────────────
      case 'gold_data': {
        let qQuery = supabase
          .from('questions')
          .select('id, word, yes_count, no_count, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1);

        if (questionIds?.length) qQuery = qQuery.in('id', questionIds);
        const { data: questions, error: qErr } = await qQuery;
        if (qErr) throw qErr;

        const qIds = (questions ?? []).map((q: any) => q.id);
        const verifiedMap: Record<string, { yes: number; total: number }> = {};

        if (qIds.length > 0) {
          const { data: vv } = await supabase
            .from('votes')
            .select('question_id, vote_value')
            .in('question_id', qIds)
            .eq('is_verified', true)
            .in('vote_value', ['yes', 'no']);

          for (const v of (vv ?? [])) {
            if (!verifiedMap[v.question_id]) verifiedMap[v.question_id] = { yes: 0, total: 0 };
            verifiedMap[v.question_id].total++;
            if (v.vote_value === 'yes') verifiedMap[v.question_id].yes++;
          }
        }

        const data = (questions ?? []).map((q: any) => {
          const vd = verifiedMap[q.id];
          const result: any = {
            id: q.id,
            word: q.word,
            totalVotes: q.total_votes,
            yesPct: q.total_votes > 0 ? Math.round((q.yes_count * 100) / q.total_votes) : 0,
            noPct: q.total_votes > 0 ? Math.round((q.no_count * 100) / q.total_votes) : 0,
          };
          if (vd && vd.total >= K) {
            result.verifiedYesPct = Math.round((vd.yes * 100) / vd.total);
            result.verifiedNoPct = 100 - result.verifiedYesPct;
            result.verifiedTotal = vd.total;
          }
          return result;
        });

        return json({ data });
      }

      // ─── Apathie-Index ────────────────────────────────────────────────
      case 'apathy': {
        const { data: questions } = await supabase
          .from('questions')
          .select('id, word, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false })
          .limit(limit);

        const qIds = (questions ?? []).map((q: any) => q.id);
        if (!qIds.length) return json({ data: [] });

        const { data: swipeEvents } = await supabase
          .from('swipe_events')
          .select('question_id, action')
          .in('question_id', qIds)
          .in('action', ['skip', 'abstain', 'vote']);

        const swipeMap: Record<string, { votes: number; skips: number }> = {};
        for (const e of (swipeEvents ?? [])) {
          if (!swipeMap[e.question_id]) swipeMap[e.question_id] = { votes: 0, skips: 0 };
          if (e.action === 'vote') swipeMap[e.question_id].votes++;
          else swipeMap[e.question_id].skips++;
        }

        const data = (questions ?? [])
          .map((q: any) => {
            const s = swipeMap[q.id] ?? { votes: 0, skips: 0 };
            const total = s.votes + s.skips;
            if (total < K) return null;
            return {
              id: q.id,
              word: q.word,
              totalEncounters: total,
              voteRate: Math.round((s.votes * 100) / total),
              skipRate: Math.round((s.skips * 100) / total),
              apathyIndex: Math.round((s.skips * 100) / total),
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.apathyIndex - a.apathyIndex);

        return json({ data });
      }

      // ─── Mind-Shift ───────────────────────────────────────────────────
      case 'mind_shift': {
        const { data: questions } = await supabase
          .from('questions')
          .select('id, word, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false })
          .limit(limit);

        const qIds = (questions ?? []).map((q: any) => q.id);
        if (!qIds.length) return json({ data: [] });

        const { data: changes } = await supabase
          .from('vote_changes')
          .select('question_id, old_value, new_value')
          .in('question_id', qIds)
          .gte('changed_at', dateStart)
          .lte('changed_at', dateEnd);

        const changeMap: Record<string, { ytn: number; nty: number; total: number }> = {};
        for (const c of (changes ?? [])) {
          if (!changeMap[c.question_id]) changeMap[c.question_id] = { ytn: 0, nty: 0, total: 0 };
          changeMap[c.question_id].total++;
          if (c.old_value === 'yes' && c.new_value === 'no') changeMap[c.question_id].ytn++;
          if (c.old_value === 'no' && c.new_value === 'yes') changeMap[c.question_id].nty++;
        }

        const data = (questions ?? [])
          .map((q: any) => {
            const c = changeMap[q.id];
            if (!c || c.total < K) return null;
            return {
              id: q.id,
              word: q.word,
              totalChanges: c.total,
              yesToNo: c.ytn,
              noToYes: c.nty,
              changeRatePct: q.total_votes > 0 ? Math.round((c.total * 100) / q.total_votes) : 0,
              trend: c.ytn > c.nty ? 'richtung_nein' : c.nty > c.ytn ? 'richtung_ja' : 'ausgeglichen',
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.totalChanges - a.totalChanges);

        return json({ data });
      }

      // ─── Divergenz ────────────────────────────────────────────────────
      case 'divergenz': {
        const { data: questions } = await supabase
          .from('questions')
          .select('id, word, yes_count, no_count, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false })
          .limit(100);

        const data = (questions ?? []).map((q: any) => {
          const yesPct = q.total_votes > 0 ? (q.yes_count / q.total_votes) * 100 : 50;
          const score = 1 - Math.abs(yesPct - 50) / 50;
          return {
            id: q.id,
            word: q.word,
            totalVotes: q.total_votes,
            yesPct: Math.round(yesPct),
            noPct: 100 - Math.round(yesPct),
            divergenzScore: Math.round(score * 100),
            label: score > 0.8 ? 'hoch' : score > 0.5 ? 'mittel' : 'niedrig',
          };
        }).sort((a: any, b: any) => b.divergenzScore - a.divergenzScore);

        return json({ data });
      }

      // ─── Volldemografik ───────────────────────────────────────────────
      case 'volldemografik': {
        const qId = questionIds?.[0];
        if (!qId) return json({ error: 'questionId erforderlich' }, 400);

        const { data: question } = await supabase
          .from('questions')
          .select('id, word, total_votes')
          .eq('id', qId)
          .single();

        if (!question || question.total_votes < K) {
          return json({ error: `Nicht genug Daten (< ${K} Stimmen)` }, 400);
        }

        const { data: votes } = await supabase
          .from('votes')
          .select('vote_value, users!inner(age_group, gender, education, political_lean, geo_city_size, geo_type)')
          .eq('question_id', qId)
          .in('vote_value', ['yes', 'no']);

        const fields = ['age_group', 'gender', 'education', 'political_lean', 'geo_city_size', 'geo_type'];
        const breakdown: Record<string, any[]> = {};

        for (const field of fields) {
          const groups: Record<string, { yes: number; total: number }> = {};
          for (const vote of (votes ?? [])) {
            const u = (vote as any).users;
            const val = u?.[field];
            if (!val) continue;
            if (!groups[val]) groups[val] = { yes: 0, total: 0 };
            groups[val].total++;
            if (vote.vote_value === 'yes') groups[val].yes++;
          }
          const filtered = Object.entries(groups)
            .filter(([, c]) => c.total >= K)
            .map(([value, c]) => ({
              value,
              yesPct: Math.round((c.yes * 100) / c.total),
              noPct: 100 - Math.round((c.yes * 100) / c.total),
              total: c.total,
            }));
          if (filtered.length) breakdown[field] = filtered;
        }

        return json({ question: { id: question.id, word: question.word, total: question.total_votes }, breakdown });
      }

      // ─── Feed-Modus ───────────────────────────────────────────────────
      case 'feed_mode': {
        const { data: events } = await supabase
          .from('swipe_events')
          .select('feed_mode')
          .not('feed_mode', 'is', null)
          .gte('swiped_at', dateStart)
          .lte('swiped_at', dateEnd);

        const counts = applyK(groupCount(events ?? [], (e: any) => e.feed_mode));
        const data = Object.entries(counts).map(([mode, count]) => ({
          mode,
          count,
          label: mode === 'standard' ? 'Standard-Feed' :
                 mode === 'random' ? 'Zufalls-Feed' :
                 mode === 'curated' ? 'Kuratiert' :
                 mode === 'trending' ? 'Trending' : mode,
        }));

        return json({ data });
      }

      // ─── Stadt / Land ─────────────────────────────────────────────────
      case 'city_rural': {
        let vQuery = supabase
          .from('votes')
          .select('vote_value, users!inner(geo_city_size, geo_type)')
          .in('vote_value', ['yes', 'no']);

        if (questionIds?.[0]) {
          vQuery = vQuery.eq('question_id', questionIds[0]);
        } else {
          vQuery = vQuery.gte('voted_at', dateStart).lte('voted_at', dateEnd);
        }

        const { data: votes } = await vQuery;
        const citySizeMap: Record<string, { yes: number; total: number }> = {};
        const geoTypeMap: Record<string, { yes: number; total: number }> = {};

        for (const vote of (votes ?? [])) {
          const u = (vote as any).users;
          if (u?.geo_city_size) {
            if (!citySizeMap[u.geo_city_size]) citySizeMap[u.geo_city_size] = { yes: 0, total: 0 };
            citySizeMap[u.geo_city_size].total++;
            if (vote.vote_value === 'yes') citySizeMap[u.geo_city_size].yes++;
          }
          if (u?.geo_type) {
            if (!geoTypeMap[u.geo_type]) geoTypeMap[u.geo_type] = { yes: 0, total: 0 };
            geoTypeMap[u.geo_type].total++;
            if (vote.vote_value === 'yes') geoTypeMap[u.geo_type].yes++;
          }
        }

        const citySize = Object.entries(citySizeMap)
          .filter(([, c]) => c.total >= K)
          .map(([value, c]) => ({ citySize: value, total: c.total, yesPct: Math.round((c.yes * 100) / c.total) }));

        const geoType = Object.entries(geoTypeMap)
          .filter(([, c]) => c.total >= K)
          .map(([value, c]) => ({ geoType: value, total: c.total, yesPct: Math.round((c.yes * 100) / c.total) }));

        return json({ citySize, geoType });
      }

      // ─── Heatmap ──────────────────────────────────────────────────────
      case 'heatmap': {
        const { data: votes } = await supabase
          .from('votes')
          .select('vote_value, users!inner(geo_city_size, geo_type)')
          .in('vote_value', ['yes', 'no'])
          .gte('voted_at', dateStart)
          .lte('voted_at', dateEnd);

        const heatMap: Record<string, { yes: number; total: number }> = {};
        for (const vote of (votes ?? [])) {
          const u = (vote as any).users;
          const key = `${u?.geo_city_size ?? 'unbekannt'}|${u?.geo_type ?? 'unbekannt'}`;
          if (!heatMap[key]) heatMap[key] = { yes: 0, total: 0 };
          heatMap[key].total++;
          if (vote.vote_value === 'yes') heatMap[key].yes++;
        }

        const data = Object.entries(heatMap)
          .filter(([, c]) => c.total >= K)
          .map(([key, c]) => {
            const [citySize, geoType] = key.split('|');
            return { citySize, geoType, total: c.total, yesPct: Math.round((c.yes * 100) / c.total) };
          });

        return json({ data });
      }

      // ─── Zeitreihen ───────────────────────────────────────────────────
      case 'timeseries': {
        let tsQuery = supabase
          .from('vote_timeseries')
          .select('question_id, snapshot_date, yes_count, no_count, total_count')
          .gte('snapshot_date', dateStart)
          .lte('snapshot_date', dateEnd)
          .order('snapshot_date', { ascending: true });

        if (questionIds?.length) {
          tsQuery = tsQuery.in('question_id', questionIds);
        } else {
          const { data: topQ } = await supabase
            .from('questions')
            .select('id')
            .eq('status', 'active')
            .order('total_votes', { ascending: false })
            .limit(5);
          if (topQ?.length) tsQuery = tsQuery.in('question_id', topQ.map((q: any) => q.id));
        }

        const { data: ts } = await tsQuery;
        const grouped: Record<string, any[]> = {};
        for (const pt of (ts ?? [])) {
          if (!grouped[pt.question_id]) grouped[pt.question_id] = [];
          grouped[pt.question_id].push({
            date: pt.snapshot_date,
            yesPct: pt.total_count > 0 ? Math.round((pt.yes_count * 100) / pt.total_count) : 0,
            total: pt.total_count,
          });
        }

        const qIds = Object.keys(grouped);
        const { data: qs } = await supabase.from('questions').select('id, word').in('id', qIds);
        const wordMap: Record<string, string> = {};
        (qs ?? []).forEach((q: any) => { wordMap[q.id] = q.word; });

        const data = Object.entries(grouped).map(([qId, pts]) => ({
          questionId: qId,
          word: wordMap[qId] ?? qId,
          dataPoints: pts,
        }));

        return json({ data });
      }

      // ─── Vergleich mit Verified-Overlay ───────────────────────────────
      case 'comparison': {
        const { data: questions } = await supabase
          .from('questions')
          .select('id, word, yes_count, no_count, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false })
          .limit(limit);

        const qIds = (questions ?? []).map((q: any) => q.id);
        const { data: verifiedVotes } = await supabase
          .from('votes')
          .select('question_id, vote_value, users!inner(trust_score)')
          .in('question_id', qIds)
          .in('vote_value', ['yes', 'no'])
          .gte('users.trust_score', 80);

        const verifiedMap: Record<string, { yes: number; total: number }> = {};
        for (const v of (verifiedVotes ?? [])) {
          if (!verifiedMap[v.question_id]) verifiedMap[v.question_id] = { yes: 0, total: 0 };
          verifiedMap[v.question_id].total++;
          if (v.vote_value === 'yes') verifiedMap[v.question_id].yes++;
        }

        const data = (questions ?? []).map((q: any) => {
          const vd = verifiedMap[q.id];
          const allYesPct = q.total_votes > 0 ? Math.round((q.yes_count * 100) / q.total_votes) : 0;
          const result: any = {
            id: q.id,
            word: q.word,
            allVoters: { total: q.total_votes, yesPct: allYesPct },
          };
          if (vd && vd.total >= K) {
            const verifiedYesPct = Math.round((vd.yes * 100) / vd.total);
            result.verifiedVoters = {
              total: vd.total,
              yesPct: verifiedYesPct,
              delta: verifiedYesPct - allYesPct,
            };
          }
          return result;
        });

        return json({ data });
      }

      // ─── Vorschlags-Analyse ───────────────────────────────────────────
      case 'suggestions': {
        const { data: suggestions } = await supabase
          .from('questions')
          .select('id, word, submission_count, status, language_code, created_at')
          .order('submission_count', { ascending: false })
          .range(page * limit, (page + 1) * limit - 1);

        const qIds = (suggestions ?? []).map((q: any) => q.id);
        const { data: notifs } = await supabase
          .from('question_notification_requests')
          .select('question_id')
          .in('question_id', qIds);

        const notifMap: Record<string, number> = {};
        (notifs ?? []).forEach((n: any) => { notifMap[n.question_id] = (notifMap[n.question_id] ?? 0) + 1; });

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
          .from('questions')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo);

        const statusBreakdown = groupCount(suggestions ?? [], (q: any) => q.status);

        return json({
          data: (suggestions ?? []).map((q: any) => ({
            id: q.id,
            word: q.word,
            submissionCount: q.submission_count,
            status: q.status,
            language: q.language_code,
            notificationSubscribers: notifMap[q.id] ?? 0,
          })),
          statusBreakdown,
          recentCount: recentCount ?? 0,
        });
      }

      // ─── CSV-Export ───────────────────────────────────────────────────
      case 'csv_export': {
        const { data: questions } = await supabase
          .from('questions')
          .select('id, word, yes_count, no_count, total_votes')
          .eq('status', 'active')
          .gte('total_votes', K)
          .order('total_votes', { ascending: false });

        let csv = 'Frage,Gesamt-Stimmen,Ja (%),Nein (%)\n';
        for (const q of (questions ?? [])) {
          const yesPct = q.total_votes > 0 ? Math.round((q.yes_count * 100) / q.total_votes) : 0;
          csv += `"${q.word}",${q.total_votes},${yesPct},${100 - yesPct}\n`;
        }

        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="rawlz_export_${new Date().toISOString().split('T')[0]}.csv"`,
            ...cors(),
          },
        });
      }

      default:
        return json({ error: 'Unbekanntes Modul: ' + module }, 400);
    }
  } catch (err: any) {
    console.error('[lobby-analytics]', err);
    return json({ error: err.message }, 500);
  }
});
