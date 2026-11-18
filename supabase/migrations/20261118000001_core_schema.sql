-- =====================================================================
-- Shanyraq Hub — core schema (PROPOSAL, NOT APPLIED)
--
-- Status: reviewed against a local PostgreSQL 16 instance with a stubbed
-- Supabase `auth` schema. It has NOT been applied to any Supabase project.
-- Apply only after explicit approval, to a staging project first:
--   supabase link --project-ref <ref> && supabase db push
--
-- Design rules:
--   * Every balance (XP, coins) lives in `user_balances` and changes ONLY via
--     the SECURITY DEFINER function `private.grant_reward` (see 0003).
--   * Every reward has a unique idempotency key -> duplicates are impossible.
--   * Roles live in `user_roles`, never in `profiles`, so a user updating their
--     own profile can never touch their role.
--   * Timestamps are `timestamptz` (UTC); formatting happens in the client.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_role as enum ('member', 'organizer', 'moderator', 'admin', 'superadmin');
create type public.app_language as enum ('ru', 'kz', 'en');
create type public.direction_id as enum ('books', 'english', 'arabic', 'sport', 'art', 'intellect', 'networking', 'general');
create type public.event_format as enum ('offline', 'online');
create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
create type public.registration_status as enum ('registered', 'cancelled', 'waitlisted');
create type public.checkin_method as enum ('qr', 'manual');
create type public.reading_status as enum ('reading', 'completed');
create type public.review_aspect as enum ('communication', 'inspiration', 'knowledge', 'teamwork');
create type public.item_category as enum ('avatar', 'frame', 'artifact', 'aura', 'headwear');
create type public.item_rarity as enum ('common', 'rare', 'epic', 'legendary');
create type public.achievement_category as enum ('books', 'community', 'english', 'sport', 'general', 'challenges');
create type public.notification_type as enum (
  'event_reminder', 'new_event', 'forum_reply', 'achievement', 'broadcast',
  'review', 'coin_reward', 'level_up', 'registration', 'system'
);
create type public.reward_source as enum (
  'event_attendance', 'event_feedback', 'book_added', 'forum_topic', 'forum_reply',
  'forum_upvote_received', 'peer_review_given', 'peer_review_received',
  'achievement', 'shop_purchase', 'admin_adjustment'
);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  handle            extensions.citext not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name      text   not null check (char_length(display_name) between 1 and 80),
  avatar_url        text,
  bio               text   not null default '' check (char_length(bio) <= 1000),
  city              text   check (char_length(city) <= 80),
  telegram_handle   text   check (char_length(telegram_handle) <= 64),
  directions        public.direction_id[] not null default '{}',
  preferred_language public.app_language not null default 'ru',
  push_notifications_enabled     boolean not null default false,
  telegram_notifications_enabled boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.profiles is 'Public-facing member profile. Email lives in auth.users only.';

-- Private contact data: readable only by the owner and admins.
create table public.profile_contacts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  phone      text check (char_length(phone) <= 32),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.app_role not null default 'member',
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);

create table public.user_balances (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  xp         integer not null default 0 check (xp >= 0),
  coins      integer not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);
comment on table public.user_balances is 'Read-only for clients. Mutated exclusively by private.grant_reward().';

create table public.tiers (
  tier       text primary key,
  min_xp     integer not null unique check (min_xp >= 0),
  sort_order smallint not null unique,
  name_ru text not null, name_kz text not null, name_en text not null,
  coin_multiplier numeric(4,2) not null default 1.00 check (coin_multiplier between 1 and 5)
);

