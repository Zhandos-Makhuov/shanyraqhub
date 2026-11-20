-- Shanyraq Hub — book covers (owner decision 2026-11-20: any member may add a cover when adding a book).
-- One cover per book, seen by every reader of it. A member uploads into their own folder of the
-- "book-covers" bucket and may set the cover of a book they have on their shelf only while it has none;
-- moderators may replace any cover. Additive only.

-- Storage: members write in their own folder (<user id>/…); moderators keep full access (earlier policies).
create policy book_covers_member_write on storage.objects for insert to authenticated
  with check (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy book_covers_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'book-covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- p_user_book: the member's shelf entry (what save_user_book returns); p_url: public URL of the uploaded file.
create function public.set_book_cover(p_user_book uuid, p_url text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_role('member');
  v_book uuid;
  v_cover text;
  v_mod boolean := private.has_role('moderator');
begin
  select ub.book_id into v_book from public.user_books ub where ub.id = p_user_book and (ub.user_id = uid or v_mod);
  if v_book is null then raise exception 'not_found'; end if;
  -- Only a file from this project's book-covers bucket, uploaded into the caller's folder (moderators: any folder).
  if p_url is null or p_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/book-covers/'
                                || case when v_mod then '[0-9a-f-]{36}' else uid::text end || '/[A-Za-z0-9._-]+$') then
    raise exception 'invalid_cover_url';
  end if;
  select cover_url into v_cover from public.books where id = v_book;
  if v_cover is not null and not v_mod then
    return false; -- the book already has a cover: only a moderator replaces it
  end if;
  update public.books set cover_url = p_url where id = v_book;
  return true;
end $$;

revoke all on function public.set_book_cover(uuid, text) from public, anon;
grant execute on function public.set_book_cover(uuid, text) to authenticated;
