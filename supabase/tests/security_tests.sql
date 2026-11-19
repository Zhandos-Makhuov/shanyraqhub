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
select t.ok((select count(*) from public.reward_ledger where idempotency_key like 'achievement:ach-knowledge-seeker:%') = 1, 'manual achievement rewarded once');
select t.ok((select count(*) from public.achievements) = 25 and (select count(*) from public.achievements where rule ->> 'metric' = 'manual') = 4,
            'seed: 25 achievements, 4 manual');

-- Tier bonus on attendance coins: gold = +15% -> 40 * 1.15 = 46
select private.grant_reward('00000000-0000-0000-0000-000000000001', 600, 0, 'admin_adjustment', null, 'test: reach gold', 'test:gold');
insert into public.events (title, direction, starts_at, capacity, status, created_by)
values ('Gold check', 'books', now() + interval '1 hour', 10, 'published', '00000000-0000-0000-0000-00000000000c');
select id as gold_ev from public.events where title = 'Gold check' \gset
select t.ok(private.tier_for_xp((select xp from public.user_balances where user_id = '00000000-0000-0000-0000-000000000001')) = 'gold', 'member reached gold tier');
select private.record_attendance(:'gold_ev', '00000000-0000-0000-0000-000000000001', 'manual');
select t.ok((select coin_delta from public.reward_ledger where idempotency_key = 'attendance:' || :'gold_ev' || ':00000000-0000-0000-0000-000000000001') = 46,
            'gold member gets 46 coins for attendance (+15%)');

-- Ledger integrity: balances always equal the sum of the ledger
select t.ok(not exists (
  select 1 from public.user_balances b
   left join (select user_id, sum(xp_delta) xp, sum(coin_delta) c from public.reward_ledger group by 1) l using (user_id)
  where b.coins <> coalesce(l.c, 0) or b.xp <> coalesce(l.xp, 0)), 'balances == SUM(ledger) for every user');
\echo ALL_TESTS_PASSED
