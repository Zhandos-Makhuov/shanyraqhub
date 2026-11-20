/**
 * Live only: Telegram in the notifications menu — link the account to the club bot (one-time deep link),
 * switch Telegram notifications on/off, unlink. Who gets which message is decided on the server.
 */
import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { TelegramStatus } from '../data/supabase/live';

export const TelegramConnect: React.FC = () => {
  const { liveApi, runLiveAction, currentUser, t } = useApp();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    liveApi?.telegramStatus()
      .then(next => {
        if (next.linked) setLink(null); // the one-time link has been used
        setStatus(prev => {
          // Linked in Telegram meanwhile: the server also switched Telegram notifications on — reload the profile.
          if (prev && !prev.linked && next.linked) void runLiveAction(Promise.resolve({ ok: true as const }), true);
          return next;
        });
      })
      .catch(() => setStatus(null));
  useEffect(() => {
    void reload();
    // The member links in Telegram, then comes back here: check again when the page is visible.
    const onVisible = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApi]);

  if (!liveApi || !status?.botUsername) return null;
  const internalEmail = currentUser.email.endsWith('@telegram.invalid'); // signed up with Telegram: it is their only way in
  const enabled = !!currentUser.telegramNotificationsEnabled;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); void reload(); }
  };
  const button = 'text-[10px] text-[#dfcfb3] hover:underline disabled:opacity-50';

  return (
    <div className="mt-2 pt-2 border-t border-[#38322e] text-[10px] text-[#9e948c]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[#d6cebf]">
          <Send className="w-3 h-3 text-[#dfcfb3]" /> Telegram
        </span>
        {!status.linked ? (
          link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className={button} onClick={() => setTimeout(() => setLink(null), 1000)}>
              {t('tgLinkOpen')}
            </a>
          ) : (
            <button
              disabled={busy}
              className={button}
              onClick={() => act(async () => {
                const r = await liveApi.createTelegramLink(status.botUsername!);
                if (r.ok) setLink(r.url);
                else alert(t(r.error));
              })}
            >
              {t('tgLink')}
            </button>
          )
        ) : (
          <span className="flex items-center gap-3">
            <button
              disabled={busy}
              className={button}
              onClick={() => act(() => runLiveAction(liveApi.updateOwnProfile({ telegramNotificationsEnabled: !enabled })))}
            >
              {enabled ? t('tgOn') : t('tgOff')}
            </button>
            {!internalEmail && (
              <button
                disabled={busy}
                className="text-[10px] text-[#9e948c] hover:text-[#f5f2eb] disabled:opacity-50"
                onClick={() => confirm(t('tgUnlinkConfirm')) && act(() => runLiveAction(liveApi.unlinkTelegram()))}
              >
                {t('tgUnlink')}
              </button>
            )}
          </span>
        )}
      </div>
      {link && !status.linked && <div className="mt-1">{t('tgLinkHint')}</div>}
      {status.linked && status.blocked && <div className="mt-1 text-amber-300/80">{t('tgBlocked')}</div>}
      {status.linked && !status.canMessage && !status.blocked && enabled && (
        <a href={`https://t.me/${status.botUsername}`} target="_blank" rel="noopener noreferrer" className="block mt-1 hover:underline">
          {t('tgNeedStart')}
        </a>
      )}
    </div>
  );
};

export default TelegramConnect;
