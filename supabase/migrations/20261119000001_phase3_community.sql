-- =====================================================================
-- Shanyraq Hub — Phase 3: directions & memberships, user preferences,
-- moderation reports, file storage (PROPOSAL, NOT APPLIED)
--
-- Additive only: new types, tables, columns, functions, policies.
-- Nothing is dropped, no existing data is rewritten.
--
-- Decisions (owner, 19.11.2026):
--   * Joining a club direction requires approval by a direction lead or a
--     moderator+. Statuses: pending -> active | rejected; active -> left | removed.
--   * profiles.directions is kept for compatibility, but becomes read-only for
--     clients and is synced from ACTIVE memberships by a trigger.
--   * Direction ids stay the existing enum `direction_id` (all events, rooms and
--     achievements already use it). Names/descriptions/flags are editable by
--     admins in `community_directions`; a brand-new direction needs a one-line
--     migration: alter type public.direction_id add value '...'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.membership_status as enum ('pending', 'active', 'rejected', 'left', 'removed');
create type public.membership_role as enum ('member', 'lead');
create type public.report_target as enum ('forum_topic', 'forum_reply', 'chat_message', 'profile', 'peer_review', 'event_feedback');
create type public.report_reason as enum ('spam', 'harassment', 'inappropriate', 'misinformation', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------
-- Community directions (reference data, seeded from src/data/directions.ts)
-- ---------------------------------------------------------------------
create table public.community_directions (
  id                public.direction_id primary key,
  name_ru           text not null check (char_length(name_ru) between 1 and 120),
  name_kz           text not null check (char_length(name_kz) between 1 and 120),
  name_en           text not null check (char_length(name_en) between 1 and 120),
  short_name_ru     text not null default '' check (char_length(short_name_ru) <= 40),
  short_name_kz     text not null default '' check (char_length(short_name_kz) <= 40),
  short_name_en     text not null default '' check (char_length(short_name_en) <= 40),
  description_ru    text not null default '' check (char_length(description_ru) <= 1000),
  description_kz    text not null default '' check (char_length(description_kz) <= 1000),
  description_en    text not null default '' check (char_length(description_en) <= 1000),
  icon              text,
  color             text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  requires_approval boolean not null default true,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  direction     public.direction_id not null references public.community_directions (id) on delete restrict,
  status        public.membership_status not null default 'pending',
  role          public.membership_role not null default 'member',
  message       text check (char_length(message) <= 500),          -- note from the applicant
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, direction),
  check (role = 'member' or status = 'active')                      -- only active members can lead
);
create index memberships_direction_status_idx on public.memberships (direction, status);
create index memberships_pending_idx on public.memberships (created_at) where status = 'pending';

-- ---------------------------------------------------------------------
-- User preferences (one row per user, created automatically)
-- Language and push/telegram switches stay on `profiles` (already used there).
-- ---------------------------------------------------------------------
create table public.user_preferences (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  notify_event_reminders   boolean not null default true,
  notify_new_events        boolean not null default true,
  notify_forum_replies     boolean not null default true,
  notify_achievements      boolean not null default true,
  notify_broadcasts        boolean not null default true,
  email_notifications      boolean not null default false,
  reminder_hours_before    smallint not null default 24 check (reminder_hours_before between 1 and 72),
  quiet_hours_start        time,
  quiet_hours_end          time,
  show_on_leaderboard      boolean not null default true,
  updated_at               timestamptz not null default now(),
  check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

-- ---------------------------------------------------------------------
-- Moderation reports
-- ---------------------------------------------------------------------
create table public.moderation_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users (id) on delete set null,
  target_type     public.report_target not null,
  target_id       text not null check (char_length(target_id) between 1 and 100),  -- event_feedback: '<event_id>:<user_id>'
  target_user_id  uuid references auth.users (id) on delete set null,   -- author of the reported content
  reason          public.report_reason not null,
  details         text not null default '' check (char_length(details) <= 1000),
  status          public.report_status not null default 'open',
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((status in ('resolved', 'dismissed')) = (resolved_at is not null))
);
-- One open report per reporter and target (no spam-reporting the same thing).
create unique index moderation_reports_one_open_idx
  on public.moderation_reports (reporter_id, target_type, target_id) where status in ('open', 'reviewing');
create index moderation_reports_queue_idx on public.moderation_reports (status, created_at);

-- ---------------------------------------------------------------------
-- Image columns for storage-backed covers (nullable, additive)
-- ---------------------------------------------------------------------
alter table public.books  add column cover_url text check (cover_url is null or cover_url ~ '^(https://|/)');
alter table public.events add column cover_url text check (cover_url is null or cover_url ~ '^(https://|/)');

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger community_directions_touch before update on public.community_directions
  for each row execute function private.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function private.touch_updated_at();
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function private.touch_updated_at();
create trigger moderation_reports_touch before update on public.moderation_reports
  for each row execute function private.touch_updated_at();

