# Shanyraq Hub — Architecture Audit & Production Readiness

Audit date: 2026-11-18 · Branch: `claude/sleepy-brown-4zolp6` · Base commit: `14c716e`

Everything below was checked against the code in this repository. Results are labelled:

- **Verified** — I ran it or read the code path end to end.
- **Proposed** — written and tested locally, but not connected to the app or to any Supabase project.
- **Not done** — work that is still to do.

No production database was created, changed or reset. No application code in `src/` was changed.

---

## 1. Current architecture (verified)

| Layer | What exists |
|---|---|
| Build | Vite 8 + React 19 + TypeScript + Tailwind 4. Single-page app; navigation is a `activeTab` state switch (no router, no URLs per page). |
| State | One React context, `src/context/AppContext.tsx` (~900 lines), holds **all** data and **all** business logic. |
| Persistence | `localStorage` only, under keys `shanyraq_hub_app_state_v1_*`. Each browser has its own separate copy of the data. |
| Data source | `src/data/mockData.ts` (demo users, events, forum, chats, transactions, notifications) and `src/data/gamification.ts` (tiers, shop items, achievements). |
| Backend | **None.** No API calls, no `fetch`, no Supabase/Firebase client, no server. |
| Auth | **None.** The first demo user (a super admin) is active by default. The header has a user switcher (`Header.tsx:268`) that lets anyone become any user, including super admin. |
| PWA | `public/manifest.json` and `public/sw.js` exist and the service worker is registered in `index.html`. |

`bun run lint` (`tsc --noEmit`) and `bun run build` both **passed** when I ran them. The production bundle is a single JS chunk of 490 KB (133 KB gzipped). Vite warns that `__dirname` in `vite.config.ts` will not work with its future native config loader.

### Leftovers from the AI Studio template (removed)
- The unused dependencies `@google/genai`, `express`, `dotenv` and `@types/express` were removed; the package is now named `shanyraq-hub`.
- `metadata.json` no longer declares `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` (there is no server and no Gemini usage).
- `.env.example` lists only the Supabase, VAPID, demo-mode and Telegram variables. If AI features are added later, call the model from a server-side function (e.g. a Supabase Edge Function), never from the browser.

## 2. Existing backend connections

**There are none.** Supabase is **not configured and not connected**:
- `@supabase/supabase-js` is not in `package.json`.
- There is no `supabase/config.toml` and no linked project.
- There are no `VITE_SUPABASE_*` variables.

`DemoStatusModal.tsx` shows Supabase as "Готов к подключению (.env)", but no code reads such a `.env`. Treat that label as aspirational, not as a working integration.

## 3. Mock vs real functionality

| Feature | Status | Notes |
|---|---|---|
| Users / profiles | Mock + localStorage | Seeded from `INITIAL_USERS`. Profile edits change only the local copy. |
| Login / registration / password reset / email verification | **Missing** | No UI and no logic. |
| Events: list / create | Mock + localStorage | `createEvent` is local. Any staff role can create events. |
| Event registration / cancel | Local only | Capacity is enforced only by a disabled button (`EventsView.tsx:350`). `registerForEvent` (`AppContext.tsx:257`) does not check capacity or the deadline. |
| QR check-in | **Simulated** | "Scan" is a `setTimeout` (`AttendanceView.tsx:44`). Any user can pick **any member** from a dropdown and credit them with attendance and rewards. |
| Event feedback | Local | Only hidden in the UI after it is submitted. The context function itself accepts repeats when no attendance record exists. |
| Library (books) | Local | Each book added gives +50 XP / +30 coins, with no limit (`AppContext.tsx:507`). |
| Achievements | **Static** | Demo users get `ALL_ACHIEVEMENTS.slice(0, N)`. No code ever unlocks an achievement from activity. |
| XP / coins / tiers | Client-side arithmetic | `addXpAndCoins` (`AppContext.tsx:190`). The coin transaction list is display-only and is not the source of truth. |
| Shop / inventory | Local | Reads the balance from a possibly stale `currentUser`. Uses `alert()`. |
| Forum | Local | Upvoting a reply pays the author **every time it is toggled on** (`AppContext.tsx:594`), so rewards can be farmed. Self-upvotes are allowed. |
| Peer reviews | Local | Unlimited reviews of the same person, each paying both sides (`AppContext.tsx:806`). Self-review is blocked only in the UI. |
| Chats ("E2EE") | **Simulated** | `utils/crypto.ts` is an XOR obfuscation, not encryption. The plaintext is stored next to it. The UI says "E2EE Security" / "E2EE Active". |
| In-app notifications | Local | The header list shows **all users'** notifications (`Header.tsx:183`); only the badge count is filtered. `markAllNotificationsAsRead` marks every user's notifications. |
| Browser notifications | Partly real | `new Notification(...)` works while the tab is open. There is no push subscription, no server, and no `push` handler in the service worker. |
| Telegram / WhatsApp | Text formatting only | Nothing is sent. |
| Calendar `.ics` export | **Real** | Works client-side. |
| Admin: roles, coin adjustments, broadcasts | Local, unprotected | Any staff role, including organizer, can make anyone a super admin (`AdminView.tsx:259`). Audit logs are **not saved** to localStorage (there is no save effect for `_audits`). |
| Attendance streak | Hard-coded | Always shows "14" (`AttendanceView.tsx:108`). |
| Timestamps | Display strings | e.g. `'Только что'`, `toLocaleDateString`. They cannot be sorted or time-zone converted. |

