import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Phase 4 (error handling): messages that used to be browser alerts are shown inside the page.
 * In the Telegram mini app a browser alert may not appear at all, so an action could fail silently.
 * Stays until closed or for 10 s; announced to screen readers.
 */
export const AppErrorNotice: React.FC = () => {
  const { appError, dismissAppError, t } = useApp();

  useEffect(() => {
    if (!appError) return;
    const timer = window.setTimeout(dismissAppError, 10000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appError]);

  return (
    <div className="fixed inset-x-0 top-3 z-[70] flex justify-center px-3 pointer-events-none" aria-live="assertive">
      {appError && (
        <div role="alert" data-app-error
             className="pointer-events-auto w-full max-w-md flex items-start gap-2.5 p-3 rounded-xl border border-red-900/70 bg-[#2a1716] text-[13px] text-red-100 shadow-xl">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-300" aria-hidden="true" />
          <p className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">{appError}</p>
          <button type="button" onClick={dismissAppError} aria-label={t('actionClose')}
                  className="shrink-0 -m-1.5 w-9 h-9 inline-flex items-center justify-center rounded-lg text-red-200 hover:bg-red-950/60">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
