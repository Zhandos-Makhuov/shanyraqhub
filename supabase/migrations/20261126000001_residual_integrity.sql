-- Residual findings (26.11.2026) — integrity of forum moderation and of the book catalog.
--   N-11: a moderator's forum actions (pin/unpin, close/open, hide/show, delete) on someone else's post are written to
--         audit_logs; the author is told when their post is hidden or deleted (localized like every notification).
--   N-12: "edited" mark of a reply = a real change of its text (new column forum_replies.edited_at), not any update
--         (hide/show by a moderator used to move updated_at and mark the reply as edited).
--   F-28: forum_topics joins the Realtime publication — new topics, pins and closes reach open pages live
--         (RLS filters inserts/updates; a delete carries only the topic id).
--   B-9 (integrity part): a book that is on members' shelves cannot be deleted — the cascade would erase their reading
--         history. Editing the catalog stays as before (moderator+); a moderator UI for it is deferred.
-- Additive: 1 column, functions, triggers, rows in private.notification_i18n; no data removed. Rollback at the end.

-- ---------------------------------------------------------------------
-- N-12: edited_at
-- ---------------------------------------------------------------------
alter table public.forum_replies add column if not exists edited_at timestamptz;
-- Best effort for existing rows: before this column an "edit" could only be told from updated_at.
update public.forum_replies set edited_at = updated_at
 where edited_at is null and updated_at > created_at + interval '1 second';

create or replace function private.mark_reply_edited()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at; -- never set by hand
  end if;
  return new;
end $$;
revoke all on function private.mark_reply_edited() from public;
drop trigger if exists forum_replies_edited on public.forum_replies;
create trigger forum_replies_edited before update on public.forum_replies
  for each row execute function private.mark_reply_edited();

-- ---------------------------------------------------------------------
-- N-11: moderator actions -> audit + author notification
-- ---------------------------------------------------------------------
insert into private.notification_i18n (pattern, kz, en) values
  ('Модерация форума', 'Форум модерациясы', 'Forum moderation'),
  ('Модератор скрыл вашу тему «(.*)»\.', 'Модератор «\1» тақырыбыңызды жасырды.', 'A moderator hid your topic “\1”.'),
  ('Модератор удалил вашу тему «(.*)»\.', 'Модератор «\1» тақырыбыңызды жойды.', 'A moderator deleted your topic “\1”.'),
  ('Модератор скрыл ваш ответ в теме «(.*)»\.', 'Модератор «\1» тақырыбындағы жауабыңызды жасырды.', 'A moderator hid your reply in “\1”.'),
  ('Модератор удалил ваш ответ в теме «(.*)»\.', 'Модератор «\1» тақырыбындағы жауабыңызды жойды.', 'A moderator deleted your reply in “\1”.')
on conflict (pattern) do nothing;

create or replace function private.on_forum_moderation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_author uuid := coalesce(old.author_id, new.author_id);
  v_kind text := case tg_table_name when 'forum_topics' then 'forum_topic' else 'forum_reply' end;
  v_topic_id uuid;
  v_title text;
begin
  -- Only a moderator acting on someone else's post (own posts and system work are not moderation).
  if uid is null or uid = v_author or not private.has_role('moderator') then
    return coalesce(new, old);
  end if;
  -- The same function serves both tables: read the columns through jsonb (topics have no topic_id).
  if tg_table_name = 'forum_topics' then
    v_topic_id := old.id;
    v_title := to_jsonb(old) ->> 'title';
  else
    v_topic_id := (to_jsonb(old) ->> 'topic_id')::uuid;
    select title into v_title from public.forum_topics where id = v_topic_id;
    -- A reply removed together with its topic (cascade): the topic's own notice is enough.
    if tg_op = 'DELETE' and v_title is null then
      return old;
    end if;
  end if;

  if tg_op = 'DELETE' then
    perform private.audit('FORUM_DELETE', v_kind, old.id::text,
      jsonb_build_object('author', v_author, 'topic_id', v_topic_id, 'title', v_title));
    perform private.notify(v_author, 'system', 'Модерация форума',
      case v_kind when 'forum_topic' then format('Модератор удалил вашу тему «%s».', v_title)
                  else format('Модератор удалил ваш ответ в теме «%s».', v_title) end,
      'forum',
      case v_kind when 'forum_topic' then '{}'::jsonb else jsonb_build_object('topic_id', v_topic_id) end,
      'mod-delete:' || old.id);
    return old;
  end if;

  if new.is_hidden is distinct from old.is_hidden then
    perform private.audit(case when new.is_hidden then 'FORUM_HIDE' else 'FORUM_SHOW' end, v_kind, new.id::text,
      jsonb_build_object('author', v_author, 'topic_id', v_topic_id));
    if new.is_hidden then
      perform private.notify(v_author, 'system', 'Модерация форума',
        case v_kind when 'forum_topic' then format('Модератор скрыл вашу тему «%s».', v_title)
                    else format('Модератор скрыл ваш ответ в теме «%s».', v_title) end,
        'forum', jsonb_build_object('topic_id', v_topic_id),
        'mod-hide:' || new.id || ':' || extract(epoch from now())::bigint);
    end if;
  end if;
  if tg_table_name = 'forum_topics' then
    if new.is_pinned is distinct from old.is_pinned then
      perform private.audit(case when new.is_pinned then 'FORUM_PIN' else 'FORUM_UNPIN' end, v_kind, new.id::text,
        jsonb_build_object('author', v_author));
    end if;
    if new.is_closed is distinct from old.is_closed then
      perform private.audit(case when new.is_closed then 'FORUM_CLOSE' else 'FORUM_OPEN' end, v_kind, new.id::text,
        jsonb_build_object('author', v_author));
    end if;
  end if;
  return new;
end $$;
revoke all on function private.on_forum_moderation() from public;

drop trigger if exists forum_topics_moderation_log on public.forum_topics;
create trigger forum_topics_moderation_log after update or delete on public.forum_topics
  for each row execute function private.on_forum_moderation();
drop trigger if exists forum_replies_moderation_log on public.forum_replies;
create trigger forum_replies_moderation_log after update or delete on public.forum_replies
  for each row execute function private.on_forum_moderation();

-- ---------------------------------------------------------------------
-- F-28: new topics live
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'forum_topics') then
    alter publication supabase_realtime add table public.forum_topics;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- B-9: a book on members' shelves is not deleted (its cascade would erase their reading history)
-- ---------------------------------------------------------------------
create or replace function private.guard_book_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_books where book_id = old.id) then
    raise exception 'book_in_use' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function private.guard_book_delete() from public;
drop trigger if exists books_delete_guard on public.books;
create trigger books_delete_guard before delete on public.books
  for each row execute function private.guard_book_delete();

-- Rollback:
--   drop trigger if exists books_delete_guard on public.books; drop function if exists private.guard_book_delete();
--   alter publication supabase_realtime drop table public.forum_topics;
--   drop trigger if exists forum_topics_moderation_log on public.forum_topics;
--   drop trigger if exists forum_replies_moderation_log on public.forum_replies; drop function if exists private.on_forum_moderation();
--   delete from private.notification_i18n where pattern like 'Модер%';
--   drop trigger if exists forum_replies_edited on public.forum_replies; drop function if exists private.mark_reply_edited();
--   alter table public.forum_replies drop column if exists edited_at;
