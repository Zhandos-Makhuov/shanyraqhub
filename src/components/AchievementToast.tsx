import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Award, X } from 'lucide-react';
import { AppNotification } from '../types';

/**
 * A quiet card when a NEW achievement notification arrives for the current member
 * (demo: AppContext unlock; live: the server's notification via Realtime).
 * It only reads notifications — the awarding logic is untouched. Notifications that
 * already existed when the page opened never pop up; it hides by itself after 6 s.
 */
export const AchievementToast: React.FC = () => {
  const { notifications, currentUser, setActiveTab, t } = useApp();
  const seen = useRef<Set<string> | null>(null);
  const [toast, setToast] = useState<AppNotification | null>(null);

  useEffect(() => {
    const mine = notifications.filter(n => n.userId === currentUser.id && n.type === 'achievement');
    if (!seen.current) {
      seen.current = new Set(mine.map(n => n.id)); // first render: existing ones are history
      return;
    }
    const fresh = mine.find(n => !n.read && !seen.current!.has(n.id));
    mine.forEach(n => seen.current!.add(n.id));
    if (fresh) setToast(fresh);
  }, [notifications, currentUser.id]);

  // A different member (demo account switch) starts with a clean history.
  useEffect(() => { seen.current = null; setToast(null); }, [currentUser.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 left-3 right-3 md:left-auto md:right-6 md:w-96 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 animate-fade-in"
    >
      <div className="flex items-start gap-3 p-3 rounded-2xl bg-[#26211f]/95 backdrop-blur-md border border-[#dfcfb3]/40 shadow-2xl">
        <button
          onClick={() => { setToast(null); setActiveTab('achievements'); window.scrollTo({ top: 0 }); }}
          className="flex items-start gap-3 flex-1 min-w-0 text-left"
        >
          <span className="w-10 h-10 shrink-0 rounded-xl bg-[#dfcfb3]/15 border border-[#dfcfb3]/80 text-[#ecd9bf] flex items-center justify-center">
            <Award className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[#f5f2eb]">{toast.title}</span>
            <span className="block text-[12px] text-[#b0a79d] line-clamp-2">{toast.message}</span>
          </span>
        </button>
        <button onClick={() => setToast(null)} aria-label={t('actionClose')} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#8c8279] hover:text-[#f5f2eb]">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
