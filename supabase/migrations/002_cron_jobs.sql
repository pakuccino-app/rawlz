-- ══════════════════════════════════════════════════════════════════
-- RAWLZ CRON JOBS - All 8 pg_cron Jobs
-- Run this AFTER the initial schema is applied
-- Requires pg_cron extension enabled in Supabase Dashboard
-- ══════════════════════════════════════════════════════════════════

-- CRON 1: vote_timeseries hourly aggregation (5 min after each hour)
SELECT cron.schedule('rawlz-timeseries-hourly','5 * * * *', $$
  INSERT INTO public.vote_timeseries
    (question_id,bucket,yes_count,no_count,skip_count,total_count,verified_yes_count)
  SELECT question_id,
    date_trunc('hour', NOW() - INTERVAL '1 hour'),
    COUNT(*) FILTER (WHERE vote_value='yes'),
    COUNT(*) FILTER (WHERE vote_value='no'),
    COUNT(*) FILTER (WHERE vote_value='skip'),
    COUNT(*),
    COUNT(*) FILTER (WHERE vote_value='yes' AND is_verified=TRUE)
  FROM public.votes
  WHERE voted_at >= date_trunc('hour', NOW() - INTERVAL '1 hour')
    AND voted_at <  date_trunc('hour', NOW())
  GROUP BY question_id
  ON CONFLICT (question_id, bucket) DO UPDATE SET
    yes_count=EXCLUDED.yes_count, no_count=EXCLUDED.no_count,
    skip_count=EXCLUDED.skip_count, total_count=EXCLUDED.total_count,
    verified_yes_count=EXCLUDED.verified_yes_count;
$$);

-- CRON 2: Trust Score +0.2 per active voting day (23:55 daily)
SELECT cron.schedule('rawlz-trust-score-daily','55 23 * * *', $$
  WITH active_today AS (
    SELECT DISTINCT user_id FROM public.votes
    WHERE voted_at::date = CURRENT_DATE AND vote_value IN ('yes','no')
  ),
  already_updated AS (
    SELECT user_id FROM public.trust_score_history
    WHERE created_at::date = CURRENT_DATE AND reason = 'daily_activity'
  ),
  to_update AS (
    SELECT a.user_id, u.trust_score
    FROM active_today a
    JOIN public.users u ON u.id = a.user_id
    LEFT JOIN already_updated au ON au.user_id = a.user_id
    WHERE au.user_id IS NULL AND u.is_banned = FALSE
      AND u.membership_type IN ('supporter','expert','lobby')
  )
  UPDATE public.users u
    SET trust_score       = LEAST(100, u.trust_score + 0.2),
        active_days_count = u.active_days_count + 1,
        last_active_date  = CURRENT_DATE
  FROM to_update t WHERE u.id = t.user_id;

  INSERT INTO public.trust_score_history (user_id, delta, reason, score_after)
  SELECT u.id, 0.2, 'daily_activity', LEAST(100, u.trust_score)
  FROM public.users u
  JOIN (SELECT DISTINCT user_id FROM public.votes
        WHERE voted_at::date=CURRENT_DATE AND vote_value IN ('yes','no')) av
    ON av.user_id = u.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trust_score_history
    WHERE user_id=u.id AND reason='daily_activity' AND created_at::date=CURRENT_DATE
  ) AND u.is_banned=FALSE AND u.membership_type IN ('supporter','expert','lobby');

  UPDATE public.users u
    SET streak_count = CASE
      WHEN u.last_active_date = CURRENT_DATE - INTERVAL '1 day' THEN u.streak_count + 1
      ELSE 1 END
  WHERE u.id IN (
    SELECT DISTINCT user_id FROM public.votes WHERE voted_at::date=CURRENT_DATE
  );
$$);

