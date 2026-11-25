import type React from 'react';
import { inTelegram, tgPost } from './telegramBridge';

/**
 * 2GIS link of an in-person event (25.11.2026, owner's request): members open the place in the 2GIS app.
 *
 * Stored in public.events.online_url, which in-person events did not use (no migration). Only https links to
 * 2GIS are accepted — in the form and again when shown, so a value written past the form (e.g. through the API)
 * is never rendered as a link.
 */
const HOSTS = /^(?:[a-z0-9-]+\.)*2gis\.(?:kz|ru|com|ae|kg|uz|az|am|ge|cz|cl|it)$/i;

/** The link in a clean form, or null if it is not a 2GIS link. Empty input -> null. */
export function parse2gisLink(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!HOSTS.test(url.hostname) || url.username || url.password) return null;
  url.protocol = 'https:';
  return url.toString();
}

/** In the Telegram Mini App a plain link would open inside the Mini App: ask Telegram to open it outside
 *  (the phone then offers the 2GIS app). Elsewhere the normal link (new tab / the app) is used. */
export function openMapLink(e: React.MouseEvent<HTMLAnchorElement>, url: string) {
  if (!inTelegram()) return;
  e.preventDefault();
  tgPost('web_app_open_link', { url });
}
