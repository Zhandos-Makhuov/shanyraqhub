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
 * has rendered) the splash fades out and is removed, so it never covers the app or catches taps afterwards —
 * not before its intro has played in full (owner's request, 25.11.2026).
 * Error screens do not hold the splash, so an error is never hidden behind it.
 *
 * If the splash is already gone and a later loading step starts (e.g. member data after signing in with the form),
 * a fresh copy is shown after a short delay — a quick load does not flash it.
 */
const ID = 'boot-splash';
const FADE_MS = 300;
/** Owner's request (25.11.2026): the intro (draw → fill → name) always plays to the end before the app shows.
 *  Matches the CSS in index.html: the outline fades out at 1750 + 450 ms. */
export const INTRO_MS = 2250;
/** A later loading step shows its splash only after this delay (a quick step does not flash it). */
const LATE_DELAY_MS = 150;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** How long the intro of this splash still has to play (0 with reduced motion — nothing moves then; 0 for a later
 *  splash that has not appeared yet — then it is simply not shown). */
function introLeft(el: HTMLElement): number {
  if (reducedMotion()) return 0;
  const start = Number(el.getAttribute('data-start'));
  if (!Number.isFinite(start) || start <= 0) return 0;
  const now = performance.now();
  if (now < start) return 0;
  return Math.max(0, start + INTRO_MS - now);
}

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
  fresh.setAttribute('data-start', String(performance.now() + LATE_DELAY_MS));
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
      // One loader often replaces another in the same render (start-up steps); wait a tick before fading —
      // and until the intro has played in full. A new loader in the meantime cancels the fade.
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        if (holders !== 0) return;
        const el = current();
        const wait = el ? introLeft(el) : 0;
        releaseTimer = window.setTimeout(() => { if (holders === 0) hide(); }, wait);
      }, 0);
    };
  }, [active]);
}
