# RAWLZ - Phase 1 Complete

**© Jörg Pakusch, Hamburg, Germany. All rights reserved.**  
**Legal entity: RAWLZ e.V. (gemeinnützig, in Gründung)**

> "Wischen, wählen, verstehen."  
> Named after philosopher John Rawls – 1 vote = 1 vote

## Project Structure

```
/app/
├── mobile/                    # React Native + Expo App
│   ├── app/                   # expo-router Screens
│   │   ├── auth/              # Authentication screens
│   │   └── (tabs)/            # Main app tabs (Swipe, Search, Settings)
│   ├── components/            # UI Components
│   ├── lib/                   # Utilities
│   │   ├── supabase.ts        # Supabase Client (detectSessionInUrl: false)
│   │   ├── hashing.ts         # SHA-256 with expo-crypto
│   │   ├── i18n.ts            # i18next Setup
│   │   ├── haptics.ts         # Haptic Patterns
│   │   ├── sounds.ts          # Sound effects
│   │   ├── offlineQueue.ts    # Offline vote sync
│   │   ├── auth.ts            # Auth utilities
│   │   ├── constants.ts       # Design system & constants
│   │   └── kompass.ts         # Meinungs-Kompass calculation
│   ├── locales/               # de.json, en.json
│   ├── assets/                # SFX, Images
│   ├── app.json               # Expo Config (scheme: 'rawlz')
│   └── package.json
├── supabase/
│   ├── functions/             # Edge Functions (Deno)
│   │   ├── admin-login/
│   │   ├── admin-totp-setup/
│   │   ├── admin-totp-verify/
│   │   ├── admin-auth-check/
│   │   ├── admin-logout/
│   │   ├── admin-manage-user/
│   │   ├── change-vote/
│   │   ├── tag-question/
│   │   └── activate-question-notify/
│   └── migrations/
│       ├── 001_initial_schema.sql  # All tables, triggers, functions, RLS
│       └── 002_cron_jobs.sql       # All 8 pg_cron jobs
└── README.md
```

## Phase 1 Deliverables

### ✅ 1. Database Schema (001_initial_schema.sql)
- **20+ Tables**: users, user_profiles, questions, votes, vote_history, vote_timeseries, question_comparisons, user_archives, trust_score_history, badges, expert_vouches, expert_nominations, lobby_accounts, moderation_queue, abuse_reports, admin_users, admin_sessions, admin_ip_whitelist, admin_audit_log, question_notification_requests
- **5 Triggers**: vote counts, abuse reports, question threshold, wirksamkeit, vouch limit
- **3 Helper Functions**: adjust_question_counts, get_gold_split, delete_user_account
- **All Indexes** for performance
- **Row Level Security (RLS)** on all tables

### ✅ 2. CRON Jobs (002_cron_jobs.sql)
1. `rawlz-timeseries-hourly` - Vote aggregation
2. `rawlz-trust-score-daily` - Trust score +0.2/day
3. `rawlz-expert-demotion` - Expert auto-demotion (INV-07)
4. `rawlz-daily-pulse` - Daily pulse setter
5. `rawlz-ai-cache-cleanup` - AI cache cleanup
6. `rawlz-admin-session-cleanup` - Admin session cleanup
7. `rawlz-daily-pulse-push` - Daily pulse notification
8. `rawlz-subsidy-renewal-reminder` - Subsidy renewal reminder

### ✅ 3. Edge Functions
- **EF-01**: change-vote (3-minute lock, server-side)
- **EF-02**: activate-question-notify
- **EF-07**: tag-question (AI tagging)
- **EF-08**: admin-login
- **EF-09**: admin-totp-setup
- **EF-10**: admin-totp-verify
- **EF-11**: admin-auth-check
- **EF-12**: admin-logout
- **EF-13**: admin-manage-user

### ✅ 4. App Configuration
- `app.json` with scheme 'rawlz' for deep links
- `package.json` with all dependencies
- `.env` with placeholders

### ✅ 5. Lib Utilities
- `supabase.ts` - Supabase client with `detectSessionInUrl: false` (INV-09)
- `hashing.ts` - SHA-256 hashing (INV-04)
- `i18n.ts` - i18next with German/English
- `haptics.ts` - Haptic patterns for all vote actions
- `sounds.ts` - Sound effects manager
- `offlineQueue.ts` - Offline vote queue
- `auth.ts` - Apple/Google/Email auth
- `constants.ts` - Design system colors & thresholds
- `kompass.ts` - Meinungs-Kompass calculation

### ✅ 6. Localization
- `de.json` - Complete German translations
- `en.json` - Complete English translations

### ✅ 7. Auth Screens
- Sign in with Apple (iOS)
- Sign in with Google
- Sign in with Email/Password
- Password reset flow
- GDPR consent checkbox

### ✅ 8. Swipe Screen
- 4 gestures (YES/NO/DOWN/UP)
- Animated card with spring physics
- Flash overlays for vote feedback
- SFX + Haptic patterns
- Bottom sheet (Archive/Later)
- Cloud menu (Search/Suggest/Results)
- AI facts overlay (tap)
- Result display with threshold gate

### ✅ 9. Search & History
- My Votes tab
- Search tab with live search
- Comparison selection (2-5 questions)
- Compass tab (locked until 50 votes)

### ✅ 10. Settings
- Membership display
- Language toggle
- Sounds/Notifications toggles
- Feed mode selection
- Legal links
- Account deletion
- Hidden admin access (7x version tap)

## Invariants Implemented

- **INV-01**: word ALWAYS starts with # (CHECK constraint)
- **INV-03**: Results after threshold (500/200/100/50)
- **INV-04**: SHA-256 before any DB write
- **INV-06**: max 5 active vouches per expert (trigger)
- **INV-07**: Expert auto-demotion (CRON)
- **INV-09**: detectSessionInUrl: false
- **INV-10**: scheme: 'rawlz'
- **INV-12**: Swipe Down = Bottom Sheet only
- **INV-15**: 3-minute vote lock (Edge Function)
- **INV-16**: Vote change is qualitative
- **INV-17**: All vote changes logged
- **INV-19**: Activation notifications one-time only
- **INV-22**: Admin 2FA mandatory

## Setup Instructions

### 1. Supabase Setup
1. Create a new Supabase project
2. Enable pg_cron extension
3. Run `001_initial_schema.sql`
4. Run `002_cron_jobs.sql`
5. Deploy Edge Functions
6. Add environment variables:
   - `OPENAI_API_KEY`
   - `ADMIN_TOTP_ENCRYPTION_KEY` (32 random chars)

### 2. Mobile App Setup
```bash
cd mobile
yarn install
cp .env.example .env
# Fill in Supabase credentials
npx expo start
```

### 3. Environment Variables

**Mobile (.env)**
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_REVENUECAT_IOS_KEY=your-revenuecat-ios-key
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=your-revenuecat-android-key
```

**Supabase Edge Functions (Secrets)**
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
ADMIN_TOTP_ENCRYPTION_KEY=
```

## Next Steps (Phase 2)

- [ ] RevenueCat integration for Supporter purchases
- [ ] Stripe integration for Lobby payments
- [ ] Push notifications implementation
- [ ] Admin Panel (admin.rawlz.app)
- [ ] B2B Dashboard (lobby.rawlz.app)
- [ ] Share cards generation
- [ ] Complete Meinungs-Kompass UI