-- CRON 3: Expert auto-demotion (02:00 daily) - INV-07
SELECT cron.schedule('rawlz-expert-demotion','0 2 * * *', $$
  CREATE TEMP TABLE experts_being_demoted AS
  SELECT u.id, u.trust_score, u.is_verified,
    COALESCE(vc.active_vouches,0) AS active_vouches
  FROM public.users u
  LEFT JOIN (
    SELECT vouched_user AS user_id, COUNT(*) AS active_vouches
    FROM public.expert_vouches WHERE status='active' GROUP BY vouched_user
  ) vc ON vc.user_id = u.id
  WHERE u.membership_type = 'expert'
    AND (u.trust_score < 80 OR COALESCE(vc.active_vouches,0) < 2);

  UPDATE public.users
    SET membership_type = CASE WHEN is_verified THEN 'supporter' ELSE 'basis' END
  WHERE id IN (SELECT id FROM experts_being_demoted);

  INSERT INTO public.admin_audit_log (admin_id,action,entity_type,entity_id,details)
  SELECT 'system','expert_auto_demoted','user', ebd.id,
    jsonb_build_object(
      'trust_score', ebd.trust_score,
      'active_vouches', ebd.active_vouches,
      'new_type', CASE WHEN ebd.is_verified THEN 'supporter' ELSE 'basis' END
    )
  FROM experts_being_demoted ebd
  WHERE NOT EXISTS (
    SELECT 1 FROM public.admin_audit_log
    WHERE entity_id = ebd.id
      AND action = 'expert_auto_demoted'
      AND created_at::date = CURRENT_DATE
  );

  DROP TABLE experts_being_demoted;
$$);

-- CRON 4: Daily Pulse setter (06:45 UTC = 08:45 CET)
SELECT cron.schedule('rawlz-daily-pulse','45 6 * * *', $$
  UPDATE public.questions
    SET is_daily_pulse = FALSE
    WHERE is_daily_pulse = TRUE AND daily_pulse_date < CURRENT_DATE;

  WITH candidate AS (
    SELECT q.id FROM public.questions q
    WHERE q.status='active' AND q.geo_scope='global'
      AND (q.daily_pulse_date IS NULL OR q.daily_pulse_date < CURRENT_DATE - INTERVAL '30 days')
    ORDER BY (
      SELECT COUNT(*) FROM public.votes v
      WHERE v.question_id=q.id AND v.voted_at >= NOW() - INTERVAL '7 days'
    ) DESC
    LIMIT 1
  )
  UPDATE public.questions q
    SET is_daily_pulse=TRUE, daily_pulse_date=CURRENT_DATE
  FROM candidate c WHERE q.id=c.id;
$$);

-- CRON 5: AI context cache cleanup (03:00 daily)
SELECT cron.schedule('rawlz-ai-cache-cleanup','0 3 * * *', $$
  UPDATE public.questions
    SET ai_context_cache=NULL, cache_updated_at=NULL
    WHERE cache_updated_at < NOW() - INTERVAL '7 days';
$$);

-- CRON 6: Admin session cleanup (04:00 daily)
SELECT cron.schedule('rawlz-admin-session-cleanup','0 4 * * *', $$
  DELETE FROM public.admin_sessions
  WHERE expires_at < NOW() OR last_used_at < NOW() - INTERVAL '2 hours';
$$);

-- CRON 7: Daily Pulse push notification (07:00 UTC)
SELECT cron.schedule('rawlz-daily-pulse-push','0 7 * * *', $$
  WITH pulse AS (
    SELECT id, word FROM public.questions
    WHERE is_daily_pulse = TRUE AND daily_pulse_date = CURRENT_DATE
    LIMIT 1
  )
  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  SELECT 'system', 'daily_pulse_push_triggered', 'question', p.id,
    jsonb_build_object('word', p.word, 'date', CURRENT_DATE)
  FROM pulse p;
$$);

-- CRON 8: Subsidized lobby renewal reminder (09:00 daily)
SELECT cron.schedule('rawlz-subsidy-renewal-reminder','0 9 * * *', $$
  WITH expiring_soon AS (
    SELECT la.user_id, la.company_name, la.contact_email, la.subsidy_valid_until
    FROM public.lobby_accounts la
    WHERE la.account_type = 'subsidized'
      AND la.subscription_status = 'subsidized_active'
      AND la.subsidy_valid_until = CURRENT_DATE + INTERVAL '30 days'
  )
  INSERT INTO public.moderation_queue (entity_type, entity_id, reason, priority)
  SELECT 'user', es.user_id, 'subsidized_lobby_renewal_due_30_days', 2
  FROM expiring_soon es
  WHERE NOT EXISTS (
    SELECT 1 FROM public.moderation_queue mq
    WHERE mq.entity_id = es.user_id
      AND mq.reason = 'subsidized_lobby_renewal_due_30_days'
      AND mq.resolved = FALSE
  );

  INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
  SELECT 'system', 'subsidy_renewal_reminder', 'user', es.user_id,
    jsonb_build_object('company', es.company_name,
                       'valid_until', es.subsidy_valid_until,
                       'email', es.contact_email)
  FROM expiring_soon es;
$$);