## 4. Database schema proposal (proposed)

Files:
- `supabase/migrations/20261118000001_core_schema.sql`: tables, enums and constraints
- `supabase/migrations/20261118000002_functions.sql`: role helpers, reward ledger and RPCs
- `supabase/migrations/20261118000003_rls_policies.sql`: RLS and column-level grants
- `supabase/seed.sql`: reference data generated by `scripts/generate-seed.ts` from `src/data/gamification.ts` and `src/data/achievements.ts` (tiers, 25 achievements, shop items, forum categories). **No users and no demo activity.**
- `supabase/tests/`: local test harness

**How it was tested:** I applied all three migrations and the seed to a throwaway local **PostgreSQL 16** with a stubbed Supabase `auth` schema and the `anon` / `authenticated` / `service_role` roles. Then I ran **68 security and behaviour checks** as impersonated users, the same way PostgREST runs requests. **All 68 passed.** Reproduce with `supabase/tests/run-local.sh`.

This was **not** run on real Supabase. Real Supabase has extra default grants and its own `auth.users` columns, so the first apply must happen on a staging project.

### Entities
```
auth.users ─┬─ profiles (public profile, handle unique)        profile_contacts (phone; owner/admin only)
            ├─ user_roles (member|organizer|moderator|admin|superadmin)
            ├─ user_balances (xp, coins ≥ 0)  ◄── only private.grant_reward()
            └─ reward_ledger (append-only, idempotency_key UNIQUE)
tiers (min_xp, coin_multiplier)

events ─┬─ event_registrations   PK(event_id, user_id)   status registered|cancelled
        ├─ event_checkin_tokens  sha256(token) UNIQUE, expires_at, used_at
        ├─ event_attendance      PK(event_id, user_id)   method qr|manual
        └─ event_feedback        PK(event_id, user_id)  FK→event_attendance
books ── user_books UNIQUE(user_id, book_id)
peer_reviews CHECK(author≠target) UNIQUE(author, target, aspect)
achievements (rule jsonb) ── user_achievements PK(user, achievement)
shop_items ── user_inventory PK(user, item) ── user_equipment PK(user, category)
forum_categories ── forum_topics ── forum_replies ; forum_topic_votes / forum_reply_votes PK(item, user)
chat_rooms (min_role) ── chat_messages
notifications UNIQUE(user, dedupe_key) ; push_subscriptions ; scheduled_notifications UNIQUE(user, event, kind)
broadcasts ; audit_logs
view member_stats (leaderboard: xp, coins, tier, reputation derived)
```

