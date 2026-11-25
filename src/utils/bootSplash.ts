import { useEffect } from 'react';

/**
 * Loading screen "Shanyraq Draw" (25.11.2026).
 *
 * The splash itself lives in index.html (`#boot-splash`), outside the React root, so it is on screen from the
 * very first frame — before any script has loaded — and keeps animating without a restart while the app moves
 * through its start-up steps (initial data → sign-in file → session → member data).
 *
 * Every component that means "still loading" calls `useBootSplash()`. While at least one of them is mounted the
 * splash stays; when the last one goes (the first real screen — sign-in form, home page, or an error message —
 * has rendered) the splash fades out and is removed, so it never covers the app or catches taps afterwards.
 * Error screens do not hold the splash, so an error is never hidden behind it.
 *
 * If the splash is already gone and a later loading step starts (e.g. member data after signing in with the form),
 * a fresh copy is shown after a short delay — a quick load does not flash it.
 */
const ID = 'boot-splash';
const FADE_MS = 300;

interface SplashHelpers {
  localize: (el: HTMLElement) => void;
  armStuck: (el: HTMLElement) => number;
}
const helpers = (): SplashHelpers | undefined => (window as Window & { __shqSplash?: SplashHelpers }).__shqSplash;

// Clean copy of the splash, taken before React changes anything (the module loads after index.html is parsed).
const template: HTMLElement | null = typeof document !== 'undefined'
  ? (document.getElementById(ID)?.cloneNode(true) as HTMLElement | null) ?? null
  : null;

let holders = 0;
let releaseTimer: number | undefined;
let stuckTimer: number | undefined;

const current = () => document.getElementById(ID);

function show() {
  const el = current();
  if (el && !el.classList.contains('is-leaving')) return; // the start-up splash is still on screen
  if (!template) return;
  el?.remove();
  const fresh = template.cloneNode(true) as HTMLElement;
  fresh.classList.add('is-late');
  fresh.querySelector<HTMLElement>('[data-splash-stuck]')?.setAttribute('hidden', '');
  helpers()?.localize(fresh); // the language may have changed on the sign-in screen
  document.body.appendChild(fresh);
  window.clearTimeout(stuckTimer);
  stuckTimer = helpers()?.armStuck(fresh);
}

function hide() {
  const el = current();
  if (!el || el.classList.contains('is-leaving')) return;
  window.clearTimeout(stuckTimer);
  el.classList.add('is-leaving');
  el.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => el.remove(), FADE_MS);
}

/** Whether the splash can be used at all (index.html has it). Without it, loaders show their own simple view. */
export const hasBootSplash = template !== null;

/** Keep the splash on screen while this component is mounted (and `active`). */
export function useBootSplash(active = true) {
  useEffect(() => {
    if (!active || !hasBootSplash) return;
    holders += 1;
    window.clearTimeout(releaseTimer);
    show();
    return () => {
      holders -= 1;
      // One loader often replaces another in the same render (start-up steps); wait a tick before fading.
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => { if (holders === 0) hide(); }, 0);
    };
  }, [active]);
}
