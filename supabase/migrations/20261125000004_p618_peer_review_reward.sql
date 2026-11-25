-- P6-18 (owner decision 25.11.2026, option "a"): the member being reviewed gets +40 XP / +25 coins
-- only for a 4–5★ review. Before, any review paid (with the 3–5★ form it was unnoticeable; the form now offers 1–5★).
-- Unchanged: the reviewer's own reward (+20 XP / +10 coins, at most 3 a day), the idempotency keys, the notification,
-- achievement evaluation. Past rewards are not touched.
-- Rollback: re-create private.on_peer_review_insert from 20261118000002_functions.sql.
create or replace function private.on_peer_review_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author_name text;
begin
  -- Keyed on (author, target, aspect): delete + re-post never pays twice.
  if new.rating >= 4 then
    perform private.grant_reward(new.target_id, 40, 25, 'peer_review_received', new.id::text,
      'Отзыв от участника', 'review_recv:' || new.author_id || ':' || new.target_id || ':' || new.aspect);
  end if;
  if (select count(*) from public.reward_ledger
       where user_id = new.author_id and source = 'peer_review_given' and created_at > now() - interval '24 hours') < 3 then
    perform private.grant_reward(new.author_id, 20, 10, 'peer_review_given', new.id::text,
      'Оставлен отзыв об участнике', 'review_given:' || new.author_id || ':' || new.target_id || ':' || new.aspect);
  end if;
  select display_name into v_author_name from public.profiles where id = new.author_id;
  perform private.notify(new.target_id, 'review', 'Новый отзыв в вашем профиле',
    format('%s оставил(а) отзыв: «%s»', v_author_name, left(new.comment, 60)), 'profile',
    jsonb_build_object('review_id', new.id), 'review:' || new.id);
  perform private.evaluate_achievements(new.target_id);
  perform private.evaluate_achievements(new.author_id);
  return new;
end $$;
