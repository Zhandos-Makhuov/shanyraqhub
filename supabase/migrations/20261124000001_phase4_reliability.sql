-- Shanyraq Hub — Phase 4 Platform Reliability & Quality (2026-11-24). TEST project first; production only with the
-- owner's separate consent (together with the site merge). Additive and reversible (see "Undo" at the end).
--
-- 1. C-21 — owner decision 2026-11-24 (Phase 4 prompt): every signed-in member may see WHO REGISTERED for an event.
--    Only active registrations ("registered") of other people are readable; cancelled ones stay private
--    (own rows: any status; the event's organizer and moderator+: everything, as before). Nobody gets write access:
--    registrations are still changed only through register_for_event / cancel_event_registration.
--    The table has no private columns (event_id, user_id, status, registered_at, cancelled_at); phone numbers live in
--    profile_contacts (own / admin only) and are not touched. Who CAME (event_attendance) stays private (C-21, 23.11).
--    Anonymous visitors: no grant on the table (unchanged).
-- 2. Indexes for every foreign key the Supabase performance advisor reports as unindexed (27): joins, the
--    organizer check inside the registration/attendance policies (events.created_by) and cascading deletes
--    of a user stop scanning whole tables as the club grows.
-- 3. Admin catalogue policies split by command: the old "for all" policy was evaluated as a second SELECT policy
--    on every read (advisor: multiple_permissive_policies). Who may read/write is unchanged.

-- ---------------------------------------------------------------------
-- 1. C-21: registrations readable by every member (active ones)
-- ---------------------------------------------------------------------
drop policy registrations_read on public.event_registrations;
create policy registrations_read on public.event_registrations for select to authenticated
  using (status = 'registered'
         or user_id = (select auth.uid())
         or private.has_role('moderator')
         or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid())));

-- ---------------------------------------------------------------------
-- 2. Foreign-key indexes
-- ---------------------------------------------------------------------
create index if not exists telegram_link_codes_user_idx          on private.telegram_link_codes (user_id);
create index if not exists achievement_revocations_ach_idx        on public.achievement_revocations (achievement_id);
create index if not exists achievement_revocations_by_idx         on public.achievement_revocations (revoked_by);
create index if not exists audit_logs_actor_idx                   on public.audit_logs (actor_id);
create index if not exists books_created_by_idx                   on public.books (created_by);
create index if not exists broadcasts_sender_idx                  on public.broadcasts (sender_id);
create index if not exists chat_messages_sender_idx               on public.chat_messages (sender_id);
create index if not exists event_attendance_checked_in_by_idx     on public.event_attendance (checked_in_by);
create index if not exists event_checkin_tokens_user_idx          on public.event_checkin_tokens (user_id);
create index if not exists event_feedback_user_idx                on public.event_feedback (user_id);
create index if not exists events_created_by_idx                  on public.events (created_by);
create index if not exists events_direction_idx                   on public.events (direction);
create index if not exists forum_replies_author_idx               on public.forum_replies (author_id);
create index if not exists forum_reply_votes_user_idx             on public.forum_reply_votes (user_id);
create index if not exists forum_topic_votes_user_idx             on public.forum_topic_votes (user_id);
create index if not exists forum_topics_author_idx                on public.forum_topics (author_id);
create index if not exists memberships_decided_by_idx             on public.memberships (decided_by);
create index if not exists moderation_reports_resolved_by_idx     on public.moderation_reports (resolved_by);
create index if not exists moderation_reports_target_user_idx     on public.moderation_reports (target_user_id);
create index if not exists push_subscriptions_user_idx            on public.push_subscriptions (user_id);
create index if not exists reward_ledger_created_by_idx           on public.reward_ledger (created_by);
create index if not exists scheduled_notifications_event_idx      on public.scheduled_notifications (event_id);
create index if not exists user_achievements_ach_idx              on public.user_achievements (achievement_id);
create index if not exists user_books_book_idx                    on public.user_books (book_id);
create index if not exists user_equipment_user_item_idx           on public.user_equipment (user_id, item_id);
create index if not exists user_inventory_item_idx                on public.user_inventory (item_id);
create index if not exists user_roles_granted_by_idx              on public.user_roles (granted_by);

-- ---------------------------------------------------------------------
-- 3. Admin catalogue policies: one per write command (reads keep their own policy)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['achievements', 'shop_items', 'forum_categories', 'chat_rooms'] loop
    execute format('drop policy %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_role(''admin''))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_role(''admin'')) with check (private.has_role(''admin''))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_role(''admin''))', t || '_admin_delete', t);
  end loop;
end $$;

-- Undo (if ever needed, in one transaction):
--   drop policy registrations_read on public.event_registrations; then recreate it as in 20261123000001;
--   drop index <each index above>;
--   for each table: drop the three *_admin_* policies and recreate
--   "<table>_admin for all using (private.has_role('admin')) with check (private.has_role('admin'))".
