-- Shanyraq Hub — Phase 4.1 residual corrections (2026-11-24). TEST project first; production only with the
-- owner's separate consent (together with the site merge). Additive and reversible (see "Undo" at the end).
-- Reward logic, XP, coins, achievements and the reward ledger are NOT changed.
--
-- 1. S-3 (owner decision 2026-11-24, "RLS only"): a member may delete only own books with status 'reading'.
--    A finished ('completed') entry can no longer be deleted through the API, so deleting it cannot free the
--    weekly book credit. Moderator+ keep deleting any entry (moderation), as before.
--    Known remaining path (owner chose not to close it now — backlog S-3a): a finished book can still be
--    switched back to 'reading' through save_user_book (and the edit window), after which the weekly check no
--    longer sees it.
-- 2. P4-10: an event's capacity cannot be set below its active registrations. Checked in a trigger on the
--    event row; register_for_event locks the same row (select … for update), so a registration and a capacity
--    change are serialized — no race. Registrations are never cancelled or removed automatically.

-- ---------------------------------------------------------------------
-- 1. S-3: own deletions only while reading
-- ---------------------------------------------------------------------
drop policy user_books_delete_own on public.user_books;
create policy user_books_delete_own on public.user_books for delete to authenticated
  using ((user_id = (select auth.uid()) and status = 'reading') or private.has_role('moderator'));

-- ---------------------------------------------------------------------
-- 2. P4-10: capacity >= active registrations
-- ---------------------------------------------------------------------
create function private.guard_event_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_taken int;
begin
  if new.capacity < old.capacity then
    select count(*) into v_taken from public.event_registrations r
     where r.event_id = new.id and r.status = 'registered';
    if new.capacity < v_taken then
      raise exception 'capacity_below_registered' using errcode = 'P0001',
        detail = format('capacity %s < registered %s', new.capacity, v_taken);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_event_capacity() from public;

create trigger events_capacity_guard before update of capacity on public.events
  for each row execute function private.guard_event_capacity();

-- Undo (if ever needed, in one transaction):
--   drop trigger events_capacity_guard on public.events; drop function private.guard_event_capacity();
--   drop policy user_books_delete_own on public.user_books;
--   create policy user_books_delete_own on public.user_books for delete to authenticated
--     using (user_id = (select auth.uid()) or private.has_role('moderator'));
