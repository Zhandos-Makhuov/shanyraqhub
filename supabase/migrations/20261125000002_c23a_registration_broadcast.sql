-- C-23a (owner decision 25.11.2026: yes): every signed-in member sees a freed place live.
--
-- Why not postgres_changes: Realtime filters row changes by RLS, and RLS (C-21) hides other people's
-- cancelled registrations — so a cancellation never reached ordinary members, only the organizer/moderators.
-- Why not "touch" the event row: events_audit writes an audit_logs row for every events UPDATE (log spam).
--
-- Instead: when a registration leaves the 'registered' state (cancel) or is deleted, the database sends a
-- Realtime Broadcast message on the PRIVATE topic 'shq-events' with only { event_id }. Open pages then reload
-- their data through the normal RLS-protected queries. No names, no user ids, nothing about attendance.
-- Private topic: only signed-in users may receive it (policy on realtime.messages below); anon cannot.
--
-- Additive: one trigger function, one trigger, one policy. Rollback:
--   drop trigger if exists registrations_broadcast on public.event_registrations;
--   drop function if exists private.broadcast_registration_change();
--   drop policy if exists shq_events_broadcast_read on realtime.messages;
-- On a plain PostgreSQL without the realtime schema (local tests) the function does nothing and no policy is made.

create or replace function private.broadcast_registration_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
    begin
      perform realtime.send(jsonb_build_object('event_id', coalesce(new.event_id, old.event_id)),
                            'registrations_changed', 'shq-events', true);
    exception when others then
      null; -- a live-update hint must never block a registration or a cancellation
    end;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.broadcast_registration_change() from public;

drop trigger if exists registrations_broadcast on public.event_registrations;
create trigger registrations_broadcast
  after update of status or delete on public.event_registrations
  for each row
  execute function private.broadcast_registration_change();

do $$
begin
  if to_regclass('realtime.messages') is not null
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                       and policyname = 'shq_events_broadcast_read') then
    execute $p$create policy shq_events_broadcast_read on realtime.messages for select to authenticated
               using (realtime.topic() = 'shq-events' and extension = 'broadcast')$p$;
  end if;
end $$;
