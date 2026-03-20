# RAWLZ - Product Requirements Document

## Original Problem Statement
Build a production-ready full-stack mobile and web application called "RAWLZ" (Tagline: "Wischen, wählen, verstehen.").

### Tech Stack
- **Mobile App**: React Native + Expo
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Web Admin/B2B**: React + TypeScript (Phase 3+)

## Development Phases

### Phase 1 - COMPLETED ✅
Core database, Edge Functions, mobile auth, and swipe screen.

**Completed:**
- Supabase schema (`001_initial_schema.sql`)
- CRON jobs (`002_cron_jobs.sql`)
- Edge Functions: admin-login, admin-logout, admin-auth-check, admin-totp-setup, admin-totp-verify, admin-manage-user, change-vote, tag-question, activate-question-notify
- Mobile: Expo initialization, i18n, haptics, auth flows
- Swipe screen UI with gesture handling

### Phase 2 - IN PROGRESS 🔄
Search, History, Suggestion, and Settings screens.

**Completed (December 2025):**
- **Edge Functions:**
  - `submit-question` (EF-03): Question submission with threshold calculation
  - `report-abuse` (EF-04): Abuse reporting with rate limiting
  - `get-wirksamkeit` (EF-05): User effectiveness data
  - `mark-wirksamkeit-shown` (EF-06): Mark Wirksamkeit overlay as shown
  - `get-daily-pulse` (EF-07): Daily Pulse question retrieval

- **Offline Queue** (`lib/offlineQueue.ts`):
  - Full offline vote queuing with conflict resolution
  - Question prefetching and caching
  - Network listener for auto-sync
  - Abuse report queuing
  - Optimistic UI updates

- **Share Cards:**
  - `MoodCard`: User's voting mood overview (1080x1080px)
  - `MyVoteCard`: Single vote result sharing
  - `ChartCard`: Comparison chart sharing

- **Components:**
  - `WirksamkeitOverlay`: Effectiveness overlay (after 100 votes)
  - `AbuseReportSheet`: Abuse reporting bottom sheet
  - `DailyPulseCard`: Special card for daily pulse questions

- **Swipe Screen** (updated `index.tsx`):
  - Daily Pulse card integration
  - Wirksamkeit overlay trigger
  - Abuse reporting UI
  - Offline mode with banner
  - Network state listener

- **Translations** (de.json, en.json):
  - All new strings for Phase 2 features
  - Abuse, share, wirksamkeit sections

**In Progress:**
- Search & History Dashboard (4 tabs with comparison mode)
- Suggest screen with autocomplete
- Settings with notification list

### Phase 3+ - FUTURE
- Web Admin Panel (`admin.rawlz.app`)
- B2B Web Dashboard (`lobby.rawlz.app`)
- Stripe checkout Edge Functions
- PDF Report Generation

## Architecture

```
/app/
├── mobile/                  # React Native Expo App
│   ├── app/                 # expo-router file-based navigation
│   │   ├── (tabs)/          # Main bottom tabs
│   │   │   ├── _layout.tsx  # Tab navigation config
│   │   │   ├── index.tsx    # Swipe screen
│   │   │   ├── search.tsx   # Search & History
│   │   │   └── settings.tsx # Settings
│   │   ├── auth/            # Auth screens
│   │   └── suggest.tsx      # Question suggestion
│   ├── components/          # Reusable components
│   │   ├── ShareCards/      # Share card components
│   │   ├── WirksamkeitOverlay.tsx
│   │   ├── AbuseReportSheet.tsx
│   │   └── DailyPulseCard.tsx
│   ├── lib/                 # Core logic
│   │   ├── supabase.ts      # Supabase client
│   │   ├── offlineQueue.ts  # Offline sync
│   │   ├── constants.ts     # Design system
│   │   ├── i18n.ts          # Internationalization
│   │   ├── haptics.ts       # Haptic feedback
│   │   ├── sounds.ts        # Sound effects
│   │   ├── kompass.ts       # Compass calculation
│   │   ├── auth.ts          # Auth utilities
│   │   └── hashing.ts       # Hash utilities
│   ├── locales/             # Translations
│   │   ├── de.json          # German
│   │   └── en.json          # English
│   └── package.json
├── supabase/                # Backend
│   ├── functions/           # Deno Edge Functions
│   │   ├── activate-question-notify/
│   │   ├── submit-question/
│   │   ├── report-abuse/
│   │   ├── get-wirksamkeit/
│   │   ├── mark-wirksamkeit-shown/
│   │   ├── get-daily-pulse/
│   │   ├── admin-*/
│   │   ├── change-vote/
│   │   └── tag-question/
│   └── migrations/          # PostgreSQL
│       ├── 001_initial_schema.sql
│       └── 002_cron_jobs.sql
└── backend/ & frontend/     # LEGACY (Do not use)
```

## Key Database Tables
- `users`: User accounts with membership, trust score, geo preferences
- `questions`: Questions with vote counts, status, AI tags
- `votes`: User votes with conflict resolution
- `question_notification_requests`: Activation notifications
- `vote_timeseries`: Time-based vote data
- `question_comparisons`: Saved comparisons
- `abuse_reports`: Abuse reports with auto-moderation triggers

## Design System
- **Colors**: White base, black text, green (yes), red (no), gold (premium)
- **Typography**: Bold, high-contrast, scalable font sizes
- **Haptics**: Distinct patterns for yes/no/archive/deep-dive
- **Animations**: Spring-based swipe, flash feedback

## 3rd Party Integrations
- Supabase (PostgreSQL, Auth, Edge Functions) - Placeholder keys
- Stripe (Payments) - Placeholder keys
- RevenueCat (In-App Purchases) - Placeholder keys
- OpenAI GPT-4o-mini (AI Fact overlays) - Emergent LLM Key

## Next Action Items
1. Complete Search screen with all 4 tabs and comparison mode
2. Finalize Suggest screen autocomplete
3. Test offline queue sync
4. Implement AI Fact overlay with GPT-4o-mini

## Known Constraints
- INV-01: Word format `#[a-zA-Z0-9äöüÄÖÜß]{1,27}`
- INV-03: Result thresholds by membership
- INV-09: `detectSessionInUrl: false` for React Native
- INV-14: Daily Pulse must be first card
- INV-15: Vote lock 3 minutes
- INV-17: Full offline support
- INV-19: One-time notification cleanup
