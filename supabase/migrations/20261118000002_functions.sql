-- =====================================================================
-- Shanyraq Hub — server-side business logic (PROPOSAL, NOT APPLIED)
--
-- All functions are SECURITY DEFINER with an empty search_path, so every
-- object reference is schema-qualified. Internal helpers live in the
-- `private` schema, which is not exposed through the Supabase API.
-- Public RPCs re-check the caller's identity and role on every call:
-- the UI hiding a button is never treated as authorization.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
create function private.role_rank(r public.app_role) returns int
language sql immutable set search_path = '' as $$
  select case r
    when 'member'     then 0
    when 'organizer'  then 1
    when 'moderator'  then 2
    when 'admin'      then 3
    when 'superadmin' then 4
  end
$$;

create function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select ur.role from public.user_roles ur where ur.user_id = (select auth.uid())),
    'member'::public.app_role)
$$;

-- True when the caller's role is at least `min_role`.
create function private.has_role(min_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and private.role_rank(private.current_app_role()) >= private.role_rank(min_role)
$$;

create function private.require_role(min_role public.app_role) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.has_role(min_role) then
    raise exception 'forbidden: requires role %', min_role using errcode = '42501';
  end if;
  return uid;
end $$;

-- ---------------------------------------------------------------------
-- Audit + notifications
-- ---------------------------------------------------------------------
create function private.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'));
$$;

create function private.notify(
  p_user uuid, p_type public.notification_type, p_title text, p_body text,
  p_link_tab text default null, p_meta jsonb default '{}', p_dedupe_key text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link_tab, meta, dedupe_key)
  values (p_user, p_type, p_title, p_body, p_link_tab, coalesce(p_meta, '{}'), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing;
$$;

-- ---------------------------------------------------------------------
-- New user bootstrap (fires when Supabase Auth creates a user)
-- ---------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_handle text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'handle', ''), '[^a-zA-Z0-9_]', '', 'g'));
  v_name   text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if char_length(v_handle) < 3 or char_length(v_handle) > 30
     or exists (select 1 from public.profiles p where p.handle = v_handle) then
    v_handle := 'user_' || right(replace(new.id::text, '-', ''), 12);
    if exists (select 1 from public.profiles p where p.handle = v_handle) then
      v_handle := 'user_' || right(replace(new.id::text, '-', ''), 25);   -- 100 random bits
    end if;
  end if;

  insert into public.profiles (id, handle, display_name)
  values (new.id, v_handle, left(coalesce(v_name, split_part(coalesce(new.email, ''), '@', 1), 'Member'), 80));
  insert into public.user_roles (user_id, role) values (new.id, 'member');
  insert into public.user_balances (user_id) values (new.id);
  insert into public.profile_contacts (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- Tiers & rewards (the ONLY code path that changes XP/coins)
-- ---------------------------------------------------------------------
create function private.tier_for_xp(p_xp int) returns text
language sql stable security definer set search_path = '' as $$
  select t.tier from public.tiers t where t.min_xp <= p_xp order by t.min_xp desc limit 1
$$;

-- Returns true if the reward was applied, false if this idempotency key was
-- already used (duplicate request / double click / replayed QR).
-- Raises check_violation (23514) if a spend would make coins negative.
create function private.grant_reward(
  p_user uuid, p_xp int, p_coins int, p_source public.reward_source,
  p_source_id text, p_reason text, p_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_ledger_id bigint;
  v_old_xp int;
  v_new_xp int;
  v_old_tier text;
  v_new_tier text;
begin
  if coalesce(p_xp, 0) = 0 and coalesce(p_coins, 0) = 0 then
    return false;
  end if;

  insert into public.reward_ledger (user_id, xp_delta, coin_delta, source, source_id, reason, idempotency_key, created_by)
  values (p_user, coalesce(p_xp, 0), coalesce(p_coins, 0), p_source, p_source_id, p_reason, p_key, auth.uid())
  on conflict (idempotency_key) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return false;
  end if;

  select b.xp into v_old_xp from public.user_balances b where b.user_id = p_user for update;
  if not found then
    raise exception 'balance row missing for user %', p_user;
  end if;

  update public.user_balances b
     set xp = greatest(0, b.xp + coalesce(p_xp, 0)),
         coins = b.coins + coalesce(p_coins, 0),   -- CHECK (coins >= 0) rejects overspend
         updated_at = now()
   where b.user_id = p_user
  returning b.xp into v_new_xp;

  v_old_tier := private.tier_for_xp(v_old_xp);
  v_new_tier := private.tier_for_xp(v_new_xp);
  if v_new_tier is distinct from v_old_tier and v_new_xp > v_old_xp then
    perform private.notify(p_user, 'level_up', 'Повышение клубного ранга!',
      format('Поздравляем! Ваш статус повышен: %s', v_new_tier), 'profile',
      jsonb_build_object('tier', v_new_tier), 'tier:' || v_new_tier);
  end if;
  return true;
end $$;

create function private.coin_multiplier(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select t.coin_multiplier from public.user_balances b
      join public.tiers t on t.tier = private.tier_for_xp(b.xp)
     where b.user_id = p_user), 1.0)
$$;

-- ---------------------------------------------------------------------
-- Achievements: evaluated only from verified tables
-- ---------------------------------------------------------------------
-- Distinct local days (Asia/Almaty) with real activity, as in src/utils/streak.ts.
create function private.activity_days(p_user uuid) returns setof date
language sql stable security definer set search_path = '' as $$
  select distinct (ts at time zone 'Asia/Almaty')::date from (
    select checked_in_at as ts from public.event_attendance where user_id = p_user
    union all select created_at from public.event_feedback where user_id = p_user
    union all select created_at from public.user_books where user_id = p_user
    union all select created_at from public.forum_topics where author_id = p_user
    union all select created_at from public.forum_replies where author_id = p_user
    union all select created_at from public.peer_reviews where author_id = p_user
  ) t
$$;

-- Consecutive active days ending today (or yesterday if nothing happened yet today).
create function private.activity_streak(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  with days as (select d from private.activity_days(p_user) as d),
  anchor as (
    select case when exists (select 1 from days where d = (now() at time zone 'Asia/Almaty')::date)
                then (now() at time zone 'Asia/Almaty')::date
                else (now() at time zone 'Asia/Almaty')::date - 1 end as a
  ),
  ranked as (
    select (select a from anchor) - d as back, row_number() over (order by d desc) - 1 as rn
      from days where d <= (select a from anchor)
  )
  select count(*)::int from ranked where back = rn
$$;

-- Consecutive Mon–Sun weeks with at least one active day, ending this week
-- (or last week if nothing happened yet this week). Fits weekly club meetings.
create function private.activity_week_streak(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  with weeks as (
    select distinct date_trunc('week', d)::date as w from private.activity_days(p_user) as d
  ),
  this_week as (select date_trunc('week', (now() at time zone 'Asia/Almaty')::date)::date as w),
  anchor as (
    select case when exists (select 1 from weeks where w = (select w from this_week))
                then (select w from this_week) else (select w from this_week) - 7 end as a
  ),
  ranked as (
    select ((select a from anchor) - w) / 7 as back, row_number() over (order by w desc) - 1 as rn
      from weeks where w <= (select a from anchor)
  )
  select count(*)::int from ranked where back = rn
$$;

create function private.achievement_metric(p_user uuid, p_rule jsonb) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  v_metric text := p_rule ->> 'metric';
  v_dir public.direction_id := nullif(p_rule ->> 'direction', '')::public.direction_id;
begin
  case v_metric
    when 'events_attended' then
      return (select count(*) from public.event_attendance a
                join public.events e on e.id = a.event_id
               where a.user_id = p_user and (v_dir is null or e.direction = v_dir));
    when 'books_completed' then
      -- finished books with a 100+ char review, at most one per week
      return (select count(distinct date_trunc('week', ub.finished_at)) from public.user_books ub
               where ub.user_id = p_user and ub.status = 'completed'
                 and char_length(coalesce(trim(ub.review), '')) >= 100);
    when 'positive_reviews_received' then
      return (select count(*) from public.peer_reviews r
               where r.target_id = p_user and r.rating >= 4 and not r.is_hidden);
    when 'forum_replies' then
      return (select count(*) from public.forum_replies fr where fr.author_id = p_user and not fr.is_hidden);
    when 'books_reviewed' then
      return (select count(*) from public.user_books ub
               where ub.user_id = p_user and ub.status = 'completed'
                 and char_length(coalesce(trim(ub.review), '')) >= 100);
    when 'event_directions' then
      return (select count(distinct e.direction) from public.event_attendance a
                join public.events e on e.id = a.event_id where a.user_id = p_user);
    when 'feedback_given' then
      return (select count(*) from public.event_feedback f where f.user_id = p_user);
    when 'reviews_given' then
      return (select count(*) from public.peer_reviews r where r.author_id = p_user);
    when 'forum_topics' then
      return (select count(*) from public.forum_topics t where t.author_id = p_user and not t.is_hidden);
    when 'upvotes_received' then
      return (select count(*) from public.forum_reply_votes v
                join public.forum_replies fr on fr.id = v.reply_id
               where fr.author_id = p_user and v.user_id <> p_user);
    when 'activity_streak' then
      return private.activity_streak(p_user);
    when 'activity_week_streak' then
      return private.activity_week_streak(p_user);
    when 'events_hosted' then
      -- started events created by the member with 3+ verified attendees (host excluded)
      return (select count(*) from public.events e
               where e.created_by = p_user and e.starts_at <= now()
                 and (select count(*) from public.event_attendance a
                       where a.event_id = e.id and a.user_id <> p_user) >= 3);
    when 'well_rated_events_hosted' then
      return (select count(*) from public.events e
               where e.created_by = p_user and e.starts_at <= now()
                 and (select count(*) from public.event_attendance a
                       where a.event_id = e.id and a.user_id <> p_user) >= 3
                 and (select count(*) from public.event_feedback f
                       where f.event_id = e.id and f.user_id <> p_user) >= 3
                 and (select avg(f.satisfaction) from public.event_feedback f
                       where f.event_id = e.id and f.user_id <> p_user) >= 4.5);
    else
      return 0;   -- 'manual' and unknown metrics never auto-unlock
  end case;
end $$;

create function private.unlock_achievement(p_user uuid, p_achievement text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare a public.achievements;
begin
  select * into a from public.achievements where id = p_achievement and is_active;
  if not found then return false; end if;

  insert into public.user_achievements (user_id, achievement_id) values (p_user, p_achievement)
  on conflict do nothing;
  if not found then return false; end if;

  perform private.grant_reward(p_user, a.xp_reward, a.coin_reward, 'achievement', a.id,
    'Достижение: ' || a.title_ru, 'achievement:' || a.id || ':' || p_user);
  perform private.notify(p_user, 'achievement', 'Новое достижение!', a.title_ru, 'achievements',
    jsonb_build_object('achievement_id', a.id), 'achievement:' || a.id);
  return true;
end $$;

create function private.evaluate_achievements(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  for a in
    select ach.id, ach.rule from public.achievements ach
     where ach.is_active
       and ach.rule ->> 'metric' <> 'manual'
       and not exists (select 1 from public.user_achievements ua
                        where ua.user_id = p_user and ua.achievement_id = ach.id)
  loop
    if private.achievement_metric(p_user, a.rule) >= coalesce((a.rule ->> 'threshold')::int, 1) then
      perform private.unlock_achievement(p_user, a.id);
    end if;
  end loop;
end $$;

-- Staff confirmation for achievements that cannot be computed (speech, run, quiz, streak).
create function public.award_achievement(p_user uuid, p_achievement text, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  perform private.require_role('moderator');
  if p_user = auth.uid() then
    raise exception 'cannot award an achievement to yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from public.achievements where id = p_achievement and rule ->> 'metric' = 'manual') then
    raise exception 'achievement % is not manually awardable', p_achievement;
  end if;
  v_ok := private.unlock_achievement(p_user, p_achievement);
  perform private.audit('ACHIEVEMENT_AWARD', 'user', p_user::text,
    jsonb_build_object('achievement', p_achievement, 'note', p_note, 'granted', v_ok));
  return v_ok;
end $$;

-- ---------------------------------------------------------------------
-- Events: registration / cancellation
-- ---------------------------------------------------------------------
create function public.register_for_event(p_event uuid)
returns public.registration_status language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  ev public.events;
  v_taken int;
  v_current public.registration_status;
begin
  -- Row lock serialises concurrent registrations for the same event,
  -- so the capacity check below cannot be raced.
  select * into ev from public.events where id = p_event for update;
  if not found or ev.status <> 'published' then
    raise exception 'event_not_available' using errcode = 'P0002';
  end if;
  if ev.starts_at <= now() then
    raise exception 'event_already_started';
  end if;
  if ev.registration_deadline is not null and now() > ev.registration_deadline then
    raise exception 'registration_closed';
  end if;

  select status into v_current from public.event_registrations where event_id = p_event and user_id = uid;
  if v_current = 'registered' then
    return 'registered';            -- idempotent: no duplicate registration
  end if;

  select count(*) into v_taken from public.event_registrations
   where event_id = p_event and status = 'registered';
  if v_taken >= ev.capacity then
    raise exception 'event_full';
  end if;

  insert into public.event_registrations (event_id, user_id, status)
  values (p_event, uid, 'registered')
  on conflict (event_id, user_id) do update
    set status = 'registered', registered_at = now(), cancelled_at = null;

  insert into public.scheduled_notifications (user_id, event_id, kind, send_at)
  select uid, p_event, k.kind, k.send_at
    from (values ('event_24h', ev.starts_at - interval '24 hours'),
                 ('event_2h',  ev.starts_at - interval '2 hours')) as k(kind, send_at)
   where k.send_at > now()
  on conflict (user_id, event_id, kind) do update
    set send_at = excluded.send_at
    where public.scheduled_notifications.sent_at is null;

  perform private.notify(uid, 'registration', 'Успешная регистрация на мероприятие',
    format('Вы записаны на «%s».', ev.title), 'events',
    jsonb_build_object('event_id', p_event), 'registration:' || p_event || ':' || extract(epoch from now())::bigint);
  return 'registered';
end $$;

create function public.cancel_event_registration(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_starts timestamptz;
begin
  select starts_at into v_starts from public.events where id = p_event;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if v_starts <= now() then raise exception 'event_already_started'; end if;

  update public.event_registrations
     set status = 'cancelled', cancelled_at = now()
   where event_id = p_event and user_id = uid and status = 'registered';

  delete from public.scheduled_notifications
   where event_id = p_event and user_id = uid and sent_at is null;
end $$;

-- Public counts without exposing who registered (for anonymous-safe UI).
create function public.get_event_counts(p_events uuid[])
returns table (event_id uuid, registered int, attended int)
language sql stable security definer set search_path = '' as $$
  select e.id,
         (select count(*)::int from public.event_registrations r where r.event_id = e.id and r.status = 'registered'),
         (select count(*)::int from public.event_attendance a where a.event_id = e.id)
    from public.events e
   where e.id = any (p_events)
     and (e.status in ('published', 'completed') or private.has_role('organizer'))
$$;

-- ---------------------------------------------------------------------
-- Attendance: QR tickets + verification
-- ---------------------------------------------------------------------
-- Member side: returns a short-lived, single-use secret to render as a QR.
-- Payload format suggestion for the QR: "shq1:<token>".
create function public.issue_checkin_token(p_event uuid)
returns table (token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp timestamptz := now() + interval '5 minutes';
  ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if not found or ev.status not in ('published', 'completed') then
    raise exception 'event_not_available' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.event_registrations
                  where event_id = p_event and user_id = uid and status = 'registered') then
    raise exception 'not_registered';
  end if;
  if now() < ev.starts_at - interval '2 hours'
     or now() > ev.starts_at + make_interval(mins => ev.duration_minutes) + interval '1 hour' then
    raise exception 'checkin_window_closed';
  end if;

  delete from public.event_checkin_tokens t
   where t.event_id = p_event and t.user_id = uid and t.used_at is null;
  insert into public.event_checkin_tokens (event_id, user_id, token_hash, expires_at)
  values (p_event, uid, extensions.digest(v_token, 'sha256'), v_exp);

  return query select v_token, v_exp;
end $$;

create function private.record_attendance(p_event uuid, p_user uuid, p_method public.checkin_method)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  v_coins int;
begin
  select * into ev from public.events where id = p_event;

  insert into public.event_attendance (event_id, user_id, checked_in_by, method)
  values (p_event, p_user, auth.uid(), p_method)
  on conflict do nothing;
  if not found then
    return false;                   -- already checked in: no second reward
  end if;

  v_coins := round(ev.attendance_coins * private.coin_multiplier(p_user));
  perform private.grant_reward(p_user, ev.attendance_xp, v_coins, 'event_attendance', p_event::text,
    format('Подтверждение визита на «%s»', ev.title), 'attendance:' || p_event || ':' || p_user);
  perform private.notify(p_user, 'coin_reward', 'Визит подтверждён',
    format('+%s XP и +%s коинов за «%s»', ev.attendance_xp, v_coins, ev.title), 'attendance',
    jsonb_build_object('event_id', p_event), 'attendance:' || p_event);
  perform private.evaluate_achievements(p_user);
  if ev.created_by is not null and ev.created_by <> p_user then
    perform private.evaluate_achievements(ev.created_by);   -- host achievements
  end if;
  return true;
end $$;

-- Staff side: scan the member's QR and submit the token.
create function public.check_in_with_token(p_token text)
returns table (event_id uuid, user_id uuid, newly_checked_in boolean)
language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := private.require_role('organizer');
  t public.event_checkin_tokens;
  ev public.events;
  v_new boolean;
begin
  select * into t from public.event_checkin_tokens
   where token_hash = extensions.digest(regexp_replace(coalesce(p_token, ''), '^shq1:', ''), 'sha256')
   for update;
  if not found then raise exception 'invalid_token'; end if;
  if t.used_at is not null then raise exception 'token_already_used'; end if;
  if t.expires_at < now() then raise exception 'token_expired'; end if;
  if t.user_id = staff then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;

  select * into ev from public.events e where e.id = t.event_id;
  if not private.has_role('moderator') and ev.created_by is distinct from staff then
    raise exception 'forbidden: not an organizer of this event' using errcode = '42501';
  end if;

  update public.event_checkin_tokens set used_at = now() where id = t.id;
  v_new := private.record_attendance(t.event_id, t.user_id, 'qr');
  return query select t.event_id, t.user_id, v_new;
end $$;

-- Fallback for lost phones etc. Always audited.
create function public.manual_check_in(p_event uuid, p_user uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := private.require_role('organizer');
  ev public.events;
  v_new boolean;
begin
  if p_user = staff then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into ev from public.events where id = p_event;
  if not found then raise exception 'event_not_found' using errcode = 'P0002'; end if;
  if not private.has_role('moderator') and ev.created_by is distinct from staff then
    raise exception 'forbidden: not an organizer of this event' using errcode = '42501';
  end if;
  if now() < ev.starts_at - interval '2 hours' then raise exception 'checkin_window_closed'; end if;

  v_new := private.record_attendance(p_event, p_user, 'manual');
  perform private.audit('MANUAL_CHECKIN', 'event', p_event::text,
    jsonb_build_object('user_id', p_user, 'reason', p_reason, 'newly_checked_in', v_new));
  return v_new;
end $$;

create function public.submit_event_feedback(p_event uuid, p_satisfaction int, p_usefulness int, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member');
begin
  if not exists (select 1 from public.event_attendance where event_id = p_event and user_id = uid) then
    raise exception 'feedback_requires_attendance';
  end if;
  insert into public.event_feedback (event_id, user_id, satisfaction, usefulness, comment)
  values (p_event, uid, p_satisfaction, p_usefulness, coalesce(p_comment, ''));   -- PK blocks duplicates
  perform private.grant_reward(uid, 30, 20, 'event_feedback', p_event::text,
    'Обратная связь по мероприятию', 'feedback:' || p_event || ':' || uid);
  perform private.evaluate_achievements(uid);
  perform private.evaluate_achievements((select created_by from public.events where id = p_event));   -- host rating
end $$;

-- ---------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------
create function public.save_user_book(
  p_title text, p_author text, p_genre text, p_status public.reading_status,
  p_rating int default null, p_review text default null, p_finished_at date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_book uuid;
  v_ub uuid;
begin
  insert into public.books (title, author, genre, created_by)
  values (trim(p_title), trim(p_author), nullif(trim(p_genre), ''), uid)
  on conflict (lower(title), lower(author)) do nothing;
  select id into v_book from public.books where lower(title) = lower(trim(p_title)) and lower(author) = lower(trim(p_author));

  -- finished_at is set by the server (today), never taken from the client:
  -- a back-dated finish date would defeat the one-book-per-week rule.
  -- p_finished_at is kept in the signature for compatibility and ignored.
  insert into public.user_books (user_id, book_id, status, rating, review, finished_at)
  values (uid, v_book, p_status, p_rating, nullif(trim(p_review), ''),
          case when p_status = 'completed' then (now() at time zone 'Asia/Almaty')::date end)
  on conflict (user_id, book_id) do update
    set status = excluded.status, rating = excluded.rating, review = excluded.review,
        finished_at = coalesce(public.user_books.finished_at, excluded.finished_at)
  returning id into v_ub;

  -- Self-reported: rewarded only for a finished book with a 100+ character review,
  -- and only if no other book was credited in the same week (see src/utils/bookCredit.ts).
  if p_status = 'completed' and char_length(coalesce(trim(p_review), '')) >= 100
     and not exists (
       select 1 from public.user_books ub
        where ub.user_id = uid and ub.id <> v_ub and ub.status = 'completed'
          and char_length(coalesce(trim(ub.review), '')) >= 100
          and date_trunc('week', ub.finished_at) = date_trunc('week', (now() at time zone 'Asia/Almaty')::date))
  then
    perform private.grant_reward(uid, 50, 30, 'book_added', v_book::text,
      format('Книга «%s» с рецензией', trim(p_title)), 'book:' || v_book || ':' || uid);
  end if;
  if p_status = 'completed' then
    perform private.evaluate_achievements(uid);
  end if;
  return v_ub;
end $$;

-- ---------------------------------------------------------------------
-- Shop
-- ---------------------------------------------------------------------
create function public.purchase_shop_item(p_item text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  it public.shop_items;
  v_coins int;
begin
  select * into it from public.shop_items where id = p_item and is_active;
  if not found then raise exception 'item_not_available' using errcode = 'P0002'; end if;

  select coins into v_coins from public.user_balances where user_id = uid for update;
  if exists (select 1 from public.user_inventory where user_id = uid and item_id = p_item) then
    raise exception 'already_owned';
  end if;
  if v_coins < it.price_coins then raise exception 'insufficient_coins'; end if;

  -- Existing app behaviour: purchases also grant +25 XP.
  perform private.grant_reward(uid, 25, -it.price_coins, 'shop_purchase', it.id,
    format('Покупка предмета «%s»', it.name_ru), 'purchase:' || it.id || ':' || uid);
  insert into public.user_inventory (user_id, item_id) values (uid, p_item);
end $$;

create function public.equip_item(p_item text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_cat public.item_category;
begin
  select s.category into v_cat from public.shop_items s
    join public.user_inventory i on i.item_id = s.id and i.user_id = uid
   where s.id = p_item;
  if not found then raise exception 'item_not_owned'; end if;
  insert into public.user_equipment (user_id, category, item_id) values (uid, v_cat, p_item)
  on conflict (user_id, category) do update set item_id = excluded.item_id;
end $$;

create function public.unequip_item(p_category public.item_category)
returns void language sql security definer set search_path = '' as $$
  delete from public.user_equipment where user_id = auth.uid() and category = p_category;
$$;

-- ---------------------------------------------------------------------
-- Forum & peer review rewards (triggers; keys stop toggle-farming)
-- ---------------------------------------------------------------------
create function private.on_forum_topic_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reward_ledger
       where user_id = new.author_id and source = 'forum_topic' and created_at > now() - interval '24 hours') < 3 then
    perform private.grant_reward(new.author_id, 30, 15, 'forum_topic', new.id::text,
      'Создание темы на форуме', 'forum_topic:' || new.id);
  end if;
  perform private.evaluate_achievements(new.author_id);
  return new;
end $$;

create function private.on_forum_reply_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_topic_author uuid;
begin
  if (select count(*) from public.reward_ledger
       where user_id = new.author_id and source = 'forum_reply' and created_at > now() - interval '24 hours') < 10 then
    perform private.grant_reward(new.author_id, 20, 10, 'forum_reply', new.id::text,
      'Ответ в обсуждении форума', 'forum_reply:' || new.id);
  end if;
  select author_id into v_topic_author from public.forum_topics where id = new.topic_id;
  if v_topic_author is distinct from new.author_id then
    perform private.notify(v_topic_author, 'forum_reply', 'Новый ответ в вашей теме', left(new.content, 140),
      'forum', jsonb_build_object('topic_id', new.topic_id, 'reply_id', new.id), 'forum_reply:' || new.id);
  end if;
  perform private.evaluate_achievements(new.author_id);
  return new;
end $$;

create function private.on_reply_vote_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  select author_id into v_author from public.forum_replies where id = new.reply_id;
  if v_author = new.user_id then
    raise exception 'cannot_vote_own_reply' using errcode = '42501';
  end if;
  -- Key is (reply, voter): un-vote + re-vote never pays out twice.
  perform private.grant_reward(v_author, 15, 10, 'forum_upvote_received', new.reply_id::text,
    'Полезный ответ на форуме', 'reply_upvote:' || new.reply_id || ':' || new.user_id);
  return new;
end $$;

create function private.after_reply_vote_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.evaluate_achievements((select author_id from public.forum_replies where id = new.reply_id));
  return new;
end $$;

create function private.on_topic_vote_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select author_id from public.forum_topics where id = new.topic_id) = new.user_id then
    raise exception 'cannot_vote_own_topic' using errcode = '42501';
  end if;
  return new;
end $$;

create function private.on_peer_review_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author_name text;
begin
  -- Keyed on (author, target, aspect): delete + re-post never pays twice.
  perform private.grant_reward(new.target_id, 40, 25, 'peer_review_received', new.id::text,
    'Отзыв от участника', 'review_recv:' || new.author_id || ':' || new.target_id || ':' || new.aspect);
  if (select count(*) from public.reward_ledger
       where user_id = new.author_id and source = 'peer_review_given' and created_at > now() - interval '24 hours') < 3 then
    perform private.grant_reward(new.author_id, 20, 10, 'peer_review_given', new.id::text,
      'Оставлен отзыв об участнике', 'review_given:' || new.author_id || ':' || new.target_id || ':' || new.aspect);
  end if;
  select display_name into v_author_name from public.profiles where id = new.author_id;
  perform private.notify(new.target_id, 'review', 'Новый отзыв в вашем профиле',
    format('%s оставил(а) отзыв: «%s»', v_author_name, left(new.comment, 60)), 'profile',
    jsonb_build_object('review_id', new.id), 'review:' || new.id);
  perform private.evaluate_achievements(new.target_id);
  perform private.evaluate_achievements(new.author_id);
  return new;
end $$;

-- Non-moderators may edit their own text, but not moderation flags.
create function private.guard_forum_moderation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('moderator') then
    if tg_table_name = 'forum_topics' then
      if new.is_pinned is distinct from old.is_pinned or new.is_closed is distinct from old.is_closed
         or new.is_hidden is distinct from old.is_hidden or new.view_count is distinct from old.view_count then
        raise exception 'forbidden: moderation fields' using errcode = '42501';
      end if;
    elsif new.is_hidden is distinct from old.is_hidden then
      raise exception 'forbidden: moderation fields' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Organizers may create events, but only admins can raise reward amounts.
create function private.guard_event_rewards() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_role('admin') then
    if tg_op = 'INSERT' and (new.attendance_xp <> 60 or new.attendance_coins <> 40) then
      raise exception 'forbidden: only admins can set event rewards' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (new.attendance_xp <> old.attendance_xp or new.attendance_coins <> old.attendance_coins
                                 or new.created_by is distinct from old.created_by) then
      raise exception 'forbidden: only admins can change event rewards/owner' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end $$;

create function private.audit_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit('EVENT_' || tg_op, 'event', coalesce(new.id, old.id)::text,
    jsonb_build_object('title', coalesce(new.title, old.title), 'status', coalesce(new.status, old.status)));
  return coalesce(new, old);
end $$;

create trigger forum_topic_reward  after insert on public.forum_topics      for each row execute function private.on_forum_topic_insert();
create trigger forum_reply_reward  after insert on public.forum_replies     for each row execute function private.on_forum_reply_insert();
create trigger reply_vote_reward   before insert on public.forum_reply_votes for each row execute function private.on_reply_vote_insert();
create trigger reply_vote_achieve  after insert on public.forum_reply_votes for each row execute function private.after_reply_vote_insert();
create trigger topic_vote_guard    before insert on public.forum_topic_votes for each row execute function private.on_topic_vote_insert();
create trigger peer_review_reward  after insert on public.peer_reviews      for each row execute function private.on_peer_review_insert();
create trigger forum_topics_guard  before update on public.forum_topics     for each row execute function private.guard_forum_moderation();
create trigger forum_replies_guard before update on public.forum_replies    for each row execute function private.guard_forum_moderation();
create trigger events_reward_guard before insert or update on public.events for each row execute function private.guard_event_rewards();
create trigger events_audit        after insert or update or delete on public.events for each row execute function private.audit_event_change();

create function public.increment_topic_views(p_topic uuid)
returns void language sql security definer set search_path = '' as $$
  update public.forum_topics set view_count = view_count + 1
   where id = p_topic and (select auth.uid()) is not null;
$$;

-- ---------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------
create function public.admin_adjust_coins(p_user uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_role('admin');
begin
  if p_user = actor then raise exception 'cannot adjust your own balance' using errcode = '42501'; end if;
  if p_amount = 0 or abs(p_amount) > 10000 then raise exception 'amount out of range'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  perform private.grant_reward(p_user, 0, p_amount, 'admin_adjustment', null, p_reason,
    'admin:' || gen_random_uuid());
  perform private.audit('COIN_ADJUST', 'user', p_user::text, jsonb_build_object('amount', p_amount, 'reason', p_reason));
end $$;

create function public.set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_role('admin');
  v_actor_rank int := private.role_rank(private.current_app_role());
  v_old public.app_role;
begin
  if p_user = actor then raise exception 'cannot change your own role' using errcode = '42501'; end if;
  select role into v_old from public.user_roles where user_id = p_user for update;
  if not found then raise exception 'user_not_found' using errcode = 'P0002'; end if;

  -- Admins manage roles strictly below their own; superadmins manage everything.
  if v_actor_rank < private.role_rank('superadmin')
     and (private.role_rank(v_old) >= v_actor_rank or private.role_rank(p_role) >= v_actor_rank) then
    raise exception 'forbidden: insufficient rank' using errcode = '42501';
  end if;
  if v_old = 'superadmin' and p_role <> 'superadmin'
     and (select count(*) from public.user_roles where role = 'superadmin') <= 1 then
    raise exception 'cannot demote the last superadmin';
  end if;

  update public.user_roles set role = p_role, granted_by = actor, granted_at = now() where user_id = p_user;
  perform private.audit('ROLE_UPDATE', 'user', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
end $$;

create function public.dispatch_broadcast(p_title text, p_body text, p_channels text[], p_direction public.direction_id default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_role('moderator');
  v_id uuid;
  v_count int;
begin
  insert into public.broadcasts (sender_id, title, body, channels, target_direction)
  values (actor, p_title, p_body, p_channels, p_direction) returning id into v_id;

  insert into public.notifications (user_id, type, title, body, link_tab, meta, dedupe_key)
  select p.id, 'broadcast', 'Shanyraq Hub: ' || p_title, p_body, 'events',
         jsonb_build_object('broadcast_id', v_id), 'broadcast:' || v_id
    from public.profiles p
   where p_direction is null or p_direction = any (p.directions)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics v_count = row_count;

  update public.broadcasts set recipients_count = v_count where id = v_id;
  perform private.audit('BROADCAST_DISPATCH', 'broadcast', v_id::text,
    jsonb_build_object('title', p_title, 'channels', p_channels, 'recipients', v_count));
  -- Push / Telegram / WhatsApp fan-out: Edge Function reads `broadcasts` (service role).
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Reminder queue (called by the scheduled Edge Function with service role)
-- ---------------------------------------------------------------------
create function public.claim_due_notifications(p_limit int default 100)
returns setof public.scheduled_notifications
language sql security definer set search_path = '' as $$
  update public.scheduled_notifications s
     set attempts = s.attempts + 1
   where s.id in (
     select id from public.scheduled_notifications
      where sent_at is null and send_at <= now() and attempts < 5
      order by send_at
      limit p_limit
      for update skip locked)
  returning s.*;
$$;

-- ---------------------------------------------------------------------
-- Leaderboard / member stats (aggregates only)
-- ---------------------------------------------------------------------
create view public.member_stats with (security_invoker = true) as
select p.id as user_id,
       p.handle,
       p.display_name,
       p.avatar_url,
       ur.role,
       b.xp,
       b.coins,
       private.tier_for_xp(b.xp) as tier,
       (b.xp / 2) + coalesce((select sum(r.rating) * 3 from public.peer_reviews r
                               where r.target_id = p.id and not r.is_hidden), 0)::int as reputation
  from public.profiles p
  join public.user_balances b on b.user_id = p.id
  join public.user_roles ur on ur.user_id = p.id;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke execute on all functions in schema private from public;
revoke execute on all functions in schema public from public, anon;

grant usage on schema private to authenticated;   -- needed for RLS helper calls
grant execute on function private.has_role(public.app_role), private.current_app_role(),
                          private.role_rank(public.app_role), private.tier_for_xp(int)
  to authenticated;

grant execute on function
  public.register_for_event(uuid),
  public.cancel_event_registration(uuid),
  public.get_event_counts(uuid[]),
  public.issue_checkin_token(uuid),
  public.check_in_with_token(text),
  public.manual_check_in(uuid, uuid, text),
  public.submit_event_feedback(uuid, int, int, text),
  public.save_user_book(text, text, text, public.reading_status, int, text, date),
  public.purchase_shop_item(text),
  public.equip_item(text),
  public.unequip_item(public.item_category),
  public.increment_topic_views(uuid),
  public.award_achievement(uuid, text, text),
  public.admin_adjust_coins(uuid, int, text),
  public.set_user_role(uuid, public.app_role),
  public.dispatch_broadcast(text, text, text[], public.direction_id)
to authenticated;

revoke execute on function public.claim_due_notifications(int) from authenticated;
grant execute on function public.claim_due_notifications(int) to service_role;
