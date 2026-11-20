-- Shanyraq Hub — owner decision 2026-11-20: a super admin may act on themselves too (adjust own coins,
-- award / revoke own achievements, check themselves in, decide on their own direction application, change
-- their own role). Everyone else keeps the "not on yourself" rules. What stays for everyone: balances never
-- below zero, the last super admin cannot be demoted, every action is written to the audit log.
-- The functions below are the previous definitions with only the self-action condition changed.

create or replace function public.award_achievement(p_user uuid, p_achievement text, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  perform private.require_role('moderator');
  if p_user = auth.uid() and not private.has_role('superadmin') then
    raise exception 'cannot award an achievement to yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from public.achievements where id = p_achievement and rule ->> 'metric' = 'manual') then
    raise exception 'achievement % is not manually awardable', p_achievement;
  end if;
  update public.achievement_revocations set lifted_at = now()
   where user_id = p_user and achievement_id = p_achievement and lifted_at is null;   -- deliberate re-award
  v_ok := private.unlock_achievement(p_user, p_achievement);
  perform private.audit('ACHIEVEMENT_AWARD', 'user', p_user::text,
    jsonb_build_object('achievement', p_achievement, 'note', p_note, 'granted', v_ok));
  return v_ok;
end $$;

create or replace function public.revoke_achievement(p_user uuid, p_achievement text, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_role('admin');
  a public.achievements;
  v_coins int;
  v_n int;
begin
  if p_user = actor and not private.has_role('superadmin') then
    raise exception 'cannot revoke your own achievement' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into a from public.achievements where id = p_achievement;
  delete from public.user_achievements where user_id = p_user and achievement_id = p_achievement;
  if not found then return false; end if;

  insert into public.achievement_revocations (user_id, achievement_id, revoked_by, reason)
  values (p_user, p_achievement, actor, trim(p_reason));
  select count(*) into v_n from public.achievement_revocations where user_id = p_user and achievement_id = p_achievement;

  select least(coins, a.coin_reward) into v_coins from public.user_balances where user_id = p_user for update;
  perform private.grant_reward(p_user, -a.xp_reward, -v_coins, 'admin_adjustment', a.id,
    'Отзыв достижения: ' || a.title_ru, 'revoke:' || a.id || ':' || p_user || ':' || v_n);
  perform private.notify(p_user, 'achievement', 'Достижение отозвано',
    format('Администратор отозвал «%s». Причина: %s', a.title_ru, trim(p_reason)), 'achievements',
    jsonb_build_object('achievement_id', a.id), 'revoke:' || a.id || ':' || v_n);
  perform private.audit('ACHIEVEMENT_REVOKE', 'user', p_user::text,
    jsonb_build_object('achievement', a.id, 'reason', trim(p_reason), 'xp', -a.xp_reward, 'coins', -v_coins));
  return true;
end $$;

create or replace function public.check_in_with_token(p_token text)
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
  if t.user_id = staff and not private.has_role('superadmin') then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;

  select * into ev from public.events e where e.id = t.event_id;
  if not private.has_role('moderator') and ev.created_by is distinct from staff then
    raise exception 'forbidden: not an organizer of this event' using errcode = '42501';
  end if;

  update public.event_checkin_tokens set used_at = now() where id = t.id;
  v_new := private.record_attendance(t.event_id, t.user_id, 'qr');
  return query select t.event_id, t.user_id, v_new;
end $$;

create or replace function public.manual_check_in(p_event uuid, p_user uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  staff uuid := private.require_role('organizer');
  ev public.events;
  v_new boolean;
begin
  if p_user = staff and not private.has_role('superadmin') then raise exception 'cannot_check_in_yourself' using errcode = '42501'; end if;
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

create or replace function public.admin_adjust_coins(p_user uuid, p_amount int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_role('admin');
begin
  if p_user = actor and not private.has_role('superadmin') then raise exception 'cannot adjust your own balance' using errcode = '42501'; end if;
  if p_amount = 0 or abs(p_amount) > 10000 then raise exception 'amount out of range'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;

  perform private.grant_reward(p_user, 0, p_amount, 'admin_adjustment', null, p_reason,
    'admin:' || gen_random_uuid());
  perform private.audit('COIN_ADJUST', 'user', p_user::text, jsonb_build_object('amount', p_amount, 'reason', p_reason));
end $$;

create or replace function public.set_user_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.require_role('admin');
  v_actor_rank int := private.role_rank(private.current_app_role());
  v_old public.app_role;
begin
  if p_user = actor and not private.has_role('superadmin') then raise exception 'cannot change your own role' using errcode = '42501'; end if;
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

create or replace function public.review_membership(p_membership uuid, p_approve boolean, p_note text default null)
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
  if v_m.user_id = uid and not private.has_role('superadmin') then raise exception 'cannot review own membership' using errcode = '42501'; end if;
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
