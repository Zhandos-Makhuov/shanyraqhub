import type React from 'react';
import { createElement, lazy, useState, type ComponentType } from 'react';

/**
 * Phase 4 (performance): screens load as separate files. Two safeguards:
 *  - after a new version is published, an open page may ask for a file that no longer exists
 *    (Cloudflare Pages keeps only the current build) — then the page reloads (at most once per 30 s)
 *    to pick up the new version; if the file still cannot be loaded, the screen shows a message with
 *    a reload button instead of breaking the page (Phase 4.1: CI found the earlier "once per session" flag
 *    could stay set and let the error through);
 *  - every screen is fetched in the background soon after start (`prefetchViews`), so switching
 *    tabs stays instant even on a slow connection.
 */
const RELOAD_AT = 'shq_chunk_reload_at';
const RELOAD_GAP_MS = 30_000; // at most one automatic reload per 30 s — never a reload loop
const loaders: Array<() => Promise<unknown>> = [];

/** Shown only if a screen still cannot load after the automatic reload (offline, server trouble). */
const FAIL_TEXT = {
  kz: { text: 'Бөлімді жүктеу мүмкін болмады. Интернетті тексеріп, бетті жаңартыңыз.', button: 'Жаңарту' },
  ru: { text: 'Не удалось загрузить раздел. Проверьте интернет и обновите страницу.', button: 'Обновить' },
  en: { text: 'This section could not be loaded. Check your connection and reload the page.', button: 'Reload' },
} as const;
const LoadFailed: React.FC = () => {
  let lang: keyof typeof FAIL_TEXT = 'kz';
  try { const l = localStorage.getItem('shanyraq_lang'); if (l === 'ru' || l === 'en') lang = l; } catch { /* private mode */ }
  const tx = FAIL_TEXT[lang];
  return createElement('div', { role: 'alert', className: 'py-16 flex flex-col items-center gap-3 text-center text-sm text-[#d6cebf]', 'data-view-failed': '' },
    createElement('p', null, tx.text),
    createElement('button', { type: 'button', className: 'btn-secondary min-h-10 px-4 text-xs', onClick: () => window.location.reload() }, tx.button));
};

/** Load a screen; if its file is gone (a newer version was published), reload the page once to get the new
 *  version. If it still fails, show a message with a reload button — the rest of the site keeps working. */
function loadOrRecover<T>(load: () => Promise<T>): () => Promise<T | null> {
  return () => load().catch(() => {
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_AT) || 0); } catch { /* private mode */ }
    if (typeof window !== 'undefined' && Date.now() - last > RELOAD_GAP_MS) {
      try { sessionStorage.setItem(RELOAD_AT, String(Date.now())); } catch { /* private mode */ }
      window.location.reload();
      return new Promise<T>(() => { /* the page is reloading */ });
    }
    return null;
  });
}

export function lazyView<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  let loaded: ComponentType | null = null;
  const remember = (m: M) => { loaded = m[name] as unknown as ComponentType; return m; };
  const safe = loadOrRecover(load);
  loaders.push(() => load().then(remember)); // background fetch: a failure must not reload the page on its own
  const Lazy = lazy(() => safe().then(m => ({ default: m ? remember(m)[name] as unknown as ComponentType : LoadFailed })));
  // Once the file is here (prefetched), the screen renders at once — no loading flash. The choice is made once
  // per mount so a screen never swaps component type (and loses its state) while open.
  const View: React.FC = () => {
    const [C] = useState<ComponentType>(() => loaded ?? Lazy);
    return createElement(C);
  };
  return View;
}

/** Fetch all screens in the background once the first one has rendered. */
export function prefetchViews() {
  const run = () => loaders.forEach(l => { l().catch(() => { /* retried on open */ }); });
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
