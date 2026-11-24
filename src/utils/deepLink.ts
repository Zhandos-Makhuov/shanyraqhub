/**
 * Phase 6 (C-16) — direct links into the app:
 *   /?event=<id>   — an event's window          (shareable: the organizer can copy it)
 *   /?topic=<id>   — a forum topic
 *   /?n=<id>       — one of MY notifications: opens what it is about and marks it read
 *                    (used by Web Push and by the Telegram bot's button; a notification id resolves only
 *                     for its owner — RLS — so the link reveals nothing to anyone else)
 *
 * The link is read once at start-up, kept in sessionStorage (so it survives the sign-in screen and a
 * reload inside Telegram) and removed from the address bar. It only chooses what to OPEN: what is shown
 * is still loaded through the normal, RLS-protected data — an event the member cannot see is "not available".
 * Telegram adds its launch data in the URL hash (#tgWebAppData=…), so the link lives in the query string.
 */
export type DeepLink = { kind: 'event' | 'topic' | 'notification'; id: string };

const KEY = 'shq_pending_link';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PARAMS: [string, DeepLink['kind']][] = [['n', 'notification'], ['event', 'event'], ['topic', 'topic']];

/** The link in a URL (query string), if any and well-formed. */
export const linkFromUrl = (href: string): DeepLink | null => {
  try {
    const params = new URL(href, window.location.origin).searchParams;
    for (const [param, kind] of PARAMS) {
      const id = params.get(param);
      if (id && ID.test(id)) return { kind, id };
    }
  } catch { /* not a URL */ }
  return null;
};

/** At start-up: remember the link and clean the address bar (the rest of the URL, incl. the hash, stays). */
export const captureDeepLink = () => {
  try {
    const url = new URL(window.location.href);
    const link = linkFromUrl(url.href);
    if (!PARAMS.some(([p]) => url.searchParams.has(p))) return;
    PARAMS.forEach(([p]) => url.searchParams.delete(p));
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (link) sessionStorage.setItem(KEY, JSON.stringify(link));
  } catch { /* storage unavailable: the link is simply not used */ }
};

/** The remembered link, once. */
export const takeDeepLink = (): DeepLink | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const link = raw ? (JSON.parse(raw) as DeepLink) : null;
    return link && ID.test(link.id) && PARAMS.some(([, k]) => k === link.kind) ? link : null;
  } catch {
    return null;
  }
};

/** Address of an event's window, for sharing. */
export const eventLink = (eventId: string) => `${window.location.origin}/?event=${encodeURIComponent(eventId)}`;
