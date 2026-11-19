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
- `supabase/seed.sql`: reference data generated by `scripts/generate-seed.ts` from `src/data/gamification.ts` and `src/data/achievements.ts` (tiers, 34 achievements, shop items, forum categories). **No users and no demo activity.**
- `supabase/tests/`: local test harness

**How it was tested:** I applied all three migrations and the seed to a throwaway local **PostgreSQL 16** with a stubbed Supabase `auth` schema and the `anon` / `authenticated` / `service_role` roles. Then I ran **90 security and behaviour checks** as impersonated users, the same way PostgREST runs requests. **All 90 passed.** Reproduce with `supabase/tests/run-local.sh`.

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
3. **Achievements are computed only from verified tables.** 30 of the 34 unlock automatically from attendance, books (with a 100+ char review, one per week), reviews, forum activity, the daily and weekly activity streaks, and hosting (events with 3+ verified attendees; well-rated = 3+ reviews averaging 4.5+). Four achievements (speech, Tarlan run, quiz podium, 30-day streak) cannot be measured automatically. They are marked `manual`, and a moderator awards them through `award_achievement()`, which is audited and cannot be self-awarded.
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

---

## 12. Phase 2 audit (2026-11-19)

The ChatGPT "Phase 2" prompt was reviewed and adopted as a plan with corrections (see the conversation log). Findings that were checked, not assumed:

### GitHub (verified)
- The code lives in **`Zhandos-Makhuov/shanyraqhub`** (chosen as the main repository). The prompt named `Zhandos-Makhuov/shanyraq.hub`: that repository, and `Zhandos-Makhuov/shanyraq`, are **empty** (no commits). Archive or delete them to avoid confusion.
- `main` has only the first 3 commits. All later work is on `claude/sleepy-brown-4zolp6` and is **not merged**, because the hosting of the published version is unknown. If hosting deploys from `main` automatically, merging would update the live site.
- A scan of the full history of every branch found **no secrets**: no API keys, no Supabase keys, no `.env` files. Only `.env.example` is tracked.

### Demo vs live data (implemented)
- **Data source switch.** `VITE_DATA_SOURCE=demo` (default) or `live`, defined in `src/config/runtime.ts`.
- **Demo data is a dynamic import** (`src/data/sources.ts` → `src/data/mockData.ts`). A live build does not contain it at all; this was verified by searching the built files for demo names.
- **Separate browser storage.** Demo uses `shanyraq_hub_app_state_v1_*`, live uses `shanyraq_hub_live_v1_*`. The "reset demo data" button exists only in demo mode and touches only demo keys.
- **Live mode starts empty.** It has only the visitor's own new-member profile: no "Демо" badge, no "Demo Environment" footer, no account switcher. The data-status dialog states honestly that the server is not connected yet.
- **Reference data moved out of the demo file**: `src/data/directions.ts` and `src/data/newMember.ts`.
- **Every tab and sub-tab was checked in live mode with empty data**, as a member and as a super admin, with no errors. Closed chat rooms gained an empty state; it previously crashed.

### Fabricated statistics (removed)
These numbers were shown in every mode and are now computed only from real data (`src/utils/communityStats.ts`):

| Shown as | Previously |
|---|---|
| Members | users × 28 + 14 |
| Books | books × 4 + 18 |
| Visits | visits × 12 + 64 |
| Events held | events + 24 |
| Satisfaction | always "4.96" |
| Members caption | always "+18% this month" |
| Events caption | always "100% speaker turnout" |
| Visits caption | always "average turnout 89%" |
| Books caption | always "rating 4.9★" |
| Reach per direction | a hard-coded list of percentages |
| Attendance rate | "100%" when there were no registrations |

Captions that judged the club regardless of data, such as "high club discipline", were replaced with neutral descriptions. Empty data shows "—".

### Still open from the prompt
- Schema additions: `moderation_reports`, `user_preferences`, and Storage buckets and policies for avatars, book covers and event photos.
- Supabase project (created by the owner), the auth UI, and the live data layer.
- A decision on hosting, then merging into `main`.

## 13. Phase 3 — database foundation (2026-11-19)

**Status:** written and verified on a local PostgreSQL 16 with a stubbed Supabase `auth` + `storage`.
**Not applied to any Supabase project** (none is connected). 144 checks in `supabase/tests/security_tests.sql` pass.

### Mapping of the Phase 3 prompt to the existing schema (no duplicate tables)
| Prompt table | Implemented as |
|---|---|
| profiles | `profiles` (username = `handle`) |
| user_preferences | **new** `user_preferences` (auto-created per profile) |
| events / event_registrations / event_attendance / event_feedback | existing tables (events got `cover_url`) |
| books / reading_records / book_reviews | `books` (+ `cover_url`), `user_books` (status, rating, review) |
| user_xp / user_levels / coin_transactions | `user_balances` + `tiers` + `reward_ledger` (balances == SUM(ledger), tested) |
| user_inventory / shop_items / achievements / user_achievements | existing tables |
| community_directions / memberships | **new** tables |
| — | **new** `moderation_reports`, Storage buckets `avatars`, `book-covers`, `event-photos` |

