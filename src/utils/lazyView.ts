import type React from 'react';
import { createElement, lazy, useState, type ComponentType } from 'react';

/**
 * Phase 4 (performance): screens load as separate files. Two safeguards:
 *  - after a new version is published, an open page may ask for a file that no longer exists
 *    (Cloudflare Pages keeps only the current build) — then the page reloads once to pick up
 *    the new version instead of showing a blank screen;
 *  - every screen is fetched in the background soon after start (`prefetchViews`), so switching
 *    tabs stays instant even on a slow connection.
 */
const RELOAD_FLAG = 'shq_chunk_reload';
const loaders: Array<() => Promise<unknown>> = [];

function withReloadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  return () => load().then(
    mod => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* private mode */ } return mod; },
    err => {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* private mode */ }
      if (!reloaded && typeof window !== 'undefined') {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* private mode */ }
        window.location.reload();
        return new Promise<T>(() => { /* the page is reloading */ });
      }
      throw err;
    },
  );
}

export function lazyView<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  let loaded: ComponentType | null = null;
  const remember = (m: M) => { loaded = m[name] as unknown as ComponentType; return m; };
  const safe = withReloadOnce(load);
  loaders.push(() => load().then(remember)); // background fetch: a failure must not reload the page on its own
  const Lazy = lazy(() => safe().then(m => ({ default: remember(m)[name] as unknown as ComponentType })));
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
