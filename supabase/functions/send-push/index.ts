// Supabase Edge Function "send-push" (stage 7b): delivers Web Push for pending in-app notifications.
//
// Called every minute by pg_cron (private.trigger_push_dispatch, via pg_net) with a shared secret.
// WHO gets WHAT is decided in SQL by public.claim_push_batch() (push switched on, subscription,
// notification preferences, quiet hours, fresh only, each notification once). This function only
// encrypts + sends with the VAPID key and removes subscriptions the push service reports as gone.
//
// Secrets (Edge Function secrets, never in the repository):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SHQ_PUSH_CRON_SECRET
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Claimed {
  notification_id: string;
  user_id: string;
  title: string;
  body: string;
  link_tab: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-shq-secret') !== env('SHQ_PUSH_CRON_SECRET')) return new Response('forbidden', { status: 403 });

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const { data, error } = await db.rpc('claim_push_batch', { p_limit: 200 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Claimed[];

  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();
  const used = new Set<string>();
  await Promise.all(rows.map(async r => {
    const payload = JSON.stringify({ title: r.title, body: r.body, tab: r.link_tab ?? undefined, id: r.notification_id });
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth_key } }, payload,
        { TTL: 6 * 3600, urgency: 'normal' });
      sent++;
      used.add(r.endpoint);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.add(r.endpoint); // unsubscribed / expired
      else failed++;
    }
  }));

  // The service role has no table access here: one narrow RPC removes dead subscriptions and stamps used ones.
  let removed = 0;
  if (gone.size || used.size) {
    const fin = await db.rpc('finish_push_batch', { p_gone: [...gone], p_used: [...used] });
    if (fin.error) return Response.json({ error: fin.error.message, claimed: rows.length, sent, failed }, { status: 500 });
    removed = fin.data as number;
  }
  return Response.json({ claimed: rows.length, sent, failed, removed });
});
