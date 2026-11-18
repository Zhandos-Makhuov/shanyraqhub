-- =====================================================================
-- Shanyraq Hub — Row Level Security (PROPOSAL, NOT APPLIED)
--
-- Model:
--   * anon        -> no table access at all (the app requires sign-in).
--   * authenticated -> read community data; write only own rows, and only
--                      the columns listed in the column-level GRANTs below.
--   * Balances, ledger, attendance, registrations, roles, achievements,
--     inventory, audit logs: NO client write policies. They change only
--     through the SECURITY DEFINER RPCs in 0002.
--   * service_role bypasses RLS: use it only in Edge Functions, never in
--     the browser bundle.
-- =====================================================================

-- Enable RLS on every table in public.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- Start from zero and grant back only what is needed.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, bio, city, telegram_handle, directions,
              preferred_language, push_notifications_enabled, telegram_notifications_enabled)
  on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select, update (phone) on public.profile_contacts to authenticated;
create policy contacts_read on public.profile_contacts for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'));
create policy contacts_update_own on public.profile_contacts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Roles & balances: readable (badges, leaderboard), never writable by clients.
grant select on public.user_roles, public.user_balances, public.tiers to authenticated;
create policy roles_read    on public.user_roles    for select to authenticated using (true);
create policy balances_read on public.user_balances for select to authenticated using (true);
create policy tiers_read    on public.tiers         for select to authenticated using (true);

grant select on public.reward_ledger to authenticated;
create policy ledger_read on public.reward_ledger for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role('admin'));

-- ---------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------
grant select, delete on public.events to authenticated;
grant insert (title, direction, starts_at, duration_minutes, format, location_address, location_details,
              online_url, description, required_materials, capacity, registration_deadline, status,
              speaker_name, speaker_role, speaker_avatar_url, speaker_bio, attendance_xp, attendance_coins)
  on public.events to authenticated;
grant update (title, direction, starts_at, duration_minutes, format, location_address, location_details,
              online_url, description, required_materials, capacity, registration_deadline, status,
              speaker_name, speaker_role, speaker_avatar_url, speaker_bio, attendance_xp, attendance_coins)
  on public.events to authenticated;

create policy events_read on public.events for select to authenticated
  using (status in ('published', 'completed', 'cancelled')
         or created_by = (select auth.uid())
         or private.has_role('moderator'));
create policy events_insert on public.events for insert to authenticated
  with check (private.has_role('organizer'));
create policy events_update on public.events for update to authenticated
  using ((created_by = (select auth.uid()) and private.has_role('organizer')) or private.has_role('moderator'))
  with check ((created_by = (select auth.uid()) and private.has_role('organizer')) or private.has_role('moderator'));
create policy events_delete on public.events for delete to authenticated
  using (private.has_role('admin'));

-- Registrations / attendance / feedback: read-only for clients.
grant select on public.event_registrations, public.event_attendance, public.event_feedback to authenticated;
create policy registrations_read on public.event_registrations for select to authenticated
  using (user_id = (select auth.uid()) or status = 'registered' or private.has_role('organizer'));
create policy attendance_read on public.event_attendance for select to authenticated using (true);
create policy feedback_read on public.event_feedback for select to authenticated using (true);
-- event_checkin_tokens: no grants, no policies -> unreachable from the API.

-- ---------------------------------------------------------------------
-- Library & reviews
-- ---------------------------------------------------------------------
grant select on public.books to authenticated;
grant update (title, author, genre, isbn, cover_color), delete on public.books to authenticated;
create policy books_read on public.books for select to authenticated using (true);
create policy books_moderate on public.books for update to authenticated
  using (private.has_role('moderator')) with check (private.has_role('moderator'));
create policy books_delete on public.books for delete to authenticated using (private.has_role('moderator'));

grant select, delete on public.user_books to authenticated;
grant update (rating, review) on public.user_books to authenticated;   -- status changes go through save_user_book()
create policy user_books_read on public.user_books for select to authenticated using (true);
create policy user_books_update_own on public.user_books for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_books_delete_own on public.user_books for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_role('moderator'));

grant select, delete on public.peer_reviews to authenticated;
grant insert (author_id, target_id, rating, aspect, comment) on public.peer_reviews to authenticated;
grant update (is_hidden) on public.peer_reviews to authenticated;
create policy reviews_read on public.peer_reviews for select to authenticated
  using (not is_hidden or author_id = (select auth.uid()) or private.has_role('moderator'));
create policy reviews_insert_own on public.peer_reviews for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy reviews_moderate on public.peer_reviews for update to authenticated
  using (private.has_role('moderator')) with check (private.has_role('moderator'));
create policy reviews_delete on public.peer_reviews for delete to authenticated
  using (author_id = (select auth.uid()) or private.has_role('moderator'));

-- ---------------------------------------------------------------------
-- Achievements, shop, inventory (catalogue editable by admins only)
-- ---------------------------------------------------------------------
grant select on public.achievements, public.user_achievements, public.shop_items,
                public.user_inventory, public.user_equipment, public.forum_categories to authenticated;