### New migration `20261119000001_phase3_community.sql` (additive only)
- **Directions & memberships.** Joining a direction requires approval (owner decision; per-direction `requires_approval` flag, admin-editable). Statuses `pending → active | rejected`, `active → left | removed`; one row per user+direction. RPCs: `request_membership`, `leave_membership`, `review_membership`, `remove_member`, `set_direction_lead`. Leads approve only in their direction and never themselves; re-apply after rejection only after 7 days; removed members need a moderator. `profiles.directions` is now read-only for clients and synced from active memberships by a trigger.
- **User preferences:** notification types, e-mail, reminder lead time, quiet hours, leaderboard visibility. Own row only.
- **Moderation reports:** `report_content` validates the target and its author, blocks reporting own content, de-duplicates open reports, 20 per day; `resolve_report` for moderator+ (not about themselves), audited.
- **Storage:** avatars — own folder `<user_id>/…`; book covers — moderator+; event photos — folder `<event_id>/…`, the event's organizer or moderator+. 2–5 MB, JPEG/PNG/WebP.
- RLS enabled on all new tables; all writes to memberships/reports go through SECURITY DEFINER RPCs; no `using (true)` on writes.

### Frontend compatibility layer
`src/data/supabase/rows.ts` (row types) and `src/data/supabase/adapters.ts` (rows → `UserProfile`, `CommunityEvent`, `ReadBook`…). Handles: `superadmin`↔`super_admin`, `starts_at` → Almaty date/time, registrations/attendance tables → id lists, feedback key `<event_id>:<user_id>`, tier from XP, reputation derived. Verified against rows exported from the test database (all checks pass). Not imported by the app yet → current demo/live bundles unchanged.

### Known gaps / next
- Profile screen still edits directions freely (demo/localStorage). In live mode it must call `request_membership` (stage 6).
- New direction ids need `alter type public.direction_id add value …` (one-line migration).
- Uploading files from the UI is not wired (stage 6).
- `supabase db lint` and real Storage behaviour can only be checked on a real (test) Supabase project (stage 4).

## 14. Stage 4 — schema applied to the TEST Supabase project (2026-11-19)
Project `shanyraq-hub-test` (ref `fwhcaspbbktgpjiskpln`, Frankfurt, **PostgreSQL 17.12**). Production is untouched (there is no production project yet). Access: Management API, token injected by the environment proxy.

### What was done
1. **Dry run first:** all 4 migrations + `seed.sql` + all security tests in one transaction that ends with a deliberate exception → nothing committed. Result: 144/144 checks pass on PG 17.
2. **Applied** each migration in its own atomic transaction via `POST /v1/projects/{ref}/database/query`, recording it in `supabase_migrations.schema_migrations` (the table the Supabase CLI uses) **with the version from the file name** (`20261118000001`…`20261119000001`). The `/database/migrations` endpoint was not used because it assigns its own timestamp as version, which would desync `supabase db push`/`migration list` from the repo.
3. **Seed** (reference data only, idempotent `on conflict`): 6 tiers, 34 achievements, 13 shop items, 7 forum categories, 7 directions. No users, no demo data.
4. **Checks against the applied schema** (rolled back): 144/144 pass. After every run: 0 users, no schema `t`, 0 storage objects.
5. State: 37 tables in `public`, RLS enabled on all of them, 3 storage buckets.

### Real-Supabase difference found
`storage.objects` has trigger `protect_objects_delete` (`storage.protect_delete()`): SQL `DELETE` is refused unless `storage.allow_delete_query = 'true'` (the Storage API sets it). RLS still applies. The cloud test sets the flag transaction-locally for its one delete check; the app must delete files via the Storage API (supabase-js `storage.remove`), never SQL.

### Lint (`plpgsql_check` 2.8 — what `supabase db lint` uses; 41 plpgsql functions)
- **Errors: none.**
- Warnings (harmless, left as is): implicit casts `text → registration_status/membership_status` (string literals in CASE), `bigint/numeric → integer` (count(*)/round into int vars), unused `p_finished_at` in `save_user_book` (intentional: kept for signature compatibility; the server sets the finish date).

### Supabase advisors
- Security: 24 × WARN `authenticated_security_definer_function_executable` — **intentional**: these are the app's RPC API; each checks the caller's role inside (`private.require_role`, ownership checks), covered by tests. `anon` cannot execute any of them (no anon lint). 2 × INFO `rls_enabled_no_policy` (`event_checkin_tokens`, `scheduled_notifications`) — intentional deny-all, only SECURITY DEFINER functions touch them.
- Performance: 25 × INFO `unindexed_foreign_keys` (mostly audit columns like `created_by`, `decided_by`), 8 × INFO `unused_index` (empty DB — expected), 4 × WARN `multiple_permissive_policies` (`achievements`, `chat_rooms`, `forum_categories`, `shop_items`: `*_read` + `*_admin` both apply to SELECT). Not a problem at club scale; optional follow-up migration.

### Re-running checks
`python3 supabase/tests/run-cloud.py tests|dryrun|lint` — non-destructive (single transaction, always rolled back). `dryrun` applies only migrations not yet recorded in `schema_migrations`. Never run `run-local.sh` against Supabase.
