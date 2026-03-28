# RAWLZ – "Wischen, wählen, verstehen."

Vollständige Dokumentation für das RAWLZ-Projekt (React Native App + Supabase Backend + Web Dashboards).

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Architektur](#architektur)
3. [Voraussetzungen](#voraussetzungen)
4. [Supabase Einrichten](#supabase-einrichten)
5. [Mobile App (Expo)](#mobile-app-expo)
6. [Web Admin Panel](#web-admin-panel-adminrawlzapp)
7. [Web Lobby Dashboard](#web-lobby-dashboard-lobbyrawlzapp)
8. [Edge Functions deployen](#edge-functions-deployen)
9. [CRON Jobs konfigurieren](#cron-jobs-konfigurieren)
10. [Umgebungsvariablen](#umgebungsvariablen)
11. [3rd-Party-Integrationen](#3rd-party-integrationen)
12. [Datenbankschema](#datenbankschema)
13. [Sicherheitshinweise](#sicherheitshinweise)

---

## Übersicht

RAWLZ ist eine anonyme Abstimmungs-App. Nutzer wischen täglich Fragen (Wörter) nach links/rechts und geben damit eine klare Meinung ab. Die Ergebnisse sind sofort sichtbar – transparent, ohne soziale Beeinflussung.

**Kernprinzipien:**
- Vollständige Anonymität der Einzelstimmen
- K-Anonymität ≥ 20 für alle aggregierten Auswertungen
- Trust-Score-System für verifizierten Einfluss
- Membership-Modell: BASIS → SUPPORTER → EXPERTE → LOBBY

---

## Architektur

```
/app/
├── mobile/                  # React Native + Expo (App)
├── supabase/
│   ├── functions/           # 26 Deno Edge Functions
│   └── migrations/          # PostgreSQL Migrationen
├── web-admin/               # React + TypeScript (admin.rawlz.app)
└── web-lobby/               # React + TypeScript (lobby.rawlz.app)
```

---

## Voraussetzungen

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.0 |
| npm / yarn | aktuell |
| Expo CLI | `npm install -g expo-cli` |
| Supabase CLI | `npm install -g supabase` |
| Git | aktuell |

---

## Supabase Einrichten

### 1. Neues Supabase-Projekt erstellen

1. Auf [supabase.com](https://supabase.com) einloggen
2. **New Project** → Organisation wählen → Name: `rawlz` → Region wählen → Passwort notieren
3. Projekt-URL und Keys kopieren (Settings → API):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### 2. Supabase CLI verbinden

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Migrationen ausführen

```bash
supabase db push
```

---

## Mobile App (Expo)

### Installation

```bash
cd /app/mobile
npm install
```

### Konfiguration

Datei `/app/mobile/.env` erstellen:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
EXPO_PUBLIC_REVENUECAT_KEY_IOS=your_revenuecat_ios_key
EXPO_PUBLIC_REVENUECAT_KEY_ANDROID=your_revenuecat_android_key
```

### Starten

```bash
npx expo start
```

### Admin-Zugang (Mobile)

7× auf die Versionsnummer tippen → Admin Login erscheint.

---

## Web Admin Panel (admin.rawlz.app)

### Installation & Starten

```bash
cd /app/web-admin
yarn install
cp .env.example .env.local   # Werte eintragen!
yarn dev
# → http://localhost:5173
```

### Ersten Admin erstellen

In der Supabase SQL-Konsole:

```sql
INSERT INTO admin_users (email, name, password_hash, role, is_active)
VALUES (
  'admin@rawlz.app',
  'Super Admin',
  encode(sha256('DEIN_SICHERES_PASSWORT'::bytea), 'hex'),
  'super_admin',
  true
);
-- Eigene IP whitelisten:
INSERT INTO admin_ip_whitelist (ip, description) VALUES ('YOUR_IP', 'Meine IP');
```

---

## Web Lobby Dashboard (lobby.rawlz.app)

### Installation & Starten

```bash
cd /app/web-lobby
yarn install
cp .env.example .env.local   # Werte eintragen!
yarn dev
# → http://localhost:5174
```

### Anmeldung

Lobby-Nutzer melden sich mit ihrem Supabase Auth E-Mail/Passwort an.
Voraussetzung: `users.membership_type = 'lobby'` und `lobby_accounts.subscription_status = 'active'`.

---

## Edge Functions deployen

```bash
# Alle Functions auf einmal
supabase functions deploy --no-verify-jwt

# Einzelne Function
supabase functions deploy lobby-analytics
```

### Secrets setzen

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set REVENUECAT_WEBHOOK_AUTH_HEADER=your_secret
supabase secrets set OPENAI_API_KEY=your_emergent_llm_key
supabase secrets set ADMIN_JWT_SECRET=your_random_secret_min_32_chars
```

---

## CRON Jobs konfigurieren

In der Supabase SQL-Konsole:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Daily Pulse Push (täglich 08:00)
SELECT cron.schedule('daily-pulse-push', '0 8 * * *', $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/cron-daily-pulse',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    )
  );
$$);

-- Timeseries Snapshot (täglich 00:05)
SELECT cron.schedule('vote-timeseries-snapshot', '5 0 * * *', $$
  INSERT INTO vote_timeseries (question_id, snapshot_date, yes_count, no_count, total_count)
  SELECT id, CURRENT_DATE, yes_count, no_count, total_votes
  FROM questions WHERE status = 'active'
  ON CONFLICT (question_id, snapshot_date) DO UPDATE
    SET yes_count = EXCLUDED.yes_count,
        no_count = EXCLUDED.no_count,
        total_count = EXCLUDED.total_count;
$$);
```

---

## Umgebungsvariablen

### Edge Functions Secrets

| Variable | Beschreibung |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API Key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Secret |
| `REVENUECAT_WEBHOOK_AUTH_HEADER` | RevenueCat Webhook Auth |
| `OPENAI_API_KEY` | Emergent LLM Key (GPT-4o-mini) |
| `ADMIN_JWT_SECRET` | Mind. 32 Zeichen, zufällig |

### Mobile App

| Variable | Beschreibung |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase Projekt-URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `EXPO_PUBLIC_REVENUECAT_KEY_IOS` | RevenueCat iOS Key |
| `EXPO_PUBLIC_REVENUECAT_KEY_ANDROID` | RevenueCat Android Key |

### Web Apps

| Variable | Beschreibung |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase Projekt-URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key |

---

## 3rd-Party-Integrationen

### Stripe
1. [stripe.com](https://stripe.com) → API Keys
2. Webhook: `https://YOUR_PROJECT.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`

### RevenueCat
1. [revenuecat.com](https://revenuecat.com) → Project → API Keys
2. Webhook: `https://YOUR_PROJECT.supabase.co/functions/v1/revenuecat-webhook`
3. Produkt: `rawlz_supporter_onetime` (Non-consumable, €1)

### Expo Push Notifications
1. APNs-Zertifikat (iOS): `eas credentials`
2. FCM-Key (Android): Google Cloud Console → Expo Dashboard
3. Push-Tokens in `users.expo_push_token` gespeichert

---

## Datenbankschema

| Tabelle | Beschreibung |
|---------|-------------|
| `users` | App-Nutzer mit optionalem Profil |
| `questions` | Abstimmungsfragen |
| `votes` | Einzelstimmen (anonym) |
| `vote_timeseries` | Tägliche Snapshots |
| `vote_changes` | Stimmungsänderungen |
| `swipe_events` | Swipe-Aktionen |
| `lobby_accounts` | B2B Lobby Accounts |
| `admin_users` | Admin-Benutzer (TOTP) |
| `admin_audit_log` | Admin-Audit-Trail |
| `admin_ip_whitelist` | IP-Whitelist |
| `moderation_queue` | Moderationswarteschlange |
| `expert_nominations` | Experten-Nominierungen |
| `trust_score_history` | Trust-Score-Verlauf |
| `question_notification_requests` | Push-Abonnements |

---

## Sicherheitshinweise

1. **Admin-IPs whitelisten** vor dem ersten Login
2. **TOTP pflicht** – kein Admin-Zugang ohne 2FA
3. **K-Anonymität** – alle Lobby-Auswertungen erzwingen ≥ 20 Nutzer
4. **Service Role Key** – niemals im Frontend verwenden
5. **RLS aktivieren** – alle Tabellen mit Row-Level-Security
6. **Audit Log** – alle Admin-Aktionen werden protokolliert

---

## Deployment

| Komponente | Empfehlung |
|------------|-----------|
| Mobile App | App Store / Google Play via EAS Build |
| web-admin | Vercel (Domain: admin.rawlz.app) |
| web-lobby | Vercel (Domain: lobby.rawlz.app) |
| Backend | Supabase (managed) |

```bash
# Mobile Build & Submit
eas build --platform all
eas submit
```

---

*RAWLZ – Demokratie in Echtzeit.*
