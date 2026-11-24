/**
 * Supabase browser client. Live mode only: App.tsx loads this module with a dynamic
 * import behind the VITE_DATA_SOURCE check, so demo builds never contain supabase-js.
 *
 * Only PUBLIC values are used here (VITE_SUPABASE_URL + the anon/publishable key).
 * Security comes from RLS and the server-side RPCs, never from hiding these values.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TG_KEY, tgPost } from '../../utils/telegramBridge';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** False when the env still has the .env.example placeholders (or nothing at all). */
export const supabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && anonKey.length > 20 && !anonKey.startsWith('YOUR_');

/**
 * True when the page was opened from a password-recovery e-mail link. Read here, before
 * createClient consumes and clears the URL: the PASSWORD_RECOVERY event fires during client
 * start-up and can come before the sign-in screen subscribes to auth events.
 */
export const openedFromRecoveryLink = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';

/**
 * Telegram Mini App: Telegram opens the site with `#tgWebAppData=<signed initData>&tgWebAppVersion=…`.
 * Read it here, before createClient looks at the URL hash, and keep it for reloads inside the Mini App.
 * The signature is checked on the server (Edge Function telegram-auth); here it is only passed on.
 */

export const telegramInitData: string | null = (() => {
  try {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
    if (fromHash) {
      sessionStorage.setItem(TG_KEY, fromHash);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return fromHash;
    }
    return sessionStorage.getItem(TG_KEY);
  } catch {
    return null;
  }
})();
export const isTelegramMiniApp = telegramInitData !== null;

/** Tells Telegram the page is ready and asks for full height (no-op outside Telegram). */
export const telegramReady = () => {
  if (!isTelegramMiniApp) return;
  tgPost('web_app_ready');
  tgPost('web_app_expand');
  // Scrolling a list (e.g. the menu) must not swipe the Mini App closed.
  tgPost('web_app_setup_swipe_behavior', { allow_vertical_swipe: false });
};

export const supabaseUrl = url.replace(/\/$/, '');

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Picks up the session from e-mail links (confirmation, password recovery).
        detectSessionInUrl: true,
        // Implicit flow: a confirmation link works even when opened on another device/browser.
        flowType: 'implicit',
        storageKey: 'shanyraq_hub_auth',
      },
    })
  : null;
