/**
 * After a deploy, pages that stay open (a Telegram Mini App kept in the background, a PWA, a tab)
 * would keep running the old version. When the page becomes visible again (and every 10 minutes),
 * compare the build's main script with the one on the server; if a new version is out, reload.
 * Production builds only; the reload happens only while the page is visible and not mid-typing.
 */
const currentScript = () =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? null;

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
};

export const startAutoUpdate = () => {
  if (!import.meta.env.PROD) return;
  const mine = currentScript();
  if (!mine) return;
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== 'visible' || isTyping()) return;
    checking = true;
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text();
      const latest = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+)"/.exec(html)?.[1];
      if (latest && latest !== mine) window.location.reload();
    } catch {
      // offline: try again later
    } finally {
      checking = false;
    }
  };
  document.addEventListener('visibilitychange', () => void check());
  window.addEventListener('focus', () => void check());
  window.setInterval(() => void check(), 10 * 60 * 1000);
  void check();
};
