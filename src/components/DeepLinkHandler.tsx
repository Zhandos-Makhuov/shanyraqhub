import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { DeepLink, linkFromUrl, takeDeepLink } from '../utils/deepLink';
import { routeNotification, setEventsIntent, setForumIntent } from '../utils/navIntent';

/**
 * Phase 6 (C-16): opens what a direct link points to, once the member is inside the app
 * (after sign-in in live mode). Also handles a tap on a Web Push notification while the site is
 * already open (the service worker sends the link here instead of opening a second window).
 * Renders nothing.
 */
export const DeepLinkHandler: React.FC = () => {
  const { notifications, currentUser, setActiveTab, markNotificationRead, liveApi, showAppError, t } = useApp();
  const ctx = useRef({ notifications, currentUser, setActiveTab, markNotificationRead, liveApi, showAppError, t });
  ctx.current = { notifications, currentUser, setActiveTab, markNotificationRead, liveApi, showAppError, t };

  useEffect(() => {
    const open = async (link: DeepLink) => {
      const c = ctx.current;
      if (link.kind === 'event') {
        setEventsIntent({ openEventId: link.id }); // unavailable -> the events page says so (existing message)
        c.setActiveTab('events');
      } else if (link.kind === 'topic') {
        setForumIntent({ topicId: link.id }); // hidden/deleted -> the forum says so (existing message)
        c.setActiveTab('forum');
      } else {
        // Own notifications only: in the loaded list, or fetched through RLS (someone else's id finds nothing).
        let n = c.notifications.find(x => x.id === link.id && x.userId === c.currentUser.id) ?? null;
        if (!n && c.liveApi) n = await c.liveApi.fetchNotification(link.id);
        if (!n) {
          c.showAppError(c.t('dlNotificationGone'));
          return;
        }
        routeNotification(n, c.setActiveTab);
        if (!n.read) c.markNotificationRead(n.id);
      }
      window.scrollTo({ top: 0 });
    };

    const pending = takeDeepLink();
    if (pending) void open(pending);

    // A push tapped while the site is open: the service worker focuses this tab and sends the link.
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type !== 'shq-open' || typeof data.url !== 'string') return;
      const link = linkFromUrl(data.url);
      if (link) void open(link);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  return null;
};
