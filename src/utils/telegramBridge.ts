/**
 * Minimal Telegram Mini App bridge (no SDK): send events to Telegram and receive them back.
 * Phase 6 (N-4): the Telegram "Back" button. Outside Telegram every call is a no-op.
 *
 * Telegram passes the signed launch data in the URL hash; `src/data/supabase/client.ts` keeps it in
 * sessionStorage under TG_KEY, so this file only checks that key (and the hash, for the very first moment).
 */
export const TG_KEY = 'shq_tg_init_data';

export const inTelegram = (): boolean => {
  try {
    return !!sessionStorage.getItem(TG_KEY) || window.location.hash.includes('tgWebAppData=');
  } catch {
    return false;
  }
};

type Proxy = { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };

/** Sends an event to Telegram (mobile apps: TelegramWebviewProxy; Telegram Web: postMessage to the parent). */
export const tgPost = (eventType: string, eventData: Record<string, unknown> = {}) => {
  const w = window as unknown as Proxy;
  try {
    if (w.TelegramWebviewProxy) w.TelegramWebviewProxy.postEvent(eventType, JSON.stringify(eventData));
    else if (window.parent !== window) window.parent.postMessage(JSON.stringify({ eventType, eventData }), '*');
  } catch { /* not inside Telegram after all */ }
};

const handlers = new Set<(eventType: string) => void>();
let installed = false;

/** Telegram apps call window.Telegram.WebView.receiveEvent (older: TelegramGameProxy); Telegram Web uses postMessage. */
const install = () => {
  if (installed) return;
  installed = true;
  const emit = (eventType: string) => handlers.forEach(h => h(eventType));
  const w = window as unknown as Record<string, any>;
  w.Telegram = w.Telegram || {};
  const prevWebView = w.Telegram.WebView?.receiveEvent;
  w.Telegram.WebView = { ...(w.Telegram.WebView || {}), receiveEvent: (t: string, d: unknown) => { emit(t); prevWebView?.(t, d); } };
  const prevGame = w.TelegramGameProxy?.receiveEvent;
  w.TelegramGameProxy = { ...(w.TelegramGameProxy || {}), receiveEvent: (t: string, d: unknown) => { emit(t); prevGame?.(t, d); } };
  w.TelegramGameProxy_receiveEvent = w.TelegramGameProxy.receiveEvent;
  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    try {
      const m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (m && typeof m.eventType === 'string') emit(m.eventType);
    } catch { /* not a Telegram message */ }
  });
};

export const onTelegramEvent = (cb: (eventType: string) => void): (() => void) => {
  install();
  handlers.add(cb);
  return () => handlers.delete(cb);
};

let backVisible: boolean | null = null;
/** Shows or hides Telegram's own Back button (top left in the Mini App; Android's system Back follows it). */
export const setTelegramBackButton = (visible: boolean) => {
  if (!inTelegram() || backVisible === visible) return;
  backVisible = visible;
  tgPost('web_app_setup_back_button', { is_visible: visible });
};
