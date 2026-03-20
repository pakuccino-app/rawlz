-- ══════════════════════════════════════════════════════════════════
-- RAWLZ DATABASE SCHEMA v7.0
-- © Jörg Pakusch, Hamburg, Germany. All rights reserved.
-- Legal entity: RAWLZ e.V. (gemeinnützig, in Gründung)
-- ══════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ══════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════

-- ── USERS ──────────────────────────────────────────────────────
CREATE TABLE public.users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_hash        TEXT NOT NULL UNIQUE,
  email_hash         TEXT UNIQUE,
  membership_type    TEXT NOT NULL DEFAULT 'basis'
    CHECK (membership_type IN ('basis','supporter','expert','lobby')),
  is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  supporter_since    TIMESTAMPTZ,
  trust_score        NUMERIC(6,2) NOT NULL DEFAULT 50.0,
  active_days_count  INTEGER NOT NULL DEFAULT 0,
  last_active_date   DATE,
  streak_count       INTEGER NOT NULL DEFAULT 0,
  wirksamkeit_shown  BOOLEAN NOT NULL DEFAULT FALSE,
  language_code      TEXT NOT NULL DEFAULT 'de',
  geo_country        TEXT,
  geo_region         TEXT,
  geo_preference     TEXT NOT NULL DEFAULT 'global'
    CHECK (geo_preference IN ('global','country','region','mixed')),
  has_2fa            BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret        TEXT,
  is_banned          BOOLEAN NOT NULL DEFAULT FALSE,
  consent_given_at   TIMESTAMPTZ,
  push_token         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── USER PROFILES ────────────────────────────────────────────────
