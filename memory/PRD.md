# RAWLZ - Product Requirements Document

## Original Problem Statement
Build a production-ready full-stack mobile and web application called "RAWLZ" (Tagline: "Wischen, wählen, verstehen.").

### Tech Stack
- **Mobile App**: React Native + Expo
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Web Admin/B2B**: React + TypeScript

## Development Phases

### Phase 1 - COMPLETED ✅
Core database, Edge Functions, mobile auth, and swipe screen.

### Phase 2 - COMPLETED ✅
Search, History, Suggestion, Settings screens, Daily Pulse, Wirksamkeit, Abuse Reporting, Share Cards, AI Facts Overlay (GPT-4o-mini).

### Phase 3 - COMPLETED ✅ (December 2025)
Full Membership System

**Edge Functions Created:**
- `revenuecat-webhook` - RevenueCat webhooks for Supporter purchases/refunds
- `user-totp-setup` - Expert 2FA (generate/confirm/verify with TOTP)
- `create-lobby-checkout` - Stripe Checkout for commercial Lobby (€2,400/year)
- `stripe-webhook` - All 7 Stripe events + subsidized handling
- `create-billing-portal` - Stripe Billing Portal for Lobby accounts
- `activate-subsidized-lobby` - Admin: €0 activation for subsidized accounts
- `create-subsidized-checkout` - Admin: custom amount one-time payment
- `register-lobby` - Lobby registration (commercial + subsidized)

**Mobile UI:**
- `lib/revenuecat.ts` - RevenueCat integration with German error messages
- `app/membership.tsx` - Full membership screen (BASIS/SUPPORTER/EXPERTE/LOBBY)
- `app/2fa-setup.tsx` - Expert 2FA setup with QR code (react-native-qrcode-svg)
- `app/profile.tsx` - 3-tier optional profile with Trust bonus preview

**Web Lobby (lobby.rawlz.app):**
- `web-lobby/src/pages/register.tsx` - PATH A (Commercial) + PATH B (Subsidized)
- `web-lobby/src/pages/success.tsx` - Checkout success page
- `web-lobby/src/App.tsx` - Router setup

**Features:**
1. **SUPPORTER (€1 via RevenueCat)**
   - Non-consumable purchase 'rawlz_supporter_onetime'
   - Trust +10 bonus (idempotent)
   - Pending questions threshold reduced to 30
   - Supporter badge
   - German error messages for all RevenueCat error codes

2. **EXPERTE**
   - Trust Score progress bar (0-100)
   - Vouch UI (max 5 active vouches)
   - 2FA Setup with QR Code + manual code fallback
   - 2FA verification required at login

3. **LOBBY Commercial (€2,400/year)**
   - Stripe Checkout integration
   - Immediate access after payment (INV-26)
   - Billing Portal for subscription management
   - Status banner (active/past_due/cancelled)

4. **LOBBY Subsidized (Förderantrag)**
   - Eligibility: NGOs, foundations, education, government, journalism
   - Required fields: org_type, trade_register_no, subsidy_reason
   - NO immediate access (INV-28)
   - Admin approval via moderation_queue
   - €0 or custom amount activation

5. **Optional User Profile (3 Tiers)**
   - Tier 1 (all): age_group, geo_city_size, geo_type → +1 Trust each
   - Tier 2 (all): gender, education, political_lean, political_interest → +2 Trust each
   - Tier 3 (all): employment, income, voting, org_membership → +3 Trust each
   - Supporter+: media, smartphone, AI tools, housing, household, children
   - Expert+: expert_field, expert_role, academic_degree
   - Lobby+: org_type, org_sector, org_size, org_geo_focus, org_use_case
   - Skip buttons + Trust bonus preview on each field

### Phase 4+ - UPCOMING
- Web Admin Panel (`admin.rawlz.app`)
- B2B Web Dashboard full implementation
- PDF Report Generation
- API access for Lobby accounts

## Architecture

```
/app/
├── mobile/                    # React Native Expo App
│   ├── app/                   # expo-router
│   │   ├── (tabs)/            # Bottom tabs (index, search, settings)
│   │   ├── auth/              # Login screens
│   │   ├── membership.tsx     # Membership management
│   │   ├── 2fa-setup.tsx      # Expert 2FA setup
│   │   ├── profile.tsx        # Optional user profile
│   │   └── suggest.tsx        # Question suggestion
│   ├── components/            # Reusable components
│   │   ├── ShareCards/        # Share card components
│   │   ├── WirksamkeitOverlay.tsx
│   │   ├── AbuseReportSheet.tsx
│   │   └── DailyPulseCard.tsx
│   └── lib/                   # Core logic
│       ├── revenuecat.ts      # RevenueCat integration
│       ├── supabase.ts        # Supabase client
│       ├── offlineQueue.ts    # Offline sync
│       └── ...
├── web-lobby/                 # Lobby Web Portal (React + TS)
│   └── src/
│       ├── pages/
│       │   ├── register.tsx   # Commercial + Subsidized registration
│       │   └── success.tsx    # Checkout success
│       └── App.tsx
├── supabase/                  # Backend
│   ├── functions/             # 24 Edge Functions
│   └── migrations/            # PostgreSQL schema
└── backend/ & frontend/       # LEGACY (Do not use)
```

## Edge Functions Summary (24 total)
1. `activate-question-notify` - Notify users when question activates
2. `admin-auth-check` - Admin session validation
3. `admin-login` - Admin login
4. `admin-logout` - Admin logout
5. `admin-manage-user` - Admin user management
6. `admin-totp-setup` - Admin 2FA setup
7. `admin-totp-verify` - Admin 2FA verification
8. `change-vote` - Change user vote (with lock period)
9. `create-billing-portal` - Stripe Billing Portal
10. `create-lobby-checkout` - Stripe Checkout for commercial
11. `create-subsidized-checkout` - Custom amount checkout for subsidized
12. `generate-ai-facts` - GPT-4o-mini AI facts generation
13. `get-daily-pulse` - Get today's daily pulse question
14. `get-wirksamkeit` - Get user effectiveness data
15. `mark-wirksamkeit-shown` - Mark effectiveness overlay as shown
16. `register-lobby` - Lobby account registration
17. `report-abuse` - Report abuse on questions
18. `revenuecat-webhook` - RevenueCat purchase webhooks
19. `stripe-webhook` - Stripe subscription webhooks
20. `submit-question` - Submit new question
21. `tag-question` - Tag question with AI tags
22. `user-totp-setup` - Expert 2FA setup
23. `activate-subsidized-lobby` - Admin activate subsidized account
24. `activate-question-notify` - Question activation notifications

## 3rd Party Integrations
- Supabase (DB/Auth/Edge Functions) - Placeholder keys
- RevenueCat (In-App Purchases) - Placeholder keys
- Stripe (Payments) - Placeholder keys
- OpenAI GPT-4o-mini (AI Facts) - Emergent LLM Key

## Next Steps (Phase 4)
1. Build Admin Panel (`admin.rawlz.app`)
2. Complete Lobby Dashboard with analytics
3. Implement PDF Report Generation
4. Add API access for Lobby accounts