### Main design decisions
1. **Balances cannot be written by clients at all.** Table grants are revoked. Every change goes through `private.grant_reward()`, which writes a ledger row with a unique idempotency key. Example keys: `attendance:<event>:<user>`, `reply_upvote:<reply>:<voter>`, `purchase:<item>:<user>`. Duplicate rewards are therefore rejected by the database itself. A test checks that every user's balance equals the sum of their ledger rows.
2. **Roles are in a separate table** from profiles. Updating your own profile cannot change your role. Admins can only assign roles below their own rank. Superadmin is required to create admins, and the last superadmin cannot be demoted.
3. **Achievements are computed only from verified tables.** 21 of the 25 unlock automatically from attendance, books, reviews, forum activity and the daily activity streak. Four achievements (speech, Tarlan run, quiz podium, 30-day streak) cannot be measured automatically. They are marked `manual`, and a moderator awards them through `award_achievement()`, which is audited and cannot be self-awarded.
4. **Self-reported activity is rate-limited.** Book, forum and review rewards have daily caps. Rewards survive delete-and-repost but are never paid twice.
5. **Reputation is computed, not stored**: `xp/2 + 3 × rating` over visible reviews. This keeps the current formula without the risk of the stored value drifting.
6. Behaviour that is **kept from the current app**: attendance +60 XP / +40 coins; feedback +30/+20; book +50/+30; topic +30/+15; reply +20/+10; upvote received +15/+10; review +40/+25 (receiver) and +20/+10 (author); shop purchase +25 XP.
7. **Tier bonus on attendance coins** (decided): silver +10%, gold +15%, platinum +20%, titanium +25%, tengri +30% (`tiers.coin_multiplier`, generated from `TIERS` in `src/data/gamification.ts`).

## 5. Authentication plan (not done)
Use Supabase Auth with email and password:
- `signUp` with `emailRedirectTo` = `${VITE_APP_URL}/auth/callback`
- Enable **Confirm email** in the dashboard
- `resetPasswordForEmail` and then `updateUser({ password })` on the recovery link
- Sessions persist through supabase-js and refresh automatically. Listen to `onAuthStateChange`.

The `on_auth_user_created` trigger creates the profile, role, balance and contact rows when a user signs up.

Before email works in production, set up a **custom SMTP sender**. Supabase's built-in email is rate-limited and not meant for production. Also add the production URL to the Auth "Redirect URLs" list.

The first superadmin must be promoted by hand in the SQL editor:
```sql
update public.user_roles set role = 'superadmin' where user_id = '<uuid>';
```

## 6. Authorization & security gaps (current app)
| # | Severity | Gap |
|---|---|---|
| 1 | Critical | No authentication; anyone can switch to the super admin account (`Header.tsx:268`). |
| 2 | Critical | All permissions are checked only in the client. Hiding a tab is not authorization. |
| 3 | Critical | Any user can credit attendance to any user (`AttendanceView.tsx`). |
| 4 | High | Rewards can be farmed: forum upvote toggling, unlimited peer reviews, unlimited books. |
| 5 | High | Any staff role can grant super admin (`AdminView.tsx:259`). |
| 6 | High | "E2EE" is XOR obfuscation and the plaintext is stored alongside it. The UI claims are misleading. Real E2EE needs per-device keys and a key-exchange design. The proposed `chat_messages` table is ordinary server-readable storage protected by RLS. |
| 7 | Medium | The notification dropdown shows other users' notifications. |
| 8 | Medium | Audit logs are not persisted, and they can be edited by anyone with DevTools. |
| 9 | Medium | Demo data includes realistic-looking emails and phone numbers (`mockData.ts`). It must not be imported into production. |
| 10 | Low | The service worker is cache-first for **everything**, including `index.html`. Users will be served stale builds after a deploy (see §8). |

The proposed backend closes gaps 1–5, 7 and 8 **on the server side**. They are only closed in practice once the frontend calls these RPCs instead of `AppContext`. **No service-role key appears anywhere in `src/`**, and none should be added: the service-role key belongs only in Edge Functions.

## 7. Notifications architecture (proposed)
- **In-app:** the `notifications` table, with RLS limiting each user to their own rows and `dedupe_key` preventing duplicates. Add Supabase Realtime on `notifications` (filter `user_id=eq.<uid>`) to update the bell icon live.
- **Event reminders:** `register_for_event` adds 24 h and 2 h reminders to `scheduled_notifications`, and cancelling removes them. A `pg_cron` job (every 5 min) calls an Edge Function that:
  1. calls `claim_due_notifications()` (service role only; uses `FOR UPDATE SKIP LOCKED`),
  2. inserts in-app notifications,
  3. sends Web Push,
  4. sets `sent_at`.
