import { useEffect, useRef } from 'react';
import { onTelegramEvent, setTelegramBackButton } from './telegramBridge';

/**
 * Phase 6 (N-4) — predictable "Back" for the whole app (browser, Android system Back, Telegram Mini App).
 *
 * The site has no router: sections are `activeTab` in the app context, windows are component state.
 * Here both are written into the browser history, one entry each:
 *   - switching section  -> a new entry { tab };
 *   - opening a window    -> a new entry on top (a "layer"); Back closes the top window first.
 * Closing a window with its own button removes its entry again (history.back), so Back never "does nothing".
 * At the first entry Back leaves the site as usual (no trapping). Telegram's Back button is shown only
 * while there is something to go back to.
 *
 * Every entry carries { shq: 1, depth, tab }; after a reload the section is restored from it.
 */

interface NavState {
  shq: 1;
  depth: number;
  tab: string;
}

interface Layer {
  depth: number;
  pushed: boolean;
  cancelled: boolean;
  /** Closed by Back (popstate) or by a section change: its history entry is already gone. */
  popped: boolean;
  close: () => void;
  isOpen: () => boolean;
}

let depth = 0;
let tab = 'dashboard';
let setTabRaw: ((t: string) => void) | null = null;
let ready = false;
const layers: Layer[] = [];
/** Our own history.back()/go(-n) calls not yet answered by popstate; pushes wait for them. */
let inFlight = 0;
const queue: (() => void)[] = [];

const state = (): NavState => ({ shq: 1, depth, tab });
const syncTelegram = () => setTelegramBackButton(depth > 0);
const run = (fn: () => void) => (inFlight > 0 ? queue.push(fn) : fn());
const removeLayer = (l: Layer) => {
  const i = layers.indexOf(l);
  if (i >= 0) layers.splice(i, 1);
};

const goBack = (n: number) => {
  if (n <= 0) return;
  inFlight += 1;
  depth = Math.max(0, depth - n);
  history.go(-n);
  syncTelegram();
};

const onPopState = (e: PopStateEvent) => {
  if (inFlight > 0) {
    // The answer to our own back(): nothing to close, the screen is already right.
    inFlight -= 1;
    if (inFlight === 0) queue.splice(0).forEach(fn => fn());
    return;
  }
  const s = e.state as NavState | null;
  const target = s && s.shq === 1 ? s.depth : 0;
  depth = target;
  const toClose = layers.filter(l => l.depth > target).sort((a, b) => b.depth - a.depth);
  for (const l of toClose) {
    removeLayer(l);
    l.popped = true;
    l.close();
  }
  if (s && s.shq === 1 && s.tab !== tab) {
    tab = s.tab;
    setTabRaw?.(s.tab);
  }
  // A window that refused to close (e.g. while saving) keeps its place: its entry comes back.
  window.setTimeout(() => {
    for (const l of toClose) {
      if (!l.isOpen()) continue;
      depth += 1;
      l.depth = depth;
      l.popped = false;
      layers.push(l);
      history.pushState(state(), '');
    }
    syncTelegram();
  }, 0);
  syncTelegram();
};

/** Section saved in the current history entry (after a reload), if it is one the caller accepts. */
export const restoredTab = (accept: (t: string) => boolean): string | null => {
  try {
    const s = history.state as NavState | null;
    return s && s.shq === 1 && typeof s.tab === 'string' && accept(s.tab) ? s.tab : null;
  } catch {
    return null;
  }
};

/** Called once by the app context with its raw section setter and the section on screen. */
export const initBackNav = (setTab: (t: string) => void, currentTab: string) => {
  setTabRaw = setTab;
  tab = currentTab; // once per app (a new provider after sign-in starts from its own section)
  if (ready) return;
  ready = true;
  const s = history.state as NavState | null;
  if (s && s.shq === 1) depth = s.depth;
  else depth = 0;
  history.replaceState(state(), '');
  window.addEventListener('popstate', onPopState);
  onTelegramEvent(type => {
    if (type === 'back_button_pressed') history.back();
  });
  syncTelegram();
};

/**
 * A section change: windows of the previous section close (their entries are removed), then the new
 * section gets its own entry. Returns nothing; the caller sets its state as before.
 */
export const navigateTab = (next: string) => {
  if (!ready || next === tab) {
    tab = next;
    return;
  }
  const open = layers.splice(0).filter(l => l.pushed);
  for (const l of open) {
    l.popped = true;
    l.close();
  }
  const onTop = open.filter(l => l.depth <= depth).length;
  goBack(onTop);
  tab = next;
  run(() => {
    depth += 1;
    history.pushState(state(), '');
    syncTelegram();
  });
};

/**
 * A window (dialog, sheet, a thread opened over a list on a phone) that Back should close.
 * `open` — whether it is shown; `close` — what its own close button does.
 */
export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open || !ready) return;
    const layer: Layer = {
      depth: 0,
      pushed: false,
      cancelled: false,
      popped: false,
      close: () => closeRef.current(),
      isOpen: () => openRef.current,
    };
    run(() => {
      if (layer.cancelled) return;
      depth += 1;
      layer.depth = depth;
      layer.pushed = true;
      layers.push(layer);
      history.pushState(state(), '');
      syncTelegram();
    });
    return () => {
      if (!layer.pushed) {
        layer.cancelled = true;
        return;
      }
      if (layer.popped) return; // Back already removed its entry
      removeLayer(layer);
      if (layer.depth === depth) goBack(1); // closed with its own button: drop its entry
    };
  }, [open]);
}

/** For tests and diagnostics only. */
export const backNavDebug = () => ({ depth, tab, layers: layers.length, inFlight });