-- Every profile gets a preferences row.
create function private.create_user_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger profiles_create_preferences after insert on public.profiles
  for each row execute function private.create_user_preferences();
insert into public.user_preferences (user_id) select id from public.profiles on conflict do nothing;  -- existing users

-- profiles.directions mirrors ACTIVE memberships (kept for existing code: broadcasts, UI).
create function private.sync_profile_directions() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p
     set directions = coalesce((select array_agg(m.direction order by m.direction)
                                  from public.memberships m
                                 where m.user_id = v_user and m.status = 'active'), '{}')
   where p.id = v_user;
  return null;
end $$;
create trigger memberships_sync_profile after insert or update or delete on public.memberships
  for each row execute function private.sync_profile_directions();

-- ---------------------------------------------------------------------
-- Membership RPCs
-- ---------------------------------------------------------------------
-- Caller may decide on applications for a direction: moderator+ or an active lead of it.
create function private.can_manage_direction(p_direction public.direction_id) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('moderator')
      or exists (select 1 from public.memberships m
                  where m.user_id = (select auth.uid()) and m.direction = p_direction
                    and m.status = 'active' and m.role = 'lead')
$$;

-- Apply to join (or re-apply after leaving / rejection). Auto-approved if the direction does not require approval.
create function public.request_membership(p_direction public.direction_id, p_message text default null)
returns public.membership_status language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_dir public.community_directions;
  v_cur public.memberships;
  v_status public.membership_status;
begin
  select * into v_dir from public.community_directions where id = p_direction;
  if not found or not v_dir.is_active then
    raise exception 'direction_not_available' using errcode = 'P0001';
  end if;
  select * into v_cur from public.memberships where user_id = uid and direction = p_direction for update;
  if found and v_cur.status in ('pending', 'active') then
    return v_cur.status;                                     -- idempotent
  end if;
  if found and v_cur.status = 'removed' and not private.has_role('moderator') then
    raise exception 'membership_removed: ask a moderator' using errcode = 'P0001';
  end if;
  if found and v_cur.status = 'rejected' and v_cur.decided_at > now() - interval '7 days' then
    raise exception 'reapply_too_soon' using errcode = 'P0001';
  end if;

  v_status := case when v_dir.requires_approval then 'pending' else 'active' end;
  insert into public.memberships (user_id, direction, status, message)
  values (uid, p_direction, v_status, nullif(trim(left(coalesce(p_message, ''), 500)), ''))
  on conflict (user_id, direction) do update
     set status = excluded.status, role = 'member', message = excluded.message,
         decided_by = null, decided_at = null, decision_note = null;
  return v_status;
end $$;

-- Leave a direction, or withdraw a pending application.
create function public.leave_membership(p_direction public.direction_id)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member');
begin
  update public.memberships set status = 'left', role = 'member'
   where user_id = uid and direction = p_direction and status in ('pending', 'active');
  return found;
end $$;

