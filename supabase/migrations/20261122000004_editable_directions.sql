-- Shanyraq Hub — directions the admins can add, edit and archive (owner decisions 2026-11-20):
--   * "delete" = archive: hidden from the site and from every choice, history (events, visits, XP, earned
--     achievements, memberships) is kept; an archived direction can be restored;
--   * a new direction gets its own "5 visits" achievement (150 XP / 80 coins), archived together with it.
--
-- Until now a direction id was the enum public.direction_id (a fixed list). It becomes text that must name a
-- row of public.community_directions (events, memberships) or at least look like an id (forum, rooms,
-- broadcasts, which also use the forum's "general"). Values are kept as they are; nothing is deleted.

-- 1. What depends on the enum and has to be rebuilt around the type change.
drop policy memberships_read on public.memberships;
drop function public.request_membership(public.direction_id, text);
drop function public.leave_membership(public.direction_id);
drop function public.set_direction_lead(uuid, public.direction_id, boolean);
drop function public.dispatch_broadcast(text, text, text[], public.direction_id);
drop function private.can_manage_direction(public.direction_id);
alter table public.memberships drop constraint memberships_direction_fkey;

-- 2. enum -> text (same values).
alter table public.community_directions alter column id type text using id::text;
alter table public.memberships          alter column direction type text using direction::text;
alter table public.events               alter column direction type text using direction::text;
alter table public.forum_topics         alter column direction type text using direction::text;
alter table public.chat_rooms           alter column direction type text using direction::text;
alter table public.broadcasts           alter column target_direction type text using target_direction::text;
alter table public.profiles             alter column directions drop default;
alter table public.profiles             alter column directions type text[] using directions::text[];
alter table public.profiles             alter column directions set default '{}';

alter table public.community_directions add constraint community_directions_id_format check (id ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.memberships add constraint memberships_direction_fkey
  foreign key (direction) references public.community_directions (id) on delete restrict;
alter table public.events add constraint events_direction_fkey
  foreign key (direction) references public.community_directions (id) on delete restrict;
alter table public.forum_topics add constraint forum_topics_direction_format check (direction is null or direction ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.chat_rooms   add constraint chat_rooms_direction_format   check (direction is null or direction ~ '^[a-z][a-z0-9_]{1,30}$');
alter table public.broadcasts   add constraint broadcasts_direction_format   check (target_direction is null or target_direction ~ '^[a-z][a-z0-9_]{1,30}$');

-- 3. The same functions and policy, with text ids.
create function private.can_manage_direction(p_direction text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('moderator')
      or exists (select 1 from public.memberships m
                  where m.user_id = (select auth.uid()) and m.direction = p_direction
                    and m.status = 'active' and m.role = 'lead')
$$;

create function public.request_membership(p_direction text, p_message text default null)
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

create function public.leave_membership(p_direction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('member');
begin
  update public.memberships set status = 'left', role = 'member'
   where user_id = uid and direction = p_direction and status in ('pending', 'active');
  return found;
end $$;

create function public.set_direction_lead(p_user uuid, p_direction text, p_is_lead boolean)
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

create function public.dispatch_broadcast(p_title text, p_body text, p_channels text[], p_direction text default null)
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
  return v_id;
end $$;

create policy memberships_read on public.memberships for select to authenticated
  using (status = 'active'
         or user_id = (select auth.uid())
         or private.can_manage_direction(direction));

-- Achievement metric: the rule's direction is now plain text (body otherwise unchanged).
create or replace function private.achievement_metric(p_user uuid, p_rule jsonb) returns int
language plpgsql stable security definer set search_path = '' as $$
declare
  v_metric text := p_rule ->> 'metric';
  v_dir text := nullif(p_rule ->> 'direction', '');
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


drop type public.direction_id;

-- 4. Admin RPCs: add / edit / archive / restore. Ids are permanent (history refers to them).
create function private.direction_achievement_id(p_direction text) returns text
language sql immutable set search_path = '' as $$ select 'ach-dir-' || p_direction $$;

-- p: {id?, name_ru, name_kz, name_en, short_name_ru, short_name_kz, short_name_en,
--     description_ru, description_kz, description_en, icon, color, requires_approval, sort_order}
-- Without an existing id a new direction is created (with its "5 visits" achievement).
create function public.admin_save_direction(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('admin');
  v_id text := lower(trim(coalesce(p ->> 'id', '')));
  v_new boolean;
  v_short_ru text; v_short_kz text; v_short_en text;
begin
  if v_id !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'direction_invalid_id' using errcode = 'P0001'; end if;
  if coalesce(trim(p ->> 'name_ru'), '') = '' or coalesce(trim(p ->> 'name_kz'), '') = '' or coalesce(trim(p ->> 'name_en'), '') = '' then
    raise exception 'direction_names_required' using errcode = 'P0001';
  end if;
  v_new := not exists (select 1 from public.community_directions where id = v_id);
  if v_new and v_id = 'general' then raise exception 'direction_invalid_id' using errcode = 'P0001'; end if;
  v_short_ru := coalesce(nullif(trim(p ->> 'short_name_ru'), ''), left(trim(p ->> 'name_ru'), 40));
  v_short_kz := coalesce(nullif(trim(p ->> 'short_name_kz'), ''), left(trim(p ->> 'name_kz'), 40));
  v_short_en := coalesce(nullif(trim(p ->> 'short_name_en'), ''), left(trim(p ->> 'name_en'), 40));

  insert into public.community_directions as d (id, name_ru, name_kz, name_en, short_name_ru, short_name_kz, short_name_en,
      description_ru, description_kz, description_en, icon, color, requires_approval, sort_order)
  values (v_id, trim(p ->> 'name_ru'), trim(p ->> 'name_kz'), trim(p ->> 'name_en'), v_short_ru, v_short_kz, v_short_en,
      coalesce(trim(p ->> 'description_ru'), ''), coalesce(trim(p ->> 'description_kz'), ''), coalesce(trim(p ->> 'description_en'), ''),
      nullif(trim(p ->> 'icon'), ''), nullif(trim(p ->> 'color'), ''), coalesce((p ->> 'requires_approval')::boolean, true),
      coalesce((p ->> 'sort_order')::int, (select coalesce(max(sort_order), 0) + 1 from public.community_directions)))
  on conflict (id) do update set   -- editing: names always; other fields only when given
      name_ru = excluded.name_ru, name_kz = excluded.name_kz, name_en = excluded.name_en,
      short_name_ru = case when p ? 'short_name_ru' then excluded.short_name_ru else d.short_name_ru end,
      short_name_kz = case when p ? 'short_name_kz' then excluded.short_name_kz else d.short_name_kz end,
      short_name_en = case when p ? 'short_name_en' then excluded.short_name_en else d.short_name_en end,
      description_ru = case when p ? 'description_ru' then excluded.description_ru else d.description_ru end,
      description_kz = case when p ? 'description_kz' then excluded.description_kz else d.description_kz end,
      description_en = case when p ? 'description_en' then excluded.description_en else d.description_en end,
      icon = case when p ? 'icon' then excluded.icon else d.icon end,
      color = case when p ? 'color' then excluded.color else d.color end,
      requires_approval = case when p ? 'requires_approval' then excluded.requires_approval else d.requires_approval end,
      sort_order = coalesce((p ->> 'sort_order')::int, d.sort_order);
  select short_name_ru, short_name_kz, short_name_en into v_short_ru, v_short_kz, v_short_en
    from public.community_directions where id = v_id;

  -- The direction's own "5 visits" achievement (created with it; its texts follow the direction's name).
  if v_new then
    insert into public.achievements (id, title_ru, title_kz, title_en, description_ru, description_kz, description_en,
                                     icon, category, rule, xp_reward, coin_reward)
    values (private.direction_achievement_id(v_id),
            'Завсегдатай: ' || v_short_ru, v_short_kz || ': тұрақты қатысушы', 'Regular: ' || v_short_en,
            'Посетите 5 встреч направления «' || trim(p ->> 'name_ru') || '»',
            '«' || trim(p ->> 'name_kz') || '» бағытының 5 кездесуіне қатысыңыз',
            'Attend 5 meetups of “' || trim(p ->> 'name_en') || '”',
            'Award', 'community', jsonb_build_object('metric', 'events_attended', 'direction', v_id, 'threshold', 5), 150, 80)
    on conflict (id) do nothing;
  else
    update public.achievements set
        title_ru = 'Завсегдатай: ' || v_short_ru, title_kz = v_short_kz || ': тұрақты қатысушы', title_en = 'Regular: ' || v_short_en,
        description_ru = 'Посетите 5 встреч направления «' || trim(p ->> 'name_ru') || '»',
        description_kz = '«' || trim(p ->> 'name_kz') || '» бағытының 5 кездесуіне қатысыңыз',
        description_en = 'Attend 5 meetups of “' || trim(p ->> 'name_en') || '”'
     where id = private.direction_achievement_id(v_id);
  end if;

  perform private.audit(case when v_new then 'DIRECTION_CREATE' else 'DIRECTION_UPDATE' end, 'direction', v_id, p);
  return v_id;
end $$;

-- Archive (p_active = false) or restore. Archived: hidden from choices; history stays; its achievement is hidden too.
create function public.admin_set_direction_active(p_id text, p_active boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('admin');
begin
  update public.community_directions set is_active = p_active where id = p_id;
  if not found then raise exception 'direction_not_found' using errcode = 'P0002'; end if;
  update public.achievements set is_active = p_active where id = private.direction_achievement_id(p_id);
  perform private.audit(case when p_active then 'DIRECTION_RESTORE' else 'DIRECTION_ARCHIVE' end, 'direction', p_id, '{}'::jsonb);
  return true;
end $$;

-- 5. Privileges (as before, with the new signatures).
revoke all on function private.can_manage_direction(text), private.direction_achievement_id(text) from public;
grant execute on function private.can_manage_direction(text) to authenticated;  -- used in RLS
revoke all on function
  public.request_membership(text, text), public.leave_membership(text),
  public.set_direction_lead(uuid, text, boolean), public.dispatch_broadcast(text, text, text[], text),
  public.admin_save_direction(jsonb), public.admin_set_direction_active(text, boolean)
  from public, anon;
grant execute on function
  public.request_membership(text, text), public.leave_membership(text),
  public.set_direction_lead(uuid, text, boolean), public.dispatch_broadcast(text, text, text[], text),
  public.admin_save_direction(jsonb), public.admin_set_direction_active(text, boolean)
  to authenticated;
