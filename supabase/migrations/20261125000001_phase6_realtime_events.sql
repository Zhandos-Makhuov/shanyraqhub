-- Phase 6 (C-23): event changes and registrations arrive live.
-- Adds public.events and public.event_registrations to the Realtime publication, so open pages
-- (the organizer's check-in desk, the member's event window, places left) refresh without a reload.
--
-- Deliberately NOT added: public.event_attendance. Realtime filters INSERT/UPDATE by RLS, but a DELETE
-- is sent with its primary key (event_id, user_id) to anyone subscribed to the table — undo_check_in
-- deletes attendance rows, so "who came" (closed by C-21) would leak. Registrations are readable by every
-- signed-in member anyway (C-21) and are cancelled by UPDATE, so nothing new is exposed.
--
-- Additive and idempotent: no tables, no data, no RLS changes. Rollback:
--   alter publication supabase_realtime drop table public.events, public.event_registrations;
-- On a plain PostgreSQL without the publication (local tests) the block does nothing.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['events', 'event_registrations'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
