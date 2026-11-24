import React, { useId, useState } from 'react';
import { useApp } from '../context/AppContext';
import { STORAGE_KEY, isDemoData } from '../config/runtime';
import { X, Database, ShieldCheck, RefreshCw, Server, CheckCircle2 } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { ConfirmDialog } from './ForumPostTools';

interface DemoStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Data status and architecture" window (header badge in demo, user menu in both modes).
 * Phase 4.1 (P4-8b): all texts in kz/ru/en through translations.ts; live texts describe the current
 * server-backed site truthfully; dialog behaviour (Escape, focus) and the site's confirm window.
 */
export const DemoStatusModal: React.FC<DemoStatusModalProps> = ({ isOpen, onClose }) => {
  const { allUsers, events, allReadBooks, t } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useDialog<HTMLDivElement>(isOpen && !confirmReset, onClose);
  const titleId = useId();

  if (!isOpen) return null;

  const resetDemoData = () => {
    if (!isDemoData) return;
    // Demo keys only: live data is never touched by this button.
    const suffixes = ['users', 'events', 'topics', 'chats', 'notifs', 'txs', 'audits', 'rewards', 'activity'];
    suffixes.forEach(suffix => localStorage.removeItem(`${STORAGE_KEY}_${suffix}`));
    window.location.reload();
  };

  const badge = (text: string, ok: boolean) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 text-right ${ok ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : 'bg-amber-950/80 text-amber-300 border-amber-800'}`}>
      {text}
    </span>
  );
  const row = (icon: React.ReactNode, name: string, desc: string, status: React.ReactNode) => (
    <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1 basis-48">
        {icon}
        <div className="min-w-0">
          <span className="font-medium text-[#f5f2eb] block break-words">{name}</span>
          <span className="text-[10px] text-[#9e948c] block break-words">{desc}</span>
        </div>
      </div>
      {status}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-status-dialog
           className="outline-none relative w-full max-w-lg bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('actionClose')}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716] transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2.5 pr-8">
          <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-600/40 flex items-center justify-center text-amber-400 shrink-0">
            <Database className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-base sm:text-lg font-bold text-[#f5f2eb] break-words">
              {t('dsmTitle')}
            </h3>
            <span className={`text-[11px] font-mono ${isDemoData ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isDemoData ? t('dsmModeDemo') : t('dsmModeLive')}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#1a1716] border border-[#352f2c] text-xs space-y-2 text-[#b0a79d] leading-relaxed">
          {isDemoData ? (
            <>
              <p><strong className="text-[#f5f2eb]">{t('dsmAttention')}</strong> {t('dsmDemoNote1')}</p>
              <p>{t('dsmDemoNote2')}</p>
            </>
          ) : (
            <>
              <p>{t('dsmLiveNote1')}</p>
              <p>{t('dsmLiveNote2')}</p>
            </>
          )}
        </div>

        {/* Backend & Integration Status Matrix */}
        <div className="space-y-2 pt-1 text-xs">
          <span className="font-semibold text-[#dfcfb3] text-[11px] uppercase tracking-wider block">
            {t('dsmModules')}
          </span>
          <div className="space-y-1.5">
            {row(<Server className="w-4 h-4 text-[#9e948c] shrink-0" aria-hidden="true" />, 'Supabase PostgreSQL & Auth', t('dsmDbDesc'),
                 badge(isDemoData ? t('dsmDbDemo') : t('dsmConnected'), !isDemoData))}
            {row(<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />, t('dsmLocalName'),
                 isDemoData ? t('dsmLocalDescDemo') : t('dsmLocalDescLive'), badge(t('dsmActive'), true))}
            {row(<ShieldCheck className="w-4 h-4 text-[#9e948c] shrink-0" aria-hidden="true" />, t('dsmChatsName'), t('dsmChatsDesc'),
                 badge(isDemoData ? t('dsmLiveOnly') : t('dsmActive'), !isDemoData))}
            {row(<CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />, 'PWA & Service Worker', t('dsmPwaDesc'),
                 badge(t('dsmOn'), true))}
          </div>
        </div>

        {/* Records currently loaded */}
        <div className="p-3 rounded-xl bg-[#1a1716] border border-[#302a28] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-[#9e948c]">
          <span>{isDemoData ? t('dsmCountDemo') : t('dsmCountLive')}</span>
          <span className="font-mono text-[#dfcfb3]" data-status-counts>
            {t('dsmCounts').replace('{u}', String(allUsers.length)).replace('{e}', String(events.length)).replace('{b}', String(allReadBooks.length))}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#302a28]">
          {isDemoData ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 min-h-10 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3d3632] text-xs text-[#dfcfb3] flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('dsmReset')}</span>
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-colors"
          >
            {t('dsmGotIt')}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title={t('dsmResetQ')}
        text={t('dsmResetText')}
        confirmLabel={t('dsmReset')}
        busyLabel={t('evWorking')}
        cancelLabel={t('frmCancel')}
        busy={false}
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetDemoData}
      />
    </div>
  );
};