-- ---------------------------------------------------------------------
-- Ledger (XP + coins history, append-only)
-- ---------------------------------------------------------------------
create table public.reward_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  xp_delta        integer not null default 0,
  coin_delta      integer not null default 0,
  source          public.reward_source not null,
  source_id       text,
  reason          text not null,
  idempotency_key text not null unique,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (xp_delta <> 0 or coin_delta <> 0)
);
create index reward_ledger_user_idx on public.reward_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Events, registrations, attendance
-- ---------------------------------------------------------------------
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null check (char_length(title) between 3 and 200),
  direction             public.direction_id not null,
  starts_at             timestamptz not null,
  duration_minutes      integer not null default 90 check (duration_minutes between 15 and 1440),
  format                public.event_format not null default 'offline',
  location_address      text,
  location_details      text,
  online_url            text,
  description           text not null default '',
  required_materials    text[] not null default '{}',
  capacity              integer not null check (capacity between 1 and 10000),
  registration_deadline timestamptz,
  status                public.event_status not null default 'draft',
  speaker_name          text,
  speaker_role          text,
  speaker_avatar_url    text,
  speaker_bio           text,
  attendance_xp         integer not null default 60 check (attendance_xp between 0 and 1000),
  attendance_coins      integer not null default 40 check (attendance_coins between 0 and 1000),
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (registration_deadline is null or registration_deadline <= starts_at)
);
create index events_starts_at_idx on public.events (starts_at) where status = 'published';

create table public.event_registrations (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  status        public.registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  cancelled_at  timestamptz,
  primary key (event_id, user_id)          -- one row per user per event: no duplicates
);
create index event_registrations_user_idx on public.event_registrations (user_id);

