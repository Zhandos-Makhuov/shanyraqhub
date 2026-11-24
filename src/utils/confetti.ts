import type { Options } from 'canvas-confetti';

/**
 * Phase 4.1 (P4-13): the celebration animation is loaded on first use (≈10 kB), not with the first screen.
 * Never throws: a failed load simply means no confetti.
 */
export const fireConfetti = (options?: Options): void => {
  import('canvas-confetti').then(m => m.default(options)).catch(() => { /* no animation */ });
};
