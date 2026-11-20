-- Shanyraq Hub — pictures for events (owner decision 2026-11-20): every direction has a default picture
-- (drawn club banners, /events/<id>.svg), and an event may have its own photo (events.cover_url, which the
-- event's organizer or a moderator sets; storage "event-photos/<event id>/…" already allows exactly them).
-- Admins can replace a direction's default picture with a photo ("event-photos/directions/…").

alter table public.community_directions
  add column cover_url text check (cover_url is null or cover_url ~ '^(https://|/)');

update public.community_directions set cover_url = '/events/' || id || '.svg'
 where id in ('books', 'english', 'arabic', 'sport', 'art', 'intellect', 'networking') and cover_url is null;

create policy event_photos_admin_directions on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = 'directions' and private.has_role('admin'));
create policy event_photos_admin_directions_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = 'directions' and private.has_role('admin'));

-- p_url null = back to the club's default banner.
create function public.admin_set_direction_cover(p_id text, p_url text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_role('admin');
begin
  if p_url is not null and p_url !~ '^(/events/[a-z0-9_]+\.svg|https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/event-photos/directions/[A-Za-z0-9._-]+)$' then
    raise exception 'invalid_cover_url' using errcode = 'P0001';
  end if;
  update public.community_directions set cover_url = p_url where id = p_id;
  if not found then raise exception 'direction_not_found' using errcode = 'P0002'; end if;
  perform private.audit('DIRECTION_COVER', 'direction', p_id, jsonb_build_object('cover_url', p_url));
  return true;
end $$;

revoke all on function public.admin_set_direction_cover(text, text) from public, anon;
grant execute on function public.admin_set_direction_cover(text, text) to authenticated;
