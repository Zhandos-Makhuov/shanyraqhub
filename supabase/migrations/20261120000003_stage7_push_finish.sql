-- Shanyraq Hub — Stage 7c: let the send-push Edge Function finish a batch (additive only).
--
-- The service role has no table privileges in this project (auto-grant to new tables is off), so the
-- Edge Function gets exactly one narrow entry point instead of table access: remove subscriptions the
-- push service reported as gone (404/410) and stamp last_used_at on the ones that received a message.

create function public.finish_push_batch(p_gone text[], p_used text[])
returns int language plpgsql security definer set search_path = '' as $$
declare v_removed int;
begin
  delete from public.push_subscriptions where endpoint = any (coalesce(p_gone, '{}'));
  get diagnostics v_removed = row_count;
  update public.push_subscriptions set last_used_at = now() where endpoint = any (coalesce(p_used, '{}'));
  return v_removed;
end $$;

revoke all on function public.finish_push_batch(text[], text[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.finish_push_batch(text[], text[]) to service_role;
  end if;
end $$;