CREATE TABLE public.user_profiles (
  user_id             UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  age_group           TEXT CHECK (age_group IN ('under18','18-24','25-34','35-44','45-54','55-64','65+')),
  geo_city_size       TEXT CHECK (geo_city_size IN ('village','small_city','medium_city','large_city','metro')),
  geo_type            TEXT CHECK (geo_type IN ('urban','suburban','rural')),
  gender              TEXT CHECK (gender IN ('m','f','d','prefer_not')),
  education_level     TEXT CHECK (education_level IN ('no_degree','school','vocational','bachelor','master','phd','prefer_not')),
  political_lean      SMALLINT CHECK (political_lean BETWEEN 1 AND 5),
  political_interest  TEXT CHECK (political_interest IN ('high','medium','low','none')),
  employment_status   TEXT CHECK (employment_status IN ('employed','self_employed','student','unemployed','retired','homemaker','prefer_not')),
  employment_sector   TEXT CHECK (employment_sector IN ('public','private','self_employed','student','not_employed','prefer_not')),
  income_bracket      TEXT CHECK (income_bracket IN ('under1500','1500-2500','2500-4000','4000-6000','over6000','prefer_not')),
  voted_last_election BOOLEAN,
  is_org_member       TEXT CHECK (is_org_member IN ('party','union','ngo','none','prefer_not')),
  media_primary       TEXT CHECK (media_primary IN ('public_broadcast','print','online_news','social_media','podcasts','none','prefer_not')),
  smartphone_daily_h  TEXT CHECK (smartphone_daily_h IN ('under1','1to3','3to6','over6','prefer_not')),
  uses_ai_tools       TEXT CHECK (uses_ai_tools IN ('daily','sometimes','never','prefer_not')),
  housing_status      TEXT CHECK (housing_status IN ('renting','owning','with_parents','other','prefer_not')),
  household_size      TEXT CHECK (household_size IN ('1','2','3to4','5plus','prefer_not')),
  has_children        BOOLEAN,
  expert_field        TEXT CHECK (expert_field IN ('science','medicine','law','technology','economics','education','politics','arts','other','prefer_not')),
  expert_role         TEXT CHECK (expert_role IN ('research','teaching','freelance','industry','public_sector','ngo','prefer_not')),
  academic_degree     TEXT CHECK (academic_degree IN ('none','bachelor','master','phd','professor','prefer_not')),
  org_type            TEXT CHECK (org_type IN ('company_private','company_listed','ngo','political_party','research_institute','media','public_authority','consultancy','other')),
  org_sector          TEXT,
  org_size            TEXT CHECK (org_size IN ('1to10','11to50','51to500','500plus')),
  org_geo_focus       TEXT CHECK (org_geo_focus IN ('local','national','european','global')),
  org_use_case        TEXT CHECK (org_use_case IN ('market_research','policy_consulting','journalism','academic_research','strategy','other')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ADMIN USERS ────────────────────────────────────────────────
CREATE TABLE public.admin_users (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_auth_id UUID NOT NULL UNIQUE,
  email            TEXT NOT NULL UNIQUE,
  display_name     TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'moderator'
    CHECK (role IN ('super_admin','moderator')),
  totp_secret      TEXT,
  totp_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  totp_setup_at    TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  created_by       UUID REFERENCES public.admin_users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── QUESTIONS ──────────────────────────────────────────────────
CREATE TABLE public.questions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  word                  TEXT NOT NULL,
  language_code         TEXT NOT NULL DEFAULT 'de',
  geo_scope             TEXT NOT NULL DEFAULT 'global'
    CHECK (geo_scope IN ('global','country','region')),
  geo_country           TEXT,
  geo_region            TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','archived','blocked')),
  submission_count      INTEGER NOT NULL DEFAULT 1,
  relevance_threshold   INTEGER NOT NULL DEFAULT 50,
  submitted_by_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_daily_pulse        BOOLEAN NOT NULL DEFAULT FALSE,
  daily_pulse_date      DATE,
  yes_count             BIGINT NOT NULL DEFAULT 0,
  no_count              BIGINT NOT NULL DEFAULT 0,
  skip_count            BIGINT NOT NULL DEFAULT 0,
  deep_dive_count       BIGINT NOT NULL DEFAULT 0,
  archive_count         BIGINT NOT NULL DEFAULT 0,
  total_votes           BIGINT NOT NULL DEFAULT 0,
  ai_tags               TEXT[],
  ai_context_cache      JSONB,
  cache_updated_at      TIMESTAMPTZ,
  axis_x                NUMERIC(3,2),
  axis_y                NUMERIC(3,2),
  abuse_report_count    INTEGER NOT NULL DEFAULT 0,
  submitted_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT word_hash   CHECK (word LIKE '#%'),
  CONSTRAINT word_length CHECK (char_length(word) BETWEEN 2 AND 28),
  CONSTRAINT unique_word UNIQUE (word, language_code, geo_country, geo_region)
);

-- ── QUESTION NOTIFICATION REQUESTS ─────────────────────────────
CREATE TABLE public.question_notification_requests (
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- ── VOTES ──────────────────────────────────────────────────────
CREATE TABLE public.votes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote_value      TEXT NOT NULL CHECK (vote_value IN ('yes','no','skip','deep_dive')),
  membership_type TEXT NOT NULL DEFAULT 'basis',
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  geo_country     TEXT,
  geo_preference  TEXT CHECK (geo_preference IN ('global','country','region','mixed')),
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(question_id, user_id)
);

-- ── VOTE HISTORY ───────────────────────────────────────────────
CREATE TABLE public.vote_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_value   TEXT NOT NULL,
  new_value   TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── VOTE TIMESERIES ────────────────────────────────────────────
CREATE TABLE public.vote_timeseries (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id        UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  bucket             TIMESTAMPTZ NOT NULL,
  yes_count          INTEGER NOT NULL DEFAULT 0,
  no_count           INTEGER NOT NULL DEFAULT 0,
  skip_count         INTEGER NOT NULL DEFAULT 0,
  total_count        INTEGER NOT NULL DEFAULT 0,
  verified_yes_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(question_id, bucket)
);

-- ── QUESTION COMPARISONS ────────────────────────────────────────
CREATE TABLE public.question_comparisons (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         TEXT,
  question_ids UUID[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT max_questions CHECK (array_length(question_ids, 1) BETWEEN 2 AND 5)
);

-- ── USER ARCHIVES ──────────────────────────────────────────────
CREATE TABLE public.user_archives (
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

-- ── TRUST SCORE HISTORY ────────────────────────────────────────
CREATE TABLE public.trust_score_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta       NUMERIC(6,2) NOT NULL,
  reason      TEXT NOT NULL,
  score_after NUMERIC(6,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── BADGES ─────────────────────────────────────────────────────
CREATE TABLE public.badges (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

-- ── EXPERT VOUCHES ─────────────────────────────────────────────
CREATE TABLE public.expert_vouches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vouching_user UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vouched_user  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at  TIMESTAMPTZ,
  UNIQUE(vouching_user, vouched_user)
);

-- ── EXPERT NOMINATIONS ─────────────────────────────────────────
CREATE TABLE public.expert_nominations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nominated_name   TEXT NOT NULL,
  nominated_email  TEXT,
  reason           TEXT,
  nomination_count INTEGER NOT NULL DEFAULT 1,
  threshold        INTEGER NOT NULL DEFAULT 25,
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','invited','accepted','declined')),
  invited_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LOBBY ACCOUNTS ─────────────────────────────────────────────
CREATE TABLE public.lobby_accounts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_name        TEXT NOT NULL,
  company_type        TEXT,
  trade_register_no   TEXT,
  company_website     TEXT,
  contact_name        TEXT,
  contact_email       TEXT NOT NULL,
  account_type        TEXT NOT NULL DEFAULT 'commercial'
    CHECK (account_type IN ('commercial','subsidized')),
  subsidy_org_type    TEXT CHECK (subsidy_org_type IN (
                        'ngo','foundation','education','public_authority',
                        'journalism','other_nonprofit')),
  subsidy_proof_url   TEXT,
  subsidy_reason      TEXT,
  subsidy_amount_eur  NUMERIC(10,2),
  subsidy_valid_until DATE,
  subsidy_notes       TEXT,
  kyc_status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','approved','rejected')),
  kyc_approved_at     TIMESTAMPTZ,
  kyc_approved_by     UUID REFERENCES public.admin_users(id),
  stripe_customer_id  TEXT,
  stripe_sub_id       TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (subscription_status IN ('inactive','active','past_due','cancelled','subsidized_active')),
  subscription_start  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MODERATION QUEUE ───────────────────────────────────────────
CREATE TABLE public.moderation_queue (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question','user','vote')),
  entity_id   UUID NOT NULL,
  reason      TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 1 CHECK (priority IN (1,2,3)),
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ABUSE REPORTS ──────────────────────────────────────────────
CREATE TABLE public.abuse_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(question_id, reported_by)
);

-- ── ADMIN IP WHITELIST ─────────────────────────────────────────
CREATE TABLE public.admin_ip_whitelist (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address TEXT NOT NULL UNIQUE,
  label      TEXT,
  added_by   UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ADMIN SESSIONS ─────────────────────────────────────────────
CREATE TABLE public.admin_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id      UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  ip_address    TEXT NOT NULL,
  user_agent    TEXT,
  totp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '8 hours',
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ADMIN AUDIT LOG ────────────────────────────────────────────
CREATE TABLE public.admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════
-- GDPR ANONYMOUS PLACEHOLDER
-- ══════════════════════════════════════════════════════════════════
INSERT INTO public.users (id, device_hash, membership_type)
VALUES ('00000000-0000-0000-0000-000000000000','DELETED_GDPR','basis')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════
CREATE INDEX idx_questions_status       ON public.questions(status, language_code);
CREATE INDEX idx_questions_geo          ON public.questions(geo_scope, geo_country, geo_region);
CREATE INDEX idx_questions_word_trgm    ON public.questions USING gin(word gin_trgm_ops);
CREATE INDEX idx_questions_autocomplete ON public.questions(word, status, submission_count)
  WHERE status IN ('active','pending');
CREATE INDEX idx_daily_pulse            ON public.questions(daily_pulse_date)
  WHERE is_daily_pulse = TRUE;
CREATE INDEX idx_votes_user             ON public.votes(user_id);
CREATE INDEX idx_votes_question         ON public.votes(question_id);
CREATE INDEX idx_votes_verified         ON public.votes(is_verified, question_id);
CREATE INDEX idx_votes_date             ON public.votes(voted_at DESC);
CREATE INDEX idx_votes_geo_pref         ON public.votes(geo_preference);
CREATE INDEX idx_timeseries_q           ON public.vote_timeseries(question_id, bucket DESC);
CREATE INDEX idx_archives_user          ON public.user_archives(user_id);
CREATE INDEX idx_vote_history_user      ON public.vote_history(user_id, changed_at DESC);
CREATE INDEX idx_vote_history_q         ON public.vote_history(question_id, changed_at DESC);
CREATE INDEX idx_users_geo_pref         ON public.users(geo_preference);
CREATE INDEX idx_notif_requests_q       ON public.question_notification_requests(question_id);
CREATE INDEX idx_trust_history_reason   ON public.trust_score_history(user_id, reason);
CREATE INDEX idx_lobby_stripe_sub       ON public.lobby_accounts(stripe_sub_id);
CREATE INDEX idx_abuse_question         ON public.abuse_reports(question_id);
CREATE INDEX idx_admin_sessions_token   ON public.admin_sessions(session_token);
CREATE INDEX idx_admin_sessions_expiry  ON public.admin_sessions(expires_at);
CREATE INDEX idx_audit_log_admin        ON public.admin_audit_log(admin_id, created_at DESC);
CREATE INDEX idx_vouches_vouching       ON public.expert_vouches(vouching_user)
  WHERE status = 'active';

-- ══════════════════════════════════════════════════════════════════
-- TRIGGERS & FUNCTIONS
-- ══════════════════════════════════════════════════════════════════

-- TRIGGER 1: Vote count aggregation
CREATE OR REPLACE FUNCTION update_question_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.vote_value = 'yes' THEN
    UPDATE public.questions
      SET yes_count = yes_count+1, total_votes = total_votes+1
      WHERE id = NEW.question_id;
  ELSIF NEW.vote_value = 'no' THEN
    UPDATE public.questions
      SET no_count = no_count+1, total_votes = total_votes+1
      WHERE id = NEW.question_id;
  ELSIF NEW.vote_value = 'skip' THEN
    UPDATE public.questions SET skip_count = skip_count+1
      WHERE id = NEW.question_id;
  ELSIF NEW.vote_value = 'deep_dive' THEN
    UPDATE public.questions SET deep_dive_count = deep_dive_count+1
      WHERE id = NEW.question_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vote_counts
AFTER INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION update_question_counts();

-- TRIGGER 2: Abuse report auto-actions
CREATE OR REPLACE FUNCTION handle_abuse_report()
RETURNS TRIGGER AS $$
DECLARE
  v_count                  INTEGER;
  v_word                   TEXT;
  v_submitter              UUID;
  v_submitter_trust        NUMERIC;
  v_threshold_pause        INTEGER := 10;
  v_threshold_block        INTEGER := 25;
  v_reporter_reports       INTEGER;
  v_reporter_blocked       INTEGER;
BEGIN
  SELECT q.abuse_report_count + 1, q.word, q.submitted_by
    INTO v_count, v_word, v_submitter
    FROM public.questions q WHERE q.id = NEW.question_id;

  IF v_submitter IS NOT NULL THEN
    SELECT trust_score INTO v_submitter_trust
      FROM public.users WHERE id = v_submitter;
    IF v_submitter_trust > 75 THEN
      v_threshold_pause := 15;
      v_threshold_block := 35;
    END IF;
  END IF;

  UPDATE public.questions
    SET abuse_report_count = v_count WHERE id = NEW.question_id;

  IF v_count = 3 THEN
    INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
    VALUES ('system','question_flagged_3_reports','question',NEW.question_id,
      jsonb_build_object('word',v_word,'count',v_count));

  ELSIF v_count >= v_threshold_pause AND v_count < v_threshold_block THEN
    UPDATE public.questions SET status='archived'
      WHERE id=NEW.question_id AND status='active';
    INSERT INTO public.moderation_queue (entity_type, entity_id, reason, priority)
    VALUES ('question', NEW.question_id, 'auto_paused_'||v_count||'_reports', 2);
    INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
    VALUES ('system','question_auto_paused','question',NEW.question_id,
      jsonb_build_object('word',v_word,'count',v_count));

  ELSIF v_count >= v_threshold_block THEN
    UPDATE public.questions SET status='blocked' WHERE id=NEW.question_id;
    INSERT INTO public.moderation_queue (entity_type, entity_id, reason, priority)
    VALUES ('question', NEW.question_id, 'auto_blocked_'||v_count||'_reports', 3);
    INSERT INTO public.admin_audit_log (admin_id, action, entity_type, entity_id, details)
    VALUES ('system','question_auto_blocked','question',NEW.question_id,
      jsonb_build_object('word',v_word,'count',v_count));
  END IF;

  SELECT COUNT(*) INTO v_reporter_reports
    FROM public.abuse_reports WHERE reported_by = NEW.reported_by;
  SELECT COUNT(*) INTO v_reporter_blocked
    FROM public.abuse_reports ar
    JOIN public.questions q ON q.id = ar.question_id
    WHERE ar.reported_by = NEW.reported_by AND q.status = 'blocked';

  IF v_reporter_reports >= 10
    AND (v_reporter_blocked::FLOAT / NULLIF(v_reporter_reports,0)) < 0.1 THEN
    UPDATE public.users
      SET trust_score = GREATEST(0, trust_score - 2)
      WHERE id = NEW.reported_by;
    INSERT INTO public.trust_score_history (user_id, delta, reason, score_after)
    SELECT NEW.reported_by, -2, 'serial_reporter_penalty',
           GREATEST(0, trust_score - 2)
      FROM public.users WHERE id = NEW.reported_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_abuse_report
AFTER INSERT ON public.abuse_reports
FOR EACH ROW EXECUTE FUNCTION handle_abuse_report();

-- TRIGGER 3: Auto-activate question
CREATE OR REPLACE FUNCTION check_question_threshold()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.submission_count >= NEW.relevance_threshold
    AND NEW.status = 'pending' THEN
    UPDATE public.questions SET status = 'active' WHERE id = NEW.id;
    PERFORM pg_notify('question_activated', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_threshold
AFTER UPDATE OF submission_count ON public.questions
FOR EACH ROW EXECUTE FUNCTION check_question_threshold();

-- TRIGGER 4: Wirksamkeits-Anzeige
CREATE OR REPLACE FUNCTION check_wirksamkeit()
RETURNS TRIGGER AS $$
DECLARE
  v_vote_count      INTEGER;
  v_effective_count INTEGER;
BEGIN
  IF NEW.vote_value NOT IN ('yes','no') THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_vote_count
    FROM public.votes
    WHERE user_id = NEW.user_id AND vote_value IN ('yes','no');
  IF v_vote_count = 100 THEN
    SELECT COUNT(*) INTO v_effective_count
      FROM public.votes v2
      JOIN public.questions q ON q.id = v2.question_id
      WHERE v2.user_id = NEW.user_id
        AND v2.vote_value IN ('yes','no')
        AND q.total_votes <= q.relevance_threshold + 50;
    INSERT INTO public.admin_audit_log
      (admin_id, action, entity_type, entity_id, details)
    VALUES ('system', 'wirksamkeit_milestone', 'user', NEW.user_id,
      jsonb_build_object('vote_count', v_vote_count,
                         'effective_count', v_effective_count));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wirksamkeit
AFTER INSERT ON public.votes
FOR EACH ROW EXECUTE FUNCTION check_wirksamkeit();

-- TRIGGER 5: Enforce max 5 active vouches per expert
CREATE OR REPLACE FUNCTION enforce_vouch_limit()
RETURNS TRIGGER AS $$
DECLARE v_active_count INTEGER;
BEGIN
  IF NEW.status = 'active' THEN
    SELECT COUNT(*) INTO v_active_count
      FROM public.expert_vouches
      WHERE vouching_user = NEW.vouching_user AND status = 'active';
    IF v_active_count >= 5 THEN
      RAISE EXCEPTION 'Expert vouch limit reached (max 5 active vouches per expert)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vouch_limit
BEFORE INSERT ON public.expert_vouches
FOR EACH ROW EXECUTE FUNCTION enforce_vouch_limit();

-- ══════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ══════════════════════════════════════════════════════════════════

-- Helper RPC: adjust_question_counts (used by change-vote Edge Function)
CREATE OR REPLACE FUNCTION public.adjust_question_counts(
  p_question_id UUID,
  p_yes_delta   INTEGER DEFAULT 0,
  p_no_delta    INTEGER DEFAULT 0,
  p_total_delta INTEGER DEFAULT 0
) RETURNS void AS $$
BEGIN
  UPDATE public.questions
    SET yes_count   = yes_count   + p_yes_delta,
        no_count    = no_count    + p_no_delta,
        total_votes = total_votes + p_total_delta
    WHERE id = p_question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper RPC: get_gold_split (for Lobby PDF reports)
CREATE OR REPLACE FUNCTION public.get_gold_split(p_question_id UUID)
RETURNS TABLE(verified_yes_pct NUMERIC, verified_count BIGINT) AS $$
  SELECT
    COUNT(*) FILTER (WHERE vote_value='yes' AND is_verified=TRUE) * 100.0 /
      NULLIF(COUNT(*) FILTER (WHERE is_verified=TRUE),0),
    COUNT(*) FILTER (WHERE is_verified=TRUE)
  FROM public.votes WHERE question_id = p_question_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- GDPR DELETE FUNCTION
CREATE OR REPLACE FUNCTION public.delete_user_account(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.votes
    SET user_id = '00000000-0000-0000-0000-000000000000'
    WHERE user_id = p_user_id;
  UPDATE public.vote_history
    SET user_id = '00000000-0000-0000-0000-000000000000'
    WHERE user_id = p_user_id;
  DELETE FROM public.user_profiles                  WHERE user_id = p_user_id;
  DELETE FROM public.trust_score_history            WHERE user_id = p_user_id;
  DELETE FROM public.badges                         WHERE user_id = p_user_id;
  DELETE FROM public.abuse_reports                  WHERE reported_by = p_user_id;
  DELETE FROM public.user_archives                  WHERE user_id = p_user_id;
  DELETE FROM public.question_comparisons           WHERE user_id = p_user_id;
  DELETE FROM public.question_notification_requests WHERE user_id = p_user_id;
  DELETE FROM public.expert_vouches
    WHERE vouching_user = p_user_id OR vouched_user = p_user_id;
  DELETE FROM public.lobby_accounts                 WHERE user_id = p_user_id;
  DELETE FROM public.users                          WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE public.users                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_timeseries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_archives                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_comparisons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_notification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_score_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expert_vouches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobby_accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_reports                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_ip_whitelist             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log                ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own"        ON public.users              FOR ALL    USING (auth.uid()::text=id::text);
CREATE POLICY "profile_own"      ON public.user_profiles      FOR ALL    USING (auth.uid()::text=user_id::text);
CREATE POLICY "questions_read"   ON public.questions          FOR SELECT USING (status IN ('active','pending'));
CREATE POLICY "questions_insert" ON public.questions          FOR INSERT WITH CHECK (auth.role()='authenticated');
CREATE POLICY "votes_own"        ON public.votes              FOR ALL    USING (auth.uid()::text=user_id::text);
CREATE POLICY "timeseries_read"  ON public.vote_timeseries    FOR SELECT USING (auth.role()='authenticated');
CREATE POLICY "archives_own"     ON public.user_archives      FOR ALL    USING (auth.uid()::text=user_id::text);
CREATE POLICY "comparisons_own"  ON public.question_comparisons FOR ALL  USING (auth.uid()::text=user_id::text);
CREATE POLICY "notif_own"        ON public.question_notification_requests FOR ALL USING (auth.uid()::text=user_id::text);
CREATE POLICY "trust_own"        ON public.trust_score_history FOR SELECT USING (auth.uid()::text=user_id::text);
CREATE POLICY "badges_own"       ON public.badges             FOR SELECT USING (auth.uid()::text=user_id::text);
CREATE POLICY "vouches_own"      ON public.expert_vouches     FOR ALL    USING (auth.uid()::text=vouching_user::text OR auth.uid()::text=vouched_user::text);
CREATE POLICY "lobby_own"        ON public.lobby_accounts     FOR ALL    USING (auth.uid()::text=user_id::text);
