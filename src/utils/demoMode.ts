/**
 * Demo mode shows the test-account switcher (header → "Сменить тестовую роль").
 * - Local development (`bun run dev`): on by default.
 * - Production build: off unless built with VITE_DEMO_MODE=true.
 * Set VITE_DEMO_MODE=false to hide it during development too.
 */
const flag = import.meta.env.VITE_DEMO_MODE as string | undefined;

export const isDemoMode: boolean = flag !== undefined ? flag === 'true' : import.meta.env.DEV;