- **Browser push:** generate VAPID keys and subscribe through the service worker with `pushManager.subscribe`. Store the subscription in `push_subscriptions`. The service worker needs `push` and `notificationclick` handlers, which `sw.js` does not have yet. iOS supports push only for a PWA **installed to the home screen** (iOS 16.4+).
- **Telegram:** an Edge Function holding `TELEGRAM_BOT_TOKEN` reads `broadcasts`. Users must first link a chat with the bot (`/start` deep link). A typed handle is not enough. **Not designed in the schema yet.**

## 8. PWA & deployment (verified findings)
- The manifest declares the icon as `192x192` and `512x512`, but the PNG is actually **1563×1563**. Export real 192 and 512 PNGs, and give maskable icons a separate entry instead of `"any maskable"`.
- `sw.js` is cache-first for every GET, including the HTML and cross-origin requests, and its cache name is fixed at `v1`. After a deploy, users keep the old `index.html`. Use network-first for navigations, cache-first only for hashed `/assets/*`, and never cache Supabase API calls. `vite-plugin-pwa` (Workbox) handles this automatically.
- Service workers and Web Push need **HTTPS**; only `localhost` is exempt. Camera access for QR scanning (`getUserMedia`) also needs HTTPS.
- SPA hosting needs a fallback that sends all routes to `index.html`. This matters once auth callback routes such as `/auth/callback` are added.
- Hosts that work for this app: Vercel, Netlify or Cloudflare Pages for the static `dist/`, plus Supabase for the backend. Use build command `bun run build` (or `npm run build`) and output directory `dist`.
- Add a GitHub Actions workflow running `lint` and `build` on PRs. Optionally run `supabase/tests/run-local.sh` against a Postgres service container.

## 9. Required environment variables
| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | no |
| `VITE_SUPABASE_ANON_KEY` | frontend | no (protected by RLS) |
| `VITE_VAPID_PUBLIC_KEY` | frontend | no |
| `VITE_APP_URL` | frontend | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only | **yes** |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Edge Functions | **yes** |
| `TELEGRAM_BOT_TOKEN` | Edge Functions | **yes** |
| SMTP credentials | Supabase Auth dashboard | **yes** |

## 10. Implementation priorities
1. **Approve the schema.** Create a **staging** Supabase project, apply the migrations and seed, and run the Supabase security advisor (`supabase db lint`).
2. **Add a data layer without changing the UI.** Add `@supabase/supabase-js` and `src/lib/supabase.ts`. Re-implement the `AppContext` functions on top of the RPCs, keeping the **same function names and signatures** so the components stay unchanged. Keep a `VITE_DEMO_MODE` flag so the current localStorage demo still works.
3. **Auth screens:** sign up, sign in, verify email, forgot and reset password. Remove the user switcher outside demo mode.
4. **Events and QR:** the member shows a QR code from `issue_checkin_token` (refreshing every few minutes). Staff scan it with the camera (e.g. a `BarcodeDetector` or `@zxing` library) and call `check_in_with_token`.
5. **Fix client issues that exist today:** filter the notification list per user, persist or remove the local audit log, and correct the "E2EE" wording.
6. **Notifications:** in-app with Realtime, then the reminder cron job and Web Push. Telegram last.
7. **PWA:** replace the service worker (Workbox), add proper icons, deploy on HTTPS, add CI.

## 11. Remaining deployment requirements
- A Supabase project (staging and production), with custom SMTP, redirect URLs, and backups or PITR on the paid tier.
- A hosting account, a domain and HTTPS.
- VAPID keys; a Telegram bot, if wanted.
- A privacy policy and consent text, because the app collects personal data (email, phone, city).
- A decision on what happens to existing demo data. Recommendation: **do not migrate it**, because it is fictional.
- **Not load-tested:** the capacity check depends on a row lock (`SELECT … FOR UPDATE`) that serialises concurrent registrations. That is correct by design, but I did not run a concurrency benchmark.