-- Single-use, short-lived QR tickets. Only the SHA-256 hash is stored.
create table public.event_checkin_tokens (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  token_hash  bytea not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index event_checkin_tokens_lookup_idx on public.event_checkin_tokens (event_id, user_id);

create table public.event_attendance (
  event_id      uuid not null references public.events (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users (id) on delete set null,
  method        public.checkin_method not null,
  primary key (event_id, user_id)          -- attendance can only be recorded once
);
create index event_attendance_user_idx on public.event_attendance (user_id);

create table public.event_feedback (
  event_id     uuid not null references public.events (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  satisfaction smallint not null check (satisfaction between 1 and 5),
  usefulness   smallint not null check (usefulness between 1 and 5),
  comment      text not null default '' check (char_length(comment) <= 2000),
  created_at   timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id) references public.event_attendance (event_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Books & reviews
-- ---------------------------------------------------------------------
create table public.books (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 300),
  author     text not null check (char_length(author) between 1 and 200),
  genre      text,
  isbn       text unique,
  cover_color text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index books_title_author_uq on public.books (lower(title), lower(author));

create table public.user_books (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  book_id     uuid not null references public.books (id) on delete cascade,
  status      public.reading_status not null default 'reading',
  rating      smallint check (rating between 1 and 5),
  review      text check (char_length(review) <= 5000),
  finished_at date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, book_id)
);

create table public.peer_reviews (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  target_id  uuid not null references auth.users (id) on delete cascade,
  rating     smallint not null check (rating between 1 and 5),
  aspect     public.review_aspect not null,
  comment    text not null check (char_length(comment) between 1 and 2000),
  is_hidden  boolean not null default false,  -- moderation
  created_at timestamptz not null default now(),
  check (author_id <> target_id),
  unique (author_id, target_id, aspect)
);
create index peer_reviews_target_idx on public.peer_reviews (target_id);

-- ---------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------
create table public.achievements (
  id          text primary key,
  title_ru text not null, title_kz text not null, title_en text not null,
  description_ru text not null, description_kz text not null, description_en text not null,
  icon        text not null,
  category    public.achievement_category not null,
  -- Rule evaluated server-side against VERIFIED tables only, e.g.
  --   {"metric": "events_attended", "threshold": 5}
  --   {"metric": "books_completed", "threshold": 10, "direction": "books"}
  rule        jsonb not null,
  xp_reward   integer not null default 0 check (xp_reward >= 0),
  coin_reward integer not null default 0 check (coin_reward >= 0),
  is_active   boolean not null default true
);

create table public.user_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------
-- Shop & inventory
-- ---------------------------------------------------------------------
create table public.shop_items (
  id          text primary key,
  name_ru text not null, name_kz text not null, name_en text not null,
  description_ru text not null default '', description_kz text not null default '', description_en text not null default '',
  category    public.item_category not null,
  rarity      public.item_rarity not null,
  price_coins integer not null check (price_coins >= 0),
  preview_url text,
  style       jsonb not null default '{}',
  is_active   boolean not null default true
);

create table public.user_inventory (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     text not null references public.shop_items (id) on delete restrict,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.user_equipment (
  user_id  uuid not null,
  category public.item_category not null,
  item_id  text not null,
  primary key (user_id, category),
  foreign key (user_id, item_id) references public.user_inventory (user_id, item_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Forum
-- ---------------------------------------------------------------------
create table public.forum_categories (
  id        text primary key,
  name_ru text not null, name_kz text not null, name_en text not null,
  sort_order smallint not null default 0
);

create table public.forum_topics (
  id          uuid primary key default gen_random_uuid(),
  category_id text not null references public.forum_categories (id),
  direction   public.direction_id,
  author_id   uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 200),
  content     text not null check (char_length(content) between 1 and 20000),
  is_pinned   boolean not null default false,
  is_closed   boolean not null default false,
  is_hidden   boolean not null default false,
  view_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index forum_topics_category_idx on public.forum_topics (category_id, created_at desc);

create table public.forum_replies (
  id         uuid primary key default gen_random_uuid(),
  topic_id   uuid not null references public.forum_topics (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 10000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index forum_replies_topic_idx on public.forum_replies (topic_id, created_at);

create table public.forum_topic_votes (
  topic_id   uuid not null references public.forum_topics (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (topic_id, user_id)
);

create table public.forum_reply_votes (
  reply_id   uuid not null references public.forum_replies (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

-- ---------------------------------------------------------------------
-- Chat rooms (existing UI feature; real E2EE is out of scope here)
-- ---------------------------------------------------------------------
create table public.chat_rooms (
  id          uuid primary key default gen_random_uuid(),
  title_ru text not null, title_kz text not null, title_en text not null,
  description_ru text not null default '', description_kz text not null default '', description_en text not null default '',
  direction   public.direction_id,
  min_role    public.app_role not null default 'member',
  created_at  timestamptz not null default now()
);

create table public.chat_messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages (room_id, created_at);

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text not null,
  link_tab   text,
  meta       jsonb not null default '{}',
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Queue drained by a scheduled Edge Function (pg_cron -> send-reminders).
create table public.scheduled_notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid references public.events (id) on delete cascade,
  kind        text not null check (kind in ('event_24h', 'event_2h')),
  send_at     timestamptz not null,
  sent_at     timestamptz,
  attempts    smallint not null default 0,
  last_error  text,
  unique (user_id, event_id, kind)
);
create index scheduled_notifications_due_idx on public.scheduled_notifications (send_at) where sent_at is null;

create table public.broadcasts (
  id               uuid primary key default gen_random_uuid(),
  sender_id        uuid references auth.users (id) on delete set null,
  title            text not null,
  body             text not null,
  channels         text[] not null check (channels <@ array['push', 'telegram', 'whatsapp', 'in_app']),
  target_direction public.direction_id,
  recipients_count integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Audit log (append-only, written by SECURITY DEFINER functions only)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch      before update on public.profiles      for each row execute function private.touch_updated_at();
create trigger contacts_touch      before update on public.profile_contacts for each row execute function private.touch_updated_at();
create trigger events_touch        before update on public.events        for each row execute function private.touch_updated_at();
create trigger user_books_touch    before update on public.user_books    for each row execute function private.touch_updated_at();
create trigger forum_topics_touch  before update on public.forum_topics  for each row execute function private.touch_updated_at();
create trigger forum_replies_touch before update on public.forum_replies for each row execute function private.touch_updated_at();
