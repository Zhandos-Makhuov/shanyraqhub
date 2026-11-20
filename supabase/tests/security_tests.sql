\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;
create schema t;
create function t.expect_fail(p_sql text, p_like text default '%') returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm not like p_like then raise exception 'WRONG ERROR for [%]: %', p_sql, sqlerrm; end if;
    raise notice 'PASS blocked: % -> %', left(p_sql, 75), sqlerrm; return;
  end;
  raise exception 'FAIL: expected error but succeeded: %', p_sql;
end $$;
create function t.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;
grant usage on schema t to authenticated, anon; grant execute on all functions in schema t to authenticated, anon;

-- Users (simulating Supabase Auth sign-ups) -> trigger bootstraps profile/role/balance
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'sa@x.kz', '{"handle":"Super_Admin","display_name":"SA"}'),
 ('00000000-0000-0000-0000-00000000000b', 'ad@x.kz', '{}'),
 ('00000000-0000-0000-0000-00000000000c', 'org@x.kz', '{"handle":"Super_Admin"}'),
 ('00000000-0000-0000-0000-000000000001', 'm1@x.kz', '{"handle":"m1"}'),
 ('00000000-0000-0000-0000-000000000002', 'm2@x.kz', '{"handle":"m2"}');
update public.user_roles set role = 'superadmin' where user_id = '00000000-0000-0000-0000-00000000000a';  -- bootstrap via SQL editor only
select t.ok((select count(*) from public.profiles) = 5 and (select count(*) from public.user_balances) = 5, 'signup trigger created profiles + balances');
select t.ok((select handle::text from public.profiles where id = '00000000-0000-0000-0000-00000000000c') like 'user_%', 'duplicate handle falls back to generated handle');

-- anon
set role anon;
select t.expect_fail('select * from public.profiles', '%permission denied%');
select t.expect_fail('select public.register_for_event(gen_random_uuid())', '%permission denied%');
reset role;

-- Member cannot touch balances / roles / ledger
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail('update public.user_balances set coins = 99999', '%permission denied%');
select t.expect_fail('update public.user_roles set role = ''superadmin''', '%permission denied%');
select t.expect_fail('insert into public.reward_ledger (user_id, coin_delta, source, reason, idempotency_key) values (auth.uid(), 999, ''admin_adjustment'', ''x'', ''x'')', '%permission denied%');
select t.expect_fail('select private.grant_reward(auth.uid(), 1, 1, ''admin_adjustment'', null, ''x'', ''k'')', '%permission denied%');
select t.expect_fail('select * from public.event_checkin_tokens', '%permission denied%');
select t.expect_fail('select public.claim_due_notifications(10)', '%permission denied%');
select t.expect_fail($$select public.set_user_role('00000000-0000-0000-0000-000000000001', 'admin')$$, '%forbidden%');
select t.expect_fail($$select public.admin_adjust_coins('00000000-0000-0000-0000-000000000002', 500, 'x')$$, '%forbidden%');
select t.expect_fail($$insert into public.events (title, direction, starts_at, capacity, status) values ('Hack', 'books', now() + interval '1 day', 5, 'published')$$, '%row-level security%');
update public.profiles set bio = 'hello' where id = auth.uid();
update public.profiles set bio = 'pwned' where id = '00000000-0000-0000-0000-000000000002';
select t.ok((select bio from public.profiles where id = '00000000-0000-0000-0000-000000000002') = '', 'member cannot edit another profile');
select t.ok((select count(*) from public.audit_logs) = 0, 'member sees no audit logs');
select t.ok((select count(*) from public.profile_contacts) = 1, 'member sees only own contact row');

