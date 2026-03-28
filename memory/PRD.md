# RAWLZ - Product Requirements Document

## Original Problem Statement
Build a production-ready full-stack mobile and web application called "RAWLZ" (Tagline: "Wischen, wählen, verstehen.").

### Tech Stack
- **Mobile App**: React Native + Expo
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Web Admin/B2B**: React + TypeScript (Vite)

---

## Phases

### Phase 1 - COMPLETED ✅
Core database, Edge Functions, mobile auth, swipe screen.

### Phase 2 - COMPLETED ✅
Search, History, Suggestion, Settings screens, Daily Pulse, Wirksamkeit, Abuse Reporting, Share Cards, AI Facts Overlay (GPT-4o-mini).

### Phase 3 - COMPLETED ✅ (December 2025)
Full Membership System (SUPPORTER, EXPERTE, LOBBY commercial + subsidized, Optional Profile).

### Phase 4 - COMPLETED ✅ (February 2026)
Admin Panel + B2B Lobby Dashboard.

#### Phase 4 Deliverables:
1. **Mobile Admin** (`/app/mobile/app/admin/index.tsx`)
   - 7×-Tap secret access on version number
   - Full auth flow (email + password + TOTP setup/verify)
   - 7 tabs: Fragen, Moderation, KYC, Trust Score, Experten, Analytics, Push
   - Role-based tab visibility (super_admin vs. moderator)

2. **Web Admin** (`admin.rawlz.app` – `/app/web-admin/`)
   - Login + TOTP 2FA
   - 8 tabs: Fragen, Moderation, KYC, Trust Score, Experten, Analytics, Push, Admins
   - Push Notifications mit echter API-Anbindung + iOS/Android Preview
   - Activation Log + Payment Events Log

3. **Lobby-Analytics Edge Function** (`/app/supabase/functions/lobby-analytics/`)
   - 12 Module: gold_data, apathy, mind_shift, divergenz, volldemografik, feed_mode, city_rural, heatmap, timeseries, comparison, suggestions, csv_export
   - K-Anonymität durchgesetzt (HAVING COUNT ≥ 20) in allen Modulen
   - Supabase Auth + Lobby-Mitgliedschaftsprüfung

4. **B2B Dashboard** (`lobby.rawlz.app` – `/app/web-lobby/`)
   - Login (Supabase Auth, E-Mail + Passwort)
   - Subscription-Status-Banner mit Billing-Portal-Link
   - Sidebar-Navigation (13 Einträge)
   - 11 Analytics-Komponenten mit Recharts
   - CSV-Export + PDF-Report-Generator
   - Vollständige Vite/TypeScript/Tailwind-Konfiguration

5. **Push Notification Wiring**
   - `send-push-notification` unterstützt Service-Role-Key (für CRON)
   - `cron-daily-pulse` Edge Function (CRON 7)
   - Admin Push Tab mit echter API-Anbindung

6. **README.md** – vollständige First-Time-Setup-Anleitung

---

## Edge Functions (29 total)
1. `activate-question-notify`
2. `activate-subsidized-lobby`
3. `admin-api` (inkl. send_push + get_audit_log)
4. `admin-auth-check`
5. `admin-login`
6. `admin-logout`
7. `admin-manage-user`
8. `admin-totp-setup`
9. `admin-totp-verify`
10. `change-vote`
11. `create-billing-portal`
12. `create-lobby-checkout`
13. `create-subsidized-checkout`
14. `cron-daily-pulse` ← NEU Phase 4
15. `generate-ai-facts`
16. `generate-lobby-pdf`
17. `get-daily-pulse`
18. `get-wirksamkeit`
19. `lobby-analytics` ← NEU Phase 4
20. `mark-wirksamkeit-shown`
21. `register-lobby`
22. `report-abuse`
23. `revenuecat-webhook`
24. `send-expert-invitation`
25. `send-push-notification`
26. `stripe-webhook`
27. `submit-question`
28. `tag-question`
29. `user-totp-setup`

---

## Architecture

```
/app/
├── mobile/                    # React Native Expo App
│   ├── app/
│   │   ├── (tabs)/            # Bottom tabs
│   │   ├── auth/
│   │   ├── admin/index.tsx    # Mobile Admin (Phase 4)
│   │   ├── membership.tsx
│   │   ├── 2fa-setup.tsx
│   │   ├── profile.tsx
│   │   └── suggest.tsx
│   ├── components/
│   └── lib/
├── web-lobby/                 # Lobby Web Portal (React + Vite + TS)
│   └── src/
│       ├── lib/               # supabase.ts, api.ts
│       ├── pages/             # login, register, success, dashboard
│       └── components/
│           ├── Sidebar.tsx
│           ├── StatusBanner.tsx
│           └── analytics/     # 12 Analytics-Komponenten
├── web-admin/                 # Admin Web Portal (React + Vite + TS)
│   └── src/
│       ├── lib/api.ts
│       ├── pages/             # Login, Dashboard
│       └── components/        # 8 Tab-Komponenten
├── supabase/
│   ├── functions/             # 29 Edge Functions
│   └── migrations/
└── README.md
```

---

## 3rd Party Integrations
- Supabase (DB/Auth/Edge Functions) - Placeholder keys
- RevenueCat (In-App Purchases) - Placeholder keys
- Stripe (Payments) - Placeholder keys
- OpenAI GPT-4o-mini (AI Facts) - Emergent LLM Key

---

## Remaining / Future Tasks (P1 Backlog)
- App Store / Google Play Deployment (EAS Build)
- Push Notification APNs/FCM Setup (requires Apple Developer Account)
- Database Migrations Finalisierung (alle Tabellen mit korrekten Indizes)
- RLS Policies für alle Tabellen
- Admin IP Whitelist Setup
- Stripe Webhooks Live-Konfiguration
- RevenueCat Live-Konfiguration
