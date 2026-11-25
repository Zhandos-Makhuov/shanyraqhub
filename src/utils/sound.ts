/**
 * Club sounds (25.11.2026, owner's request) — made in the browser with Web Audio, no files, no licences.
 *  - "sword": a short metallic "shing" (a blade drawn from its sheath) — the loading screen and a new level;
 *  - "pluck": a dombyra-like pluck of two strings — a new achievement.
 *
 * Browsers and Telegram let a page play sound only after the person has touched it. On the loading screen the
 * sound is therefore only an attempt: where it is not allowed, nothing plays and nothing breaks. After any tap
 * inside the site (sign-in, a button) sounds for levels and achievements play normally.
 * Anyone can turn sounds off ("Дыбыс" in the bell menu); the choice is kept on the device.
 */
const KEY = 'shanyraq_sound';
export type ClubSound = 'sword' | 'pluck';

export const soundEnabled = (): boolean => {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
};
export const setSoundEnabled = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
};

type Ctx = AudioContext;
let ctx: Ctx | null = null;
const audioCtx = (): Ctx | null => {
  if (ctx) return ctx;
  const C = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try { ctx = new C(); } catch { return null; }
  return ctx;
};

function sword(c: BaseAudioContext) {
  const t0 = c.currentTime + 0.01;
  const out = c.createGain();
  out.gain.value = 0.4;
  out.connect(c.destination);
  // The blade sliding out: bright noise through a rising, narrow band.
  const len = Math.floor(c.sampleRate * 0.55);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 9;
  band.frequency.setValueAtTime(2600, t0);
  band.frequency.exponentialRampToValueAtTime(8200, t0 + 0.45);
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(5, t0 + 0.04);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  noise.connect(band).connect(ng).connect(out);
  noise.start(t0);
  noise.stop(t0 + 0.55);
  // The ring of steel: a few inharmonic partials that fade slowly.
  const ring = c.createGain();
  ring.gain.value = 0.5;
  ring.connect(out);
  [1870, 2790, 4150, 5380, 6930].forEach((f, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t0 + 0.12);
    o.detune.setValueAtTime(i % 2 ? 7 : -7, t0 + 0.12);
    const g = c.createGain();
    const peak = 0.32 / (i + 1);
    g.gain.setValueAtTime(0.0001, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15 + 1.4 - i * 0.15);
    o.connect(g).connect(ring);
    o.start(t0 + 0.12);
    o.stop(t0 + 1.7);
  });
}

function pluck(c: BaseAudioContext) {
  const t0 = c.currentTime + 0.01;
  const out = c.createGain();
  out.gain.value = 0.3;
  out.connect(c.destination);
  // Two strings a fourth apart (like a dombyra's), the second a touch later — a short strum.
  [[293.66, 0], [392.0, 0.035]].forEach(([f, delay]) => {
    const t = t0 + delay;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.6);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.2);
  });
}

/** The sound recipes (also used to render previews offline). */
export const SOUND_RECIPES: Record<ClubSound, (c: BaseAudioContext) => void> = { sword, pluck };

/** Play a club sound if sounds are on and the browser allows it now. Never throws, never waits. */
export async function playSound(kind: ClubSound): Promise<boolean> {
  if (!soundEnabled() || typeof window === 'undefined') return false;
  const c = audioCtx();
  if (!c) return false;
  try {
    if (c.state !== 'running') await c.resume();
  } catch { /* not allowed yet */ }
  if (c.state !== 'running') return false; // no tap yet: stay silent
  try {
    (kind === 'sword' ? sword : pluck)(c);
    (window as unknown as { __shqSounds?: string[] }).__shqSounds?.push(kind); // seen by the browser checks
    return true;
  } catch {
    return false;
  }
}