-- Role management hierarchy
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select public.set_user_role('00000000-0000-0000-0000-00000000000b', 'admin');
select t.expect_fail($$select public.set_user_role('00000000-0000-0000-0000-00000000000a', 'member')$$, '%own role%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.set_user_role('00000000-0000-0000-0000-00000000000c', 'organizer');
select t.expect_fail($$select public.set_user_role('00000000-0000-0000-0000-000000000001', 'admin')$$, '%insufficient rank%');
select t.expect_fail($$select public.set_user_role('00000000-0000-0000-0000-00000000000a', 'member')$$, '%insufficient rank%');
select t.ok((select count(*) from public.audit_logs where action = 'ROLE_UPDATE') = 2, 'role changes audited');

-- Events: organizer creates, cannot inflate rewards
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select t.expect_fail($$insert into public.events (title, direction, starts_at, capacity, status, attendance_xp) values ('Greedy', 'books', now() + interval '1 hour', 5, 'published', 1000)$$, '%only admins%');
insert into public.events (title, direction, starts_at, capacity, status) values ('Book Club', 'books', now() + interval '1 hour', 1, 'published');
select id as ev from public.events where title = 'Book Club' \gset
select t.ok((select created_by from public.events where id = :'ev') = '00000000-0000-0000-0000-00000000000c', 'created_by forced to caller');

-- Registration: idempotent + capacity
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select public.register_for_event(:'ev');
select public.register_for_event(:'ev');
select t.ok((select count(*) from public.event_registrations where event_id = :'ev') = 1, 'double registration produces one row');
select t.expect_fail('select * from public.scheduled_notifications', '%permission denied%');
reset role;
select t.ok((select count(*) from public.scheduled_notifications) = 0, 'no reminders queued for times already past (2h/24h before a 1h-away event)');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.expect_fail($$select public.register_for_event('$$ || :'ev' || $$')$$, '%event_full%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select public.cancel_event_registration(:'ev');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select public.register_for_event(:'ev');
select t.ok((select registered from public.get_event_counts(array[:'ev'::uuid])) = 1, 'capacity respected after cancel + re-register');

-- QR attendance
select token as tok from public.issue_checkin_token(:'ev') \gset
select t.expect_fail($$select * from public.check_in_with_token('$$ || :'tok' || $$')$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select * from public.issue_checkin_token('$$ || :'ev' || $$')$$, '%not_registered%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select t.ok((select newly_checked_in from public.check_in_with_token('shq1:' || :'tok')), 'organizer QR check-in succeeds');
select t.expect_fail($$select * from public.check_in_with_token('$$ || :'tok' || $$')$$, '%token_already_used%');
select t.expect_fail($$select * from public.check_in_with_token('deadbeef')$$, '%invalid_token%');
select t.ok(not public.manual_check_in(:'ev', '00000000-0000-0000-0000-000000000002', 'phone died'), 'manual re-check-in is a no-op');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select token as tok2 from public.issue_checkin_token(:'ev') \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select t.ok(not (select newly_checked_in from public.check_in_with_token(:'tok2')), 'second valid token does not re-reward');
reset role;
-- attendance 60xp/40c + first-event achievement 60xp/50c
select t.ok((select xp = 120 and coins = 90 from public.user_balances where user_id = '00000000-0000-0000-0000-000000000002'), 'attendance + achievement rewarded exactly once (120 XP / 90 coins)');
update public.event_checkin_tokens set used_at = null, expires_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select t.expect_fail($$select * from public.check_in_with_token('$$ || :'tok2' || $$')$$, '%token_expired%');

-- Feedback requires attendance, once
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select public.submit_event_feedback('$$ || :'ev' || $$', 5, 5, 'x')$$, '%requires_attendance%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select public.submit_event_feedback(:'ev', 5, 4, 'great');
select t.expect_fail($$select public.submit_event_feedback('$$ || :'ev' || $$', 5, 5, 'again')$$, '%duplicate key%');

-- Shop
select t.expect_fail($$select public.purchase_shop_item((select id from public.shop_items order by price_coins desc limit 1))$$, '%insufficient_coins%');
select id as cheap from public.shop_items where price_coins <= 110 order by price_coins limit 1 \gset
select public.purchase_shop_item(:'cheap');
select t.expect_fail($$select public.purchase_shop_item('$$ || :'cheap' || $$')$$, '%already_owned%');
select public.equip_item(:'cheap');
select t.expect_fail($$select public.equip_item((select id from public.shop_items where id <> '$$ || :'cheap' || $$' limit 1))$$, '%item_not_owned%');

-- Forum: no toggle farming, no self-votes, no self-moderation
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
insert into public.forum_topics (category_id, author_id, title, content) values ('books', auth.uid(), 'Abai', 'Thoughts?');
select id as topic from public.forum_topics where title = 'Abai' \gset
select t.expect_fail($$update public.forum_topics set is_pinned = true where id = '$$ || :'topic' || $$'$$, '%moderation%');
select t.expect_fail($$insert into public.forum_topics (category_id, author_id, title, content) values ('books', '00000000-0000-0000-0000-000000000002', 'Spoof', 'x')$$, '%row-level security%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
insert into public.forum_replies (topic_id, author_id, content) values (:'topic', auth.uid(), 'Great book');
select id as reply from public.forum_replies limit 1 \gset
select t.expect_fail($$insert into public.forum_reply_votes (reply_id, user_id) values ('$$ || :'reply' || $$', auth.uid())$$, '%own_reply%');
reset role;
select xp as m2_xp_before from public.user_balances where user_id = '00000000-0000-0000-0000-000000000002' \gset
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
insert into public.forum_reply_votes (reply_id, user_id) values (:'reply', auth.uid());
delete from public.forum_reply_votes where reply_id = :'reply';
insert into public.forum_reply_votes (reply_id, user_id) values (:'reply', auth.uid());
reset role;
select t.ok((select xp from public.user_balances where user_id = '00000000-0000-0000-0000-000000000002') = :m2_xp_before + 15, 'upvote/unvote/upvote rewards author once');

-- Peer reviews
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$insert into public.peer_reviews (author_id, target_id, rating, aspect, comment) values (auth.uid(), auth.uid(), 5, 'knowledge', 'me')$$, '%check constraint%');
insert into public.peer_reviews (author_id, target_id, rating, aspect, comment) values (auth.uid(), '00000000-0000-0000-0000-000000000002', 5, 'knowledge', 'Helpful');
select t.expect_fail($$insert into public.peer_reviews (author_id, target_id, rating, aspect, comment) values (auth.uid(), '00000000-0000-0000-0000-000000000002', 5, 'knowledge', 'again')$$, '%duplicate key%');
select t.ok((select count(*) from public.notifications where user_id <> auth.uid()) = 0, 'cannot read other users notifications');
select t.expect_fail($$update public.notifications set title = 'x'$$, '%permission denied%');

-- Admin coins
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select t.expect_fail($$select public.admin_adjust_coins('00000000-0000-0000-0000-00000000000b', 100, 'me')$$, '%own balance%');
select t.expect_fail($$select public.admin_adjust_coins('00000000-0000-0000-0000-000000000001', -9999, 'drain')$$, '%check constraint%');
select public.admin_adjust_coins('00000000-0000-0000-0000-000000000001', 100, 'Volunteer help');
select t.ok((select count(*) from public.audit_logs where action = 'COIN_ADJUST') = 1, 'admin can read audit log; adjustment audited');
select t.ok((select count(*) from public.member_stats) = 5, 'leaderboard view readable');
reset role;

-- Achievements: automatic unlocks from verified data, manual ones by staff only
select t.ok(exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-000000000001' and achievement_id = 'ach-first-topic'),
            'forum topic unlocks ach-first-topic (author)');
select t.ok(exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-000000000002' and achievement_id = 'ach-first-event'),
            'verified attendance unlocks ach-first-event');
select t.ok(private.activity_streak('00000000-0000-0000-0000-000000000002') = 1, 'activity streak = 1 day for today''s activity');
select t.ok(private.activity_week_streak('00000000-0000-0000-0000-000000000002') = 1, 'week streak = 1 for activity this week');
-- back-fill activity 1 and 2 weeks ago -> 3 weeks in a row; 4 weeks ago is a gap
insert into public.forum_topics (category_id, author_id, title, content, created_at) values
  ('books', '00000000-0000-0000-0000-000000000002', 'Week -1', 'x', now() - interval '7 days'),
  ('books', '00000000-0000-0000-0000-000000000002', 'Week -2', 'x', now() - interval '14 days'),
  ('books', '00000000-0000-0000-0000-000000000002', 'Week -4', 'x', now() - interval '28 days');
select t.ok(private.activity_week_streak('00000000-0000-0000-0000-000000000002') = 3, 'week streak = 3 (this week + 2 previous), gap before');
select t.ok(private.activity_streak('00000000-0000-0000-0000-000000000002') = 1, 'day streak unaffected by weekly activity');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
-- Books are self-reported: credited only with a 100+ char review, one book per week
select public.save_user_book('Короткая', 'Автор', 'Роман', 'completed', 5, 'Сильная эпопея');
select t.ok(not exists (select 1 from public.reward_ledger where user_id = auth.uid() and source = 'book_added'),
            'book with a short review: no reward');
select t.ok(not exists (select 1 from public.user_achievements where user_id = auth.uid() and achievement_id = 'ach-first-book'),
            'book with a short review: no book achievement');
select public.save_user_book('Қан мен тер', 'Нұрпейісов', 'Роман', 'completed', 5,
  'Сильная эпопея о судьбе казахского народа в начале двадцатого века. Заставила иначе посмотреть на историю.');
select t.ok((select count(*) from public.user_achievements where user_id = auth.uid()
              and achievement_id in ('ach-first-book', 'ach-first-book-review')) = 2, 'book with 100+ char review unlocks first-book + first-review');
select public.save_user_book('Абай жолы', 'Әуезов', 'Роман', 'completed', 5,
  'Великий роман о поэте и мыслителе. Показывает степь, её людей и вечный поиск правды, знания и справедливости.',
  (current_date - 30));
select t.ok((select count(*) from public.reward_ledger where user_id = auth.uid() and source = 'book_added') = 1,
            'second credited-quality book in the same week: no reward (one per week)');
select t.ok((select finished_at from public.user_books ub join public.books b on b.id = ub.book_id
              where ub.user_id = auth.uid() and b.title = 'Абай жолы') = (now() at time zone 'Asia/Almaty')::date,
            'client-supplied back-dated finish date is ignored');
reset role;
select t.ok(private.achievement_metric('00000000-0000-0000-0000-000000000001', '{"metric":"books_completed"}') = 1, 'books_completed counts one book this week');
set role authenticated;
select t.expect_fail($$select public.award_achievement('00000000-0000-0000-0000-000000000002', 'ach-knowledge-seeker', 'x')$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select t.expect_fail($$select public.award_achievement('00000000-0000-0000-0000-000000000002', 'ach-first-book', 'x')$$, '%not manually awardable%');
select t.expect_fail($$select public.award_achievement('00000000-0000-0000-0000-00000000000a', 'ach-knowledge-seeker', 'x')$$, '%yourself%');
select t.ok(public.award_achievement('00000000-0000-0000-0000-000000000002', 'ach-knowledge-seeker', 'Квиз Zerde, 2 место'), 'superadmin awards a manual achievement');
select t.ok(not public.award_achievement('00000000-0000-0000-0000-000000000002', 'ach-knowledge-seeker', 'again'), 'awarding twice is a no-op');
reset role;
select t.ok((select count(*) from public.reward_ledger where idempotency_key like 'achievement:ach-knowledge-seeker:00000000-0000-0000-0000-000000000002%') = 1, 'manual achievement rewarded once');
select t.ok((select count(*) from public.achievements where id not like 'ach-dir-%') = 34 and (select count(*) from public.achievements where rule ->> 'metric' = 'manual') = 4,
            'seed: 34 achievements (besides those of directions added later), 4 manual');

-- Tier bonus on attendance coins: gold = +15% -> 40 * 1.15 = 46
select private.grant_reward('00000000-0000-0000-0000-000000000001', 1000, 0, 'admin_adjustment', null, 'test: reach gold', 'test:gold');
insert into public.events (title, direction, starts_at, capacity, status, created_by)
values ('Gold check', 'books', now() + interval '1 hour', 10, 'published', '00000000-0000-0000-0000-00000000000c');
select id as gold_ev from public.events where title = 'Gold check' \gset
select t.ok(private.tier_for_xp((select xp from public.user_balances where user_id = '00000000-0000-0000-0000-000000000001')) = 'gold', 'member reached gold tier');
select private.record_attendance(:'gold_ev', '00000000-0000-0000-0000-000000000001', 'manual');
select t.ok((select coin_delta from public.reward_ledger where idempotency_key = 'attendance:' || :'gold_ev' || ':00000000-0000-0000-0000-000000000001') = 46,
            'gold member gets 46 coins for attendance (+15%)');

-- Host achievements: a started event with 3+ verified attendees counts for its creator
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000003', 'm3@x.kz'), ('00000000-0000-0000-0000-000000000004', 'm4@x.kz');
-- created_by is forced to auth.uid() by a trigger, so create it as the organizer
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
insert into public.events (title, direction, starts_at, capacity, status)
values ('Hosted', 'books', now() - interval '30 minutes', 10, 'published');
select set_config('request.jwt.claims', '', false);
select t.ok((select created_by from public.events where title = 'Hosted') = '00000000-0000-0000-0000-00000000000c', 'event host = creator');
select id as host_ev from public.events where title = 'Hosted' \gset
select private.record_attendance(:'host_ev', '00000000-0000-0000-0000-000000000002', 'manual');
select private.record_attendance(:'host_ev', '00000000-0000-0000-0000-000000000003', 'manual');
select t.ok(not exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-00000000000c' and achievement_id = 'ach-first-hosted'),
            'host: 2 attendees are not enough');
select private.record_attendance(:'host_ev', '00000000-0000-0000-0000-000000000004', 'manual');
select t.ok(exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-00000000000c' and achievement_id = 'ach-first-hosted'),
            'host: 3rd verified attendee unlocks ach-first-hosted');
select t.ok(private.achievement_metric('00000000-0000-0000-0000-00000000000c', '{"metric":"well_rated_events_hosted"}') = 0, 'no rating yet without feedback');
insert into public.event_feedback (event_id, user_id, satisfaction, usefulness) values
 (:'host_ev', '00000000-0000-0000-0000-000000000002', 5, 5), (:'host_ev', '00000000-0000-0000-0000-000000000003', 5, 4),
 (:'host_ev', '00000000-0000-0000-0000-000000000004', 4, 4);
select t.ok(private.achievement_metric('00000000-0000-0000-0000-00000000000c', '{"metric":"well_rated_events_hosted"}') = 1, 'avg 4.67 from 3 reviews = well rated');

-- Revocation: admin only, reward returned, no auto re-unlock, re-award lifts it
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select t.expect_fail($$select public.revoke_achievement('00000000-0000-0000-0000-000000000001', 'ach-first-book', 'x')$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select t.expect_fail($$select public.revoke_achievement('00000000-0000-0000-0000-000000000001', 'ach-first-book', '  ')$$, '%reason_required%');
reset role;
select xp as m1_xp_before from public.user_balances where user_id = '00000000-0000-0000-0000-000000000001' \gset
set role authenticated;
select t.ok(public.revoke_achievement('00000000-0000-0000-0000-000000000001', 'ach-first-book', 'Рецензия скопирована'), 'admin revokes an achievement');
reset role;
select t.ok(not exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-000000000001' and achievement_id = 'ach-first-book'), 'achievement removed');
select t.ok((select xp from public.user_balances where user_id = '00000000-0000-0000-0000-000000000001') = :m1_xp_before - 50, 'XP returned (-50)');
select private.evaluate_achievements('00000000-0000-0000-0000-000000000001');
select t.ok(not exists (select 1 from public.user_achievements where user_id = '00000000-0000-0000-0000-000000000001' and achievement_id = 'ach-first-book'), 'not auto-unlocked again while revoked');
select t.ok(exists (select 1 from public.audit_logs where action = 'ACHIEVEMENT_REVOKE'), 'revocation audited');
-- manual achievement: revoke then deliberate re-award pays again
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select public.revoke_achievement('00000000-0000-0000-0000-000000000002', 'ach-knowledge-seeker', 'Ошибочная выдача');
select t.ok(public.award_achievement('00000000-0000-0000-0000-000000000002', 'ach-knowledge-seeker', 'Повторно, верно'), 're-award after revocation works');
reset role;
select t.ok((select count(*) from public.reward_ledger where idempotency_key like 'achievement:ach-knowledge-seeker:00000000-0000-0000-0000-000000000002%') = 2,
            're-award paid again (new key after revocation)');

-- Ledger integrity: balances always equal the sum of the ledger
select t.ok(not exists (
  select 1 from public.user_balances b
   left join (select user_id, sum(xp_delta) xp, sum(coin_delta) c from public.reward_ledger group by 1) l using (user_id)
  where b.coins <> coalesce(l.c, 0) or b.xp <> coalesce(l.xp, 0)), 'balances == SUM(ledger) for every user');

-- ===================== Phase 3: directions, memberships, preferences, reports, storage =====================
reset role;
select t.ok((select count(*) from public.user_preferences) = (select count(*) from public.profiles), 'every profile has a preferences row');
select t.ok((select count(*) from public.community_directions where id in ('books','english','arabic','sport','art','intellect','networking')) = 7, '7 club directions seeded');
set role anon;
select t.expect_fail('select * from public.community_directions', '%permission denied%');
reset role;
-- The tests use the seeded directions; a live project may have archived some (test transaction only).
update public.community_directions set is_active = true where id in ('books', 'english', 'arabic', 'sport', 'art', 'intellect', 'networking');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.ok((select count(*) from public.user_preferences) = 1, 'member sees only own preferences');
update public.user_preferences set reminder_hours_before = 2 where user_id = auth.uid();
update public.user_preferences set show_on_leaderboard = false where user_id = '00000000-0000-0000-0000-000000000002';
select t.expect_fail('update public.user_preferences set reminder_hours_before = 100 where user_id = auth.uid()', '%check%');
select t.expect_fail($$update public.profiles set directions = '{books}' where id = auth.uid()$$, '%permission denied%');
select t.expect_fail($$insert into public.memberships (user_id, direction, status) values (auth.uid(), 'books', 'active')$$, '%permission denied%');
select t.expect_fail($$update public.memberships set status = 'active'$$, '%permission denied%');
update public.community_directions set requires_approval = false where id = 'books';
select t.ok(public.request_membership('books', 'Люблю читать') = 'pending', 'member applies -> pending');
select t.ok(public.request_membership('books') = 'pending', 'repeated application is idempotent');
select t.expect_fail($$select public.request_membership('general')$$, '%direction_not_available%');
select t.expect_fail($$select public.review_membership((select id from public.memberships where user_id = auth.uid() and direction = 'books'), true)$$, '%forbidden%');
select t.expect_fail($$select public.set_direction_lead(auth.uid(), 'books', true)$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.ok((select count(*) from public.memberships) = 0, 'other members do not see pending applications');
reset role;
select t.ok((select requires_approval from public.community_directions where id = 'books'), 'member cannot change direction settings');
select t.ok((select user_id from public.user_preferences where show_on_leaderboard = false) is null, 'member cannot edit another user preferences');
select t.ok((select reminder_hours_before from public.user_preferences where user_id = '00000000-0000-0000-0000-000000000001') = 2, 'member edits own preferences');
select t.ok((select directions from public.profiles where id = '00000000-0000-0000-0000-000000000001') = '{}', 'pending application does not add direction to profile');
select id as m1_books from public.memberships where user_id = '00000000-0000-0000-0000-000000000001' and direction = 'books' \gset
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select t.ok(public.review_membership(:'m1_books', true, 'Добро пожаловать') = 'active', 'admin approves application');
select t.expect_fail($$select public.review_membership('$$ || :'m1_books' || $$', false)$$, '%membership_not_pending%');
select t.ok(public.set_direction_lead('00000000-0000-0000-0000-000000000001', 'books', true), 'moderator+ appoints a direction lead');
reset role;
select t.ok((select directions from public.profiles where id = '00000000-0000-0000-0000-000000000001') = '{books}', 'approved membership synced to profile.directions');
select t.ok(exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-000000000001' and title = 'Бағытқа өтінішіңіз мақұлданды'), 'applicant notified (in Kazakh, the default language)');
select t.ok(exists (select 1 from public.audit_logs where action = 'MEMBERSHIP_APPROVE'), 'approval audited');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select public.request_membership('books');
select public.request_membership('arabic');
select t.ok((select count(*) from public.memberships) = 3, 'member sees own applications + active members');
select t.expect_fail($$select public.set_direction_lead(auth.uid(), 'books', true)$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.ok((select count(*) from public.memberships where status = 'pending') = 1, 'lead sees pending applications of own direction only');
select t.ok(public.review_membership((select id from public.memberships where user_id = '00000000-0000-0000-0000-000000000002' and direction = 'books'), true) = 'active', 'lead approves application in own direction');
reset role;
select id as m2_arabic from public.memberships where user_id = '00000000-0000-0000-0000-000000000002' and direction = 'arabic' \gset
select id as m2_books from public.memberships where user_id = '00000000-0000-0000-0000-000000000002' and direction = 'books' \gset
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select public.review_membership('$$ || :'m2_arabic' || $$', true)$$, '%forbidden%');
select t.expect_fail($$select public.remove_member('$$ || :'m2_books' || $$', '  ')$$, '%reason_required%');
select t.ok(public.remove_member(:'m2_books', 'Нарушение правил'), 'lead removes a member with reason');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.expect_fail($$select public.request_membership('books')$$, '%membership_removed%');
select t.ok(public.leave_membership('arabic'), 'member withdraws application');
select t.ok(public.request_membership('arabic') = 'pending', 're-apply after withdrawing');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.review_membership(:'m2_arabic', false, 'Группа набрана');
update public.community_directions set requires_approval = false where id = 'art';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.expect_fail($$select public.request_membership('arabic')$$, '%reapply_too_soon%');
select t.ok(public.request_membership('art') = 'active', 'direction without approval joins instantly');
reset role;
select t.ok((select directions from public.profiles where id = '00000000-0000-0000-0000-000000000002') = '{art}', 'profile.directions = active memberships only');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select public.report_content('forum_topic', :'topic', 'spam', 'Реклама') as rep \gset
select t.ok(public.report_content('forum_topic', :'topic', 'spam') = :'rep', 'duplicate open report returns the same report');
select t.expect_fail($$select public.report_content('forum_topic', gen_random_uuid()::text, 'spam')$$, '%target_not_found%');
select t.expect_fail($$select public.report_content('event_feedback', gen_random_uuid()::text || ':' || gen_random_uuid()::text, 'spam')$$, '%target_not_found%');
select t.ok(public.report_content('profile', '00000000-0000-0000-0000-000000000001', 'harassment') is not null, 'member can report a profile');
select t.expect_fail($$select public.resolve_report('$$ || :'rep' || $$', 'dismissed')$$, '%forbidden%');
select t.expect_fail($$insert into public.moderation_reports (reporter_id, target_type, target_id, reason) values (auth.uid(), 'profile', 'x', 'spam')$$, '%permission denied%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select public.report_content('forum_topic', '$$ || :'topic' || $$', 'spam')$$, '%own content%');
select t.ok((select count(*) from public.moderation_reports) = 0, 'reported user does not see reports');
select t.ok(public.report_content('event_feedback', :'ev' || ':00000000-0000-0000-0000-000000000002', 'inappropriate') is not null, 'member can report event feedback');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select t.ok((select count(*) from public.moderation_reports) = 3, 'moderators see the whole report queue');
select t.ok(public.resolve_report(:'rep', 'resolved', 'Тема скрыта'), 'moderator resolves report');
reset role;
select t.ok((select status from public.moderation_reports where id = :'rep') = 'resolved' and exists (select 1 from public.audit_logs where action = 'REPORT_RESOLVED'), 'report resolved and audited');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000001/me.png');
select t.expect_fail($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000002/fake.png')$$, '%row-level security%');
select t.expect_fail($$insert into storage.objects (bucket_id, name) values ('book-covers', 'abai.png')$$, '%row-level security%');
select t.expect_fail($$insert into storage.objects (bucket_id, name) values ('event-photos', '$$ || :'ev' || $$/x.png')$$, '%row-level security%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
delete from storage.objects where name = '00000000-0000-0000-0000-000000000001/me.png';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
insert into storage.objects (bucket_id, name) values ('event-photos', :'ev' || '/photo1.jpg');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
insert into storage.objects (bucket_id, name) values ('book-covers', 'abai.png');
reset role;
select t.ok(exists (select 1 from storage.objects where name = '00000000-0000-0000-0000-000000000001/me.png'), 'own avatar uploaded; others cannot delete it');
select t.ok((select count(*) from storage.objects) = 3, 'organizer uploads photos of own event, moderator uploads covers');
select t.ok((select count(*) from storage.buckets where public) = 3, '3 storage buckets created');
-- Stage 7: event reminders (private.dispatch_due_reminders, run by pg_cron on Supabase)
reset role;
insert into public.events (title, direction, starts_at, capacity, status, created_by)
values ('Reminder test', 'books', now() + interval '3 hours', 10, 'published', '00000000-0000-0000-0000-00000000000c'),
       ('Reminder cancelled', 'books', now() + interval '3 hours', 10, 'cancelled', '00000000-0000-0000-0000-00000000000c'),
       ('Reminder started', 'books', now() - interval '5 minutes', 10, 'published', '00000000-0000-0000-0000-00000000000c');
insert into public.event_registrations (event_id, user_id, status)
select e.id, u.id, case when u.id = '00000000-0000-0000-0000-000000000002' and e.title = 'Reminder test' then 'cancelled'::public.registration_status else 'registered' end
  from public.events e cross join (values ('00000000-0000-0000-0000-000000000001'::uuid), ('00000000-0000-0000-0000-000000000002'::uuid), ('00000000-0000-0000-0000-00000000000b'::uuid)) u(id)
 where e.title like 'Reminder %';
update public.user_preferences set notify_event_reminders = false where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.scheduled_notifications (user_id, event_id, kind, send_at)
select r.user_id, r.event_id, 'event_2h', now() - interval '1 minute'
  from public.event_registrations r join public.events e on e.id = r.event_id where e.title like 'Reminder %'
on conflict (user_id, event_id, kind) do update set send_at = excluded.send_at, sent_at = null;
select t.ok(private.dispatch_due_reminders() = 1, 'reminders: exactly one sent (registered, wants reminders, upcoming published event)');
select t.ok((select count(*) from public.notifications n join public.events e on e.id = (n.meta->>'event_id')::uuid
              where n.type = 'event_reminder' and e.title = 'Reminder test' and n.user_id = '00000000-0000-0000-0000-000000000001') = 1,
            'reminder delivered to the registered member as an in-app notification');
select t.ok(not exists (select 1 from public.notifications where type = 'event_reminder' and user_id in
              ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b')),
            'no reminder after a cancelled registration or with reminders switched off');
select t.ok(not exists (select 1 from public.notifications n join public.events e on e.id = (n.meta->>'event_id')::uuid
              where n.type = 'event_reminder' and e.title in ('Reminder cancelled', 'Reminder started')),
            'no reminder for a cancelled or already started event');
select t.ok((select count(*) from public.scheduled_notifications s join public.events e on e.id = s.event_id
              where e.title like 'Reminder %' and s.sent_at is null) = 0, 'every due reminder is marked processed');
select t.ok(private.dispatch_due_reminders() = 0, 'second run sends nothing (no duplicates)');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail('select private.dispatch_due_reminders()', '%permission denied%');
reset role;

-- Stage 7b: Web Push rules (public.claim_push_batch, called only by the send-push Edge Function)
reset role;
update public.notifications set push_sent_at = now() where push_sent_at is null;   -- start from an empty queue
update public.profiles set push_notifications_enabled = true
 where id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
update public.profiles set push_notifications_enabled = false where id = '00000000-0000-0000-0000-000000000002';
update public.user_preferences set notify_forum_replies = false where user_id = '00000000-0000-0000-0000-00000000000a';
update public.user_preferences set quiet_hours_start = ((now() at time zone 'Asia/Almaty') - interval '1 hour')::time,
                                   quiet_hours_end   = ((now() at time zone 'Asia/Almaty') + interval '1 hour')::time
 where user_id = '00000000-0000-0000-0000-00000000000b';
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key)
select u::uuid, 'https://push.example/' || u, 'p256dh-key', 'auth-key'
  from unnest(array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
                    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b']) u;
insert into public.notifications (user_id, type, title, body, created_at) values
 ('00000000-0000-0000-0000-000000000001', 'forum_reply', 'P1 reply',      'x', now()),
 ('00000000-0000-0000-0000-000000000001', 'broadcast',   'P1 old',        'x', now() - interval '2 hours'),
 ('00000000-0000-0000-0000-000000000002', 'broadcast',   'P2 push off',   'x', now()),
 ('00000000-0000-0000-0000-00000000000a', 'forum_reply', 'PA reply off',  'x', now()),
 ('00000000-0000-0000-0000-00000000000a', 'broadcast',   'PA broadcast',  'x', now()),
 ('00000000-0000-0000-0000-00000000000b', 'broadcast',   'PB quiet',      'x', now()),
 ('00000000-0000-0000-0000-00000000000c', 'broadcast',   'PC no device',  'x', now());
create temp table t_push as select * from public.claim_push_batch(100);
select t.ok((select string_agg(title, ',' order by title) from t_push) = 'P1 reply,PA broadcast',
            'push goes only to: push on + device + allowed type + not quiet hours + fresh');
select t.ok((select count(*) from public.notifications where title like 'P% %' and push_sent_at is null) = 0,
            'every pending notification is claimed once (also the skipped ones)');
select t.ok((select count(*) from public.claim_push_batch(100)) = 0, 'second call pushes nothing');
select t.ok(not private.push_pending(), 'queue is empty afterwards');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail('select * from public.claim_push_batch(10)', '%permission denied%');
select t.ok((select count(*) from public.push_subscriptions) = 1, 'member sees only own push subscription');
select t.expect_fail($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key) values ('00000000-0000-0000-0000-000000000002', 'https://push.example/fake', 'k', 'a')$$, '%row-level security%');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key) values (auth.uid(), 'https://push.example/second-device', 'k', 'a');
select t.ok((select count(*) from public.push_subscriptions) = 2, 'member registers a second device');
select t.expect_fail($$select public.finish_push_batch(array['https://push.example/00000000-0000-0000-0000-000000000002'], null)$$, '%permission denied%');
reset role;
select t.ok(public.finish_push_batch(array['https://push.example/00000000-0000-0000-0000-000000000002'], array['https://push.example/00000000-0000-0000-0000-000000000001']) = 1,
            'finish_push_batch reports one removed subscription');
select t.ok(not exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/00000000-0000-0000-0000-000000000002'),
            'gone subscription removed');
select t.ok((select last_used_at is not null from public.push_subscriptions where endpoint = 'https://push.example/00000000-0000-0000-0000-000000000001'),
            'used subscription stamped (last_used_at)');

-- Telegram: link codes, sign-in mapping, delivery queue (service-role RPCs called by Edge Functions)
reset role;
update public.notifications set telegram_sent_at = now() where telegram_sent_at is null;   -- empty queue
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select set_config('shq.tg_code', public.create_telegram_link_code(), false);
select t.ok(length(current_setting('shq.tg_code')) = 32, 'member gets a one-time link code');
select t.expect_fail($$select public.link_telegram_by_code('x', 1, 'u', 'f', 1)$$, '%permission denied%');
select t.expect_fail($$select public.telegram_member(1)$$, '%permission denied%');
select t.expect_fail($$select * from public.claim_telegram_batch(10)$$, '%permission denied%');
select t.expect_fail($$insert into public.telegram_accounts (user_id, telegram_id) values (auth.uid(), 5)$$, '%permission denied%');
reset role;
select t.ok(public.link_telegram_by_code(current_setting('shq.tg_code'), 777001, 'm1_tg', 'M1', 777001) is not null,
            'bot links the account with a valid code');
select t.ok((select telegram_notifications_enabled from public.profiles where id = '00000000-0000-0000-0000-000000000001'),
            'linking switches Telegram notifications on');
select t.expect_fail($$select public.link_telegram_by_code('$$ || current_setting('shq.tg_code') || $$', 777001, 'm1_tg', 'M1', 777001)$$, '%link_code_used%');
select t.expect_fail($$select public.link_telegram_by_code('deadbeef', 777001, 'm1_tg', 'M1', 777001)$$, '%link_code_invalid%');
select t.ok(public.telegram_member(777001) = '00000000-0000-0000-0000-000000000001', 'Mini App sign-in finds the linked member');
select t.ok(public.telegram_member(999999) is null, 'unknown Telegram user is not mapped to anyone');
select t.expect_fail($$select public.attach_telegram('00000000-0000-0000-0000-000000000002', 777001, 'x', 'x', null)$$, '%telegram_linked_to_another_account%');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select set_config('shq.tg_code2', public.create_telegram_link_code(), false);
select t.ok((select count(*) from public.telegram_accounts) = 0, 'member does not see other members'' Telegram links');
reset role;
select t.expect_fail($$select public.link_telegram_by_code('$$ || current_setting('shq.tg_code2') || $$', 777001, 'x', 'x', 777001)$$, '%telegram_linked_to_another_account%');
select public.attach_telegram('00000000-0000-0000-0000-000000000002', 777002, 'm2_tg', 'M2', null);   -- signed in via Mini App, never wrote to the bot
update public.profiles set telegram_notifications_enabled = true where id = '00000000-0000-0000-0000-000000000002';
insert into public.notifications (user_id, type, title, body) values
 ('00000000-0000-0000-0000-000000000001', 'broadcast', 'T1 send', 'x'),
 ('00000000-0000-0000-0000-000000000002', 'broadcast', 'T2 no chat', 'x');
create temp table t_tg as select * from public.claim_telegram_batch(100);
select t.ok((select string_agg(title, ',') from t_tg) = 'T1 send' and (select chat_id from t_tg) = 777001,
            'bot messages go only to linked members whose chat with the bot is open');
select t.ok(public.telegram_chat_started(777002, 777002), 'chat recorded when the member starts the bot');
select t.ok(public.telegram_mark_blocked(array[777001::bigint]) = 1, 'blocked chat marked (403 from Telegram)');
insert into public.notifications (user_id, type, title, body) values
 ('00000000-0000-0000-0000-000000000001', 'broadcast', 'T1 blocked', 'x'),
 ('00000000-0000-0000-0000-000000000002', 'broadcast', 'T2 now open', 'x');
select t.ok((select string_agg(title, ',') from public.claim_telegram_batch(100)) = 'T2 now open',
            'no messages to a member who blocked the bot; open chat receives them');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.ok((select username from public.telegram_accounts) = 'm2_tg', 'member sees own Telegram link');
select t.ok(public.unlink_telegram(), 'member unlinks Telegram');
select t.ok((select count(*) from public.telegram_accounts) = 0 and not (select telegram_notifications_enabled from public.profiles where id = auth.uid()),
            'after unlinking: no link, Telegram notifications off');
reset role;
update public.profiles set telegram_notifications_enabled = false where id = '00000000-0000-0000-0000-00000000000a';
select public.attach_telegram('00000000-0000-0000-0000-00000000000a', 777003, 'sa_tg', 'SA', 777003);
select t.ok((select telegram_notifications_enabled from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
            'first Telegram sign-in with an open chat switches Telegram notifications on');
select public.set_app_setting('telegram_bot_username', 'shq_test_bot');
set role anon;
select t.ok((select value from public.app_settings where key = 'telegram_bot_username') = 'shq_test_bot',
            'bot @username is readable before sign-in');
select t.expect_fail($$select public.set_app_setting('x', 'y')$$, '%permission denied%');
reset role;
-- A member who signed up through Telegram (internal e-mail) cannot unlink: it is their only way in.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'tg-777004@telegram.invalid');
select public.attach_telegram('00000000-0000-0000-0000-0000000000c1', 777004, 'tg_only', 'TG', 777004);
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', false);
select t.expect_fail($$select public.unlink_telegram()$$, '%telegram_only_sign_in%');
reset role;
select t.ok(exists (select 1 from public.telegram_accounts where user_id = '00000000-0000-0000-0000-0000000000c1'),
            'Telegram-only member keeps the link');

-- Notifications in the member's language (texts are written in Russian, stored translated).
select t.ok((select column_default from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
             and column_name = 'preferred_language') like '''kz''%', 'new members start in Kazakh');
update public.profiles set preferred_language = 'ru' where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set preferred_language = 'en' where id = '00000000-0000-0000-0000-00000000000b';
select private.notify(u, 'registration', 'Успешная регистрация на мероприятие', 'Вы записаны на «Абай — 2».', 'events', '{}', 'lang-test:' || u)
  from unnest(array['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b']::uuid[]) u;
select t.ok((select title || ' | ' || body from public.notifications where dedupe_key = 'lang-test:00000000-0000-0000-0000-000000000001')
            = 'Іс-шараға сәтті жазылдыңыз | «Абай — 2» кездесуіне жазылдыңыз.', 'Kazakh member: title and body in Kazakh, event title kept');
select t.ok((select title || ' | ' || body from public.notifications where dedupe_key = 'lang-test:00000000-0000-0000-0000-000000000002')
            = 'Успешная регистрация на мероприятие | Вы записаны на «Абай — 2».', 'Russian member: Russian text');
select t.ok((select title || ' | ' || body from public.notifications where dedupe_key = 'lang-test:00000000-0000-0000-0000-00000000000b')
            = 'You are signed up | You are signed up for “Абай — 2”.', 'English member: English text');
select private.notify('00000000-0000-0000-0000-000000000001', 'forum_reply', 'Новый ответ в вашей теме', 'Свободный текст ответа', 'forum', '{}', 'lang-free');
select t.ok((select body from public.notifications where dedupe_key = 'lang-free') = 'Свободный текст ответа', 'free text is not altered');
select private.notify('00000000-0000-0000-0000-000000000001', 'level_up', 'Повышение клубного ранга!', 'Поздравляем! Ваш статус повышен: gold', 'profile', '{"tier":"gold"}', 'lang-tier');
select t.ok((select body from public.notifications where dedupe_key = 'lang-tier') = 'Құттықтаймыз! Жаңа деңгейіңіз: ' || (select name_kz from public.tiers where tier = 'gold'), 'tier name from the catalog');

-- Book covers: a member sets the cover of a book on their shelf once; only moderators replace it.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select public.save_user_book('Cover test book', 'Cover Author', '', 'reading') as cover_ub \gset
select t.expect_fail($$select public.set_book_cover('$$ || :'cover_ub' || $$', 'https://evil.example/x.jpg')$$, '%invalid_cover_url%');
select t.expect_fail($$select public.set_book_cover('$$ || :'cover_ub' || $$', 'https://abc.supabase.co/storage/v1/object/public/book-covers/00000000-0000-0000-0000-000000000002/a.jpg')$$, '%invalid_cover_url%');
select t.ok(public.set_book_cover(:'cover_ub', 'https://abc.supabase.co/storage/v1/object/public/book-covers/00000000-0000-0000-0000-000000000001/c1.jpg'), 'member sets the cover of a book without one');
select t.ok(not public.set_book_cover(:'cover_ub', 'https://abc.supabase.co/storage/v1/object/public/book-covers/00000000-0000-0000-0000-000000000001/c2.jpg'), 'member cannot replace an existing cover');
select t.ok((select cover_url from public.books where title = 'Cover test book') like '%/c1.jpg', 'first cover kept');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.expect_fail($$select public.set_book_cover('$$ || :'cover_ub' || $$', 'https://abc.supabase.co/storage/v1/object/public/book-covers/00000000-0000-0000-0000-000000000002/c3.jpg')$$, '%not_found%');
reset role;

-- Directions the admins manage: add (with its own achievement), edit, archive, restore.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select public.admin_save_direction('{"id":"pottery","name_ru":"Гончарка","name_kz":"Қыш","name_en":"Pottery"}')$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select t.expect_fail($$select public.admin_save_direction('{"id":"Bad Id!","name_ru":"x","name_kz":"x","name_en":"x"}')$$, '%direction_invalid_id%');
select t.expect_fail($$select public.admin_save_direction('{"id":"general","name_ru":"x","name_kz":"x","name_en":"x"}')$$, '%direction_invalid_id%');
select t.expect_fail($$select public.admin_save_direction('{"id":"pottery","name_ru":"Гончарка","name_kz":"","name_en":"Pottery"}')$$, '%direction_names_required%');
select t.ok(public.admin_save_direction('{"id":"pottery","name_ru":"Гончарная мастерская","name_kz":"Қыш шеберханасы","name_en":"Pottery studio","short_name_ru":"Гончарка","short_name_kz":"Қыш","short_name_en":"Pottery","icon":"Palette","color":"#b5582f","requires_approval":false}') = 'pottery', 'admin adds a direction');
select t.ok((select rule ->> 'direction' from public.achievements where id = 'ach-dir-pottery') = 'pottery'
            and (select xp_reward from public.achievements where id = 'ach-dir-pottery') = 150, 'new direction gets its "5 visits" achievement');
select public.admin_save_direction('{"id":"pottery","name_ru":"Гончарная студия","name_kz":"Қыш студиясы","name_en":"Pottery studio","short_name_kz":"Қыш"}');
select t.ok((select name_ru from public.community_directions where id = 'pottery') = 'Гончарная студия'
            and (select description_kz from public.achievements where id = 'ach-dir-pottery') like '%Қыш студиясы%', 'edit updates the direction and its achievement texts');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.ok(public.request_membership('pottery') = 'active', 'members can join the new direction (no approval needed)');
select t.ok((select 'pottery' = any (directions) from public.profiles where id = auth.uid()), 'profile lists the new direction');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select t.ok(public.admin_set_direction_active('pottery', false), 'admin archives the direction');
select t.ok(not (select is_active from public.achievements where id = 'ach-dir-pottery'), 'its achievement is hidden with it');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002"}', false);
select t.expect_fail($$select public.request_membership('pottery')$$, '%direction_not_available%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select t.ok((select status::text from public.memberships where direction = 'pottery' and user_id = '00000000-0000-0000-0000-000000000001') = 'active', 'archiving keeps history (memberships)');
select t.ok(public.admin_set_direction_active('pottery', true), 'admin restores the direction');
select t.ok((select is_active from public.community_directions where id = 'pottery') and (select is_active from public.achievements where id = 'ach-dir-pottery'), 'restore brings both back');
reset role;
select t.expect_fail($$insert into public.events (title, direction, starts_at, capacity, status) values ('Unknown direction', 'nope', now() + interval '1 day', 5, 'published')$$, '%events_direction_fkey%');

-- Event pictures: default banner per direction; admins may replace it; members may not.
select t.ok((select cover_url from public.community_directions where id = 'books') = '/events/books.svg', 'directions have a default banner');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001"}', false);
select t.expect_fail($$select public.admin_set_direction_cover('books', '/events/sport.svg')$$, '%forbidden%');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select t.expect_fail($$select public.admin_set_direction_cover('books', 'https://evil.example/x.jpg')$$, '%invalid_cover_url%');
select t.ok(public.admin_set_direction_cover('books', 'https://abc.supabase.co/storage/v1/object/public/event-photos/directions/books-1.jpg'), 'admin sets a photo for a direction');
select t.ok(public.admin_set_direction_cover('books', null), 'admin goes back to the default');
reset role;

\echo ALL_TESTS_PASSED