grant insert, update, delete on public.achievements, public.shop_items, public.forum_categories to authenticated;

create policy achievements_read on public.achievements for select to authenticated using (true);
create policy achievements_admin on public.achievements for all to authenticated
  using (private.has_role('admin')) with check (private.has_role('admin'));
create policy shop_items_read on public.shop_items for select to authenticated using (true);
create policy shop_items_admin on public.shop_items for all to authenticated
  using (private.has_role('admin')) with check (private.has_role('admin'));
create policy forum_categories_read on public.forum_categories for select to authenticated using (true);
create policy forum_categories_admin on public.forum_categories for all to authenticated
  using (private.has_role('admin')) with check (private.has_role('admin'));

create policy user_achievements_read on public.user_achievements for select to authenticated using (true);
create policy inventory_read on public.user_inventory for select to authenticated using (true);
create policy equipment_read on public.user_equipment for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Forum
-- ---------------------------------------------------------------------
grant select, delete on public.forum_topics, public.forum_replies to authenticated;
grant insert (category_id, direction, author_id, title, content) on public.forum_topics to authenticated;
grant update (title, content, is_pinned, is_closed, is_hidden) on public.forum_topics to authenticated;
grant insert (topic_id, author_id, content) on public.forum_replies to authenticated;
grant update (content, is_hidden) on public.forum_replies to authenticated;

create policy topics_read on public.forum_topics for select to authenticated
  using (not is_hidden or author_id = (select auth.uid()) or private.has_role('moderator'));
create policy topics_insert_own on public.forum_topics for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy topics_update on public.forum_topics for update to authenticated
  using (author_id = (select auth.uid()) or private.has_role('moderator'))
  with check (author_id = (select auth.uid()) or private.has_role('moderator'));
create policy topics_delete on public.forum_topics for delete to authenticated
  using (author_id = (select auth.uid()) or private.has_role('moderator'));

create policy replies_read on public.forum_replies for select to authenticated
  using (not is_hidden or author_id = (select auth.uid()) or private.has_role('moderator'));
create policy replies_insert_own on public.forum_replies for insert to authenticated
  with check (author_id = (select auth.uid())
              and exists (select 1 from public.forum_topics t
                           where t.id = topic_id and not t.is_closed and not t.is_hidden));
create policy replies_update on public.forum_replies for update to authenticated
  using (author_id = (select auth.uid()) or private.has_role('moderator'))
  with check (author_id = (select auth.uid()) or private.has_role('moderator'));
create policy replies_delete on public.forum_replies for delete to authenticated
  using (author_id = (select auth.uid()) or private.has_role('moderator'));

grant select, delete on public.forum_topic_votes, public.forum_reply_votes to authenticated;
grant insert (topic_id, user_id) on public.forum_topic_votes to authenticated;
grant insert (reply_id, user_id) on public.forum_reply_votes to authenticated;
create policy topic_votes_read on public.forum_topic_votes for select to authenticated using (true);
create policy topic_votes_insert on public.forum_topic_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy topic_votes_delete on public.forum_topic_votes for delete to authenticated using (user_id = (select auth.uid()));
create policy reply_votes_read on public.forum_reply_votes for select to authenticated using (true);
create policy reply_votes_insert on public.forum_reply_votes for insert to authenticated with check (user_id = (select auth.uid()));
create policy reply_votes_delete on public.forum_reply_votes for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------
grant select on public.chat_rooms, public.chat_messages to authenticated;
grant insert, update, delete on public.chat_rooms to authenticated;
grant insert (room_id, sender_id, body) on public.chat_messages to authenticated;
grant update (is_hidden) on public.chat_messages to authenticated;

create policy chat_rooms_read on public.chat_rooms for select to authenticated using (private.has_role(min_role));
create policy chat_rooms_admin on public.chat_rooms for all to authenticated
  using (private.has_role('admin')) with check (private.has_role('admin'));
create policy chat_messages_read on public.chat_messages for select to authenticated
  using ((not is_hidden or private.has_role('moderator'))
         and exists (select 1 from public.chat_rooms r where r.id = room_id and private.has_role(r.min_role)));
create policy chat_messages_insert on public.chat_messages for insert to authenticated
  with check (sender_id = (select auth.uid())
              and exists (select 1 from public.chat_rooms r where r.id = room_id and private.has_role(r.min_role)));
create policy chat_messages_moderate on public.chat_messages for update to authenticated
  using (private.has_role('moderator')) with check (private.has_role('moderator'));

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth_key, user_agent) on public.push_subscriptions to authenticated;
create policy push_own_read on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- scheduled_notifications: service role only (no grants, no policies).

grant select on public.broadcasts to authenticated;
create policy broadcasts_staff_read on public.broadcasts for select to authenticated using (private.has_role('moderator'));

grant select on public.audit_logs to authenticated;
create policy audit_admin_read on public.audit_logs for select to authenticated using (private.has_role('admin'));

grant select on public.member_stats to authenticated;