-- Approve / reject a pending application (direction lead or moderator+, never one's own).
create function public.review_membership(p_membership uuid, p_approve boolean, p_note text default null)
returns public.membership_status language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_m public.memberships;
  v_status public.membership_status := case when p_approve then 'active' else 'rejected' end;
begin
  select * into v_m from public.memberships where id = p_membership for update;
  if not found then raise exception 'membership_not_found' using errcode = 'P0002'; end if;
  if not private.can_manage_direction(v_m.direction) then
    raise exception 'forbidden: not a lead of this direction' using errcode = '42501';
  end if;
  if v_m.user_id = uid then raise exception 'cannot review own membership' using errcode = '42501'; end if;
  if v_m.status <> 'pending' then raise exception 'membership_not_pending' using errcode = 'P0001'; end if;

  update public.memberships
     set status = v_status, decided_by = uid, decided_at = now(),
         decision_note = nullif(trim(left(coalesce(p_note, ''), 500)), '')
   where id = p_membership;
  perform private.notify(v_m.user_id, 'system',
    case when p_approve then 'Заявка в направление одобрена' else 'Заявка в направление отклонена' end,
    coalesce(nullif(trim(p_note), ''), case when p_approve then 'Добро пожаловать!' else 'Можно подать снова через 7 дней.' end),
    'profile', jsonb_build_object('direction', v_m.direction, 'membership_id', v_m.id),
    'membership:' || v_m.id || ':' || v_status || ':' || extract(epoch from now())::bigint);
  perform private.audit(case when p_approve then 'MEMBERSHIP_APPROVE' else 'MEMBERSHIP_REJECT' end,
    'membership', v_m.id::text, jsonb_build_object('user', v_m.user_id, 'direction', v_m.direction));
  return v_status;
end $$;

-- Remove an active member from a direction (lead or moderator+; a lead cannot remove another lead).
create function public.remove_member(p_membership uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member'); v_m public.memberships;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into v_m from public.memberships where id = p_membership for update;
  if not found or v_m.status <> 'active' then raise exception 'membership_not_active' using errcode = 'P0001'; end if;
  if not private.can_manage_direction(v_m.direction) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_m.user_id = uid then raise exception 'use leave_membership for yourself' using errcode = '42501'; end if;
  if v_m.role = 'lead' and not private.has_role('moderator') then raise exception 'forbidden: only moderators remove leads' using errcode = '42501'; end if;
  update public.memberships set status = 'removed', role = 'member', decided_by = uid, decided_at = now(),
         decision_note = left(trim(p_reason), 500) where id = p_membership;
  perform private.audit('MEMBERSHIP_REMOVE', 'membership', v_m.id::text,
    jsonb_build_object('user', v_m.user_id, 'direction', v_m.direction, 'reason', trim(p_reason)));
  return true;
end $$;

-- Appoint / dismiss a direction lead (moderator+). The user must be an active member.
create function public.set_direction_lead(p_user uuid, p_direction public.direction_id, p_is_lead boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('moderator');
begin
  update public.memberships set role = case when p_is_lead then 'lead' else 'member' end::public.membership_role
   where user_id = p_user and direction = p_direction and status = 'active';
  if not found then raise exception 'not_an_active_member' using errcode = 'P0001'; end if;
  perform private.audit(case when p_is_lead then 'DIRECTION_LEAD_SET' else 'DIRECTION_LEAD_UNSET' end,
    'membership', p_user::text, jsonb_build_object('direction', p_direction, 'by', uid));
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Moderation RPCs
-- ---------------------------------------------------------------------
create function public.report_content(p_target_type public.report_target, p_target_id text,
                                      p_reason public.report_reason, p_details text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_author uuid;
  v_id uuid;
begin
  -- Resolve the author and make sure the target exists (and is visible to the reporter for chats).
  case p_target_type
    when 'forum_topic'    then select author_id into v_author from public.forum_topics  where id::text = p_target_id;
    when 'forum_reply'    then select author_id into v_author from public.forum_replies where id::text = p_target_id;
    when 'chat_message'   then
      select m.sender_id into v_author from public.chat_messages m join public.chat_rooms r on r.id = m.room_id
       where m.id::text = p_target_id and private.has_role(r.min_role);
    when 'profile'        then select id into v_author from public.profiles where id::text = p_target_id;
    when 'peer_review'    then select author_id into v_author from public.peer_reviews where id::text = p_target_id;
    when 'event_feedback' then select f.user_id into v_author from public.event_feedback f
                                 where f.event_id::text || ':' || f.user_id::text = p_target_id;
  end case;
  if v_author is null then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  if v_author = uid then raise exception 'cannot report own content' using errcode = 'P0001'; end if;
  if (select count(*) from public.moderation_reports
       where reporter_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.moderation_reports (reporter_id, target_type, target_id, target_user_id, reason, details)
  values (uid, p_target_type, p_target_id, v_author, p_reason, left(trim(coalesce(p_details, '')), 1000))
  on conflict (reporter_id, target_type, target_id) where status in ('open', 'reviewing') do nothing
  returning id into v_id;
  if v_id is null then   -- already reported and still open: return the existing report
    select id into v_id from public.moderation_reports
     where reporter_id = uid and target_type = p_target_type and target_id = p_target_id
       and status in ('open', 'reviewing');
  end if;
  return v_id;
end $$;

create function public.resolve_report(p_report uuid, p_status public.report_status, p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('moderator'); v_r public.moderation_reports;
begin
  select * into v_r from public.moderation_reports where id = p_report for update;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  if v_r.target_user_id = uid then raise exception 'cannot resolve a report about yourself' using errcode = '42501'; end if;
  update public.moderation_reports
     set status = p_status,
         resolved_by = case when p_status in ('resolved', 'dismissed') then uid end,
         resolved_at = case when p_status in ('resolved', 'dismissed') then now() end,
         resolution_note = nullif(trim(left(coalesce(p_note, ''), 1000)), '')
   where id = p_report;
  perform private.audit('REPORT_' || upper(p_status::text), 'moderation_report', p_report::text,
    jsonb_build_object('target_type', v_r.target_type, 'target_id', v_r.target_id));
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------
revoke all on function private.create_user_preferences(), private.sync_profile_directions(),
  private.can_manage_direction(public.direction_id) from public;
grant execute on function private.can_manage_direction(public.direction_id) to authenticated;  -- used in RLS
revoke all on function
  public.request_membership(public.direction_id, text), public.leave_membership(public.direction_id),
  public.review_membership(uuid, boolean, text), public.remove_member(uuid, text),
  public.set_direction_lead(uuid, public.direction_id, boolean),
  public.report_content(public.report_target, text, public.report_reason, text),
  public.resolve_report(uuid, public.report_status, text)
  from public, anon;
grant execute on function
  public.request_membership(public.direction_id, text), public.leave_membership(public.direction_id),
  public.review_membership(uuid, boolean, text), public.remove_member(uuid, text),
  public.set_direction_lead(uuid, public.direction_id, boolean),
  public.report_content(public.report_target, text, public.report_reason, text),
  public.resolve_report(uuid, public.report_status, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security for the new tables
-- ---------------------------------------------------------------------
alter table public.community_directions enable row level security;
alter table public.memberships          enable row level security;
alter table public.user_preferences     enable row level security;
alter table public.moderation_reports   enable row level security;
revoke all on public.community_directions, public.memberships, public.user_preferences,
              public.moderation_reports from anon, authenticated;

-- Directions: everyone signed in reads; admins edit texts/flags (no insert/delete from the API).
grant select on public.community_directions to authenticated;
grant update (name_ru, name_kz, name_en, short_name_ru, short_name_kz, short_name_en,
              description_ru, description_kz, description_en, icon, color,
              requires_approval, is_active, sort_order)
  on public.community_directions to authenticated;
create policy directions_read on public.community_directions for select to authenticated using (true);
create policy directions_admin_update on public.community_directions for update to authenticated
  using (private.has_role('admin')) with check (private.has_role('admin'));

-- Memberships: active ones are public (member lists); pending/rejected/removed only for
-- the applicant, the direction's leads and moderators. All writes go through RPCs.
grant select on public.memberships to authenticated;
create policy memberships_read on public.memberships for select to authenticated
  using (status = 'active'
         or user_id = (select auth.uid())
         or private.can_manage_direction(direction));

-- Preferences: strictly own row.
grant select on public.user_preferences to authenticated;
grant update (notify_event_reminders, notify_new_events, notify_forum_replies, notify_achievements,
              notify_broadcasts, email_notifications, reminder_hours_before,
              quiet_hours_start, quiet_hours_end, show_on_leaderboard)
  on public.user_preferences to authenticated;
create policy preferences_read_own on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy preferences_update_own on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Reports: reporter sees own; moderators see all. Writes via RPCs only.
grant select on public.moderation_reports to authenticated;
create policy reports_read on public.moderation_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.has_role('moderator'));

-- Existing tables: directions now come from approved memberships, not from profile edits.
revoke update (directions) on public.profiles from authenticated;
-- New cover columns follow the existing write rules of their tables.
grant insert (cover_url), update (cover_url) on public.events to authenticated;
grant update (cover_url) on public.books to authenticated;

-- ---------------------------------------------------------------------
-- Storage: avatars, book covers, event photos
--   Path convention: <bucket>/<owner-or-event-id>/<file>
--   Public buckets serve files by URL; RLS below controls uploads/changes.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',      'avatars',      true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('book-covers',  'book-covers',  true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-photos', 'event-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Avatars: each user writes only inside the folder named after their user id.
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or private.has_role('moderator')));

-- Book covers: the catalog is curated by moderators.
create policy book_covers_read on storage.objects for select to authenticated
  using (bucket_id = 'book-covers');
create policy book_covers_write on storage.objects for insert to authenticated
  with check (bucket_id = 'book-covers' and private.has_role('moderator'));
create policy book_covers_update on storage.objects for update to authenticated
  using (bucket_id = 'book-covers' and private.has_role('moderator'))
  with check (bucket_id = 'book-covers' and private.has_role('moderator'));
create policy book_covers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'book-covers' and private.has_role('moderator'));

-- Event photos: folder = event id; the event's organizer (creator) or a moderator+.
create function private.can_edit_event_media(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('moderator')
      or (private.has_role('organizer') and exists (
            select 1 from public.events e
             where e.id::text = p_folder and e.created_by = (select auth.uid())))
$$;
revoke all on function private.can_edit_event_media(text) from public;
grant execute on function private.can_edit_event_media(text) to authenticated;

create policy event_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'event-photos');
create policy event_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and private.can_edit_event_media((storage.foldername(name))[1]));
create policy event_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'event-photos' and private.can_edit_event_media((storage.foldername(name))[1]))
  with check (bucket_id = 'event-photos' and private.can_edit_event_media((storage.foldername(name))[1]));
create policy event_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and private.can_edit_event_media((storage.foldername(name))[1]));
