-- Owner decisions 25.11.2026:
--   S-3a — option (a): a finished book cannot go back to "reading". Otherwise the one-credited-book-per-week
--          check stops seeing it and a second book in the same week is rewarded (+50 XP / +30 coins).
--   S-1/S-2 — option (a): once other members have replied, the topic's author can neither delete the topic
--          (that would delete their replies too) nor change its title/text (it would change what they answered).
--          A moderator still can. Until now this was enforced only in the interface.
-- Rewards, book credit rules and RLS policies are unchanged; these are guards that raise errors.
-- Rollback:
--   drop trigger if exists user_books_no_reopen on public.user_books; drop function if exists private.guard_book_reopen();
--   drop trigger if exists forum_topics_author_guard on public.forum_topics; drop function if exists private.guard_topic_author();

-- ---------------------------------------------------------------------
-- S-3a: completed -> reading is refused (for everyone: it is a reading log, not a moderation tool)
-- ---------------------------------------------------------------------
create or replace function private.guard_book_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'completed' and new.status = 'reading' then
    raise exception 'book_already_completed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_book_reopen() from public;

drop trigger if exists user_books_no_reopen on public.user_books;
create trigger user_books_no_reopen
  before update of status on public.user_books
  for each row execute function private.guard_book_reopen();

-- ---------------------------------------------------------------------
-- S-1 / S-2: the author's own topic, after other people's replies
-- ---------------------------------------------------------------------
create or replace function private.guard_topic_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  -- Only the author acting on their own topic is limited; moderators, and system work
  -- (no signed-in user, e.g. an account deletion cascade) are not.
  if uid is null or uid is distinct from old.author_id or private.has_role('moderator') then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.forum_replies r where r.topic_id = old.id and r.author_id <> old.author_id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'topic_has_replies' using errcode = '42501';
  end if;
  if new.title is distinct from old.title or new.content is distinct from old.content then
    raise exception 'topic_has_replies' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_topic_author() from public;

drop trigger if exists forum_topics_author_guard on public.forum_topics;
create trigger forum_topics_author_guard
  before update or delete on public.forum_topics
  for each row execute function private.guard_topic_author();
