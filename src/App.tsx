import React, { Suspense, lazy, useEffect, useState } from 'react';
import { loadInitialData, InitialData } from './data/sources';
import { isDemoData } from './config/runtime';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { MobileNavigation } from './components/MobileNavigation';
import { DashboardView } from './components/DashboardView';
import { lazyView, prefetchViews } from './utils/lazyView';
import { MemberProfileModal } from './components/MemberProfileModal';
import { AchievementToast } from './components/AchievementToast';
import { AppErrorNotice } from './components/AppErrorNotice';

// Live mode only: sign-in gate + Supabase client. Compared against the inlined env value
// so demo builds drop this chunk (and supabase-js) entirely.
// Phase 4: every screen except the home page is its own file (the home page is what opens first).
const EventsView = lazyView(() => import('./components/EventsView'), 'EventsView');
const AchievementsView = lazyView(() => import('./components/AchievementsView'), 'AchievementsView');
const ReadingLibraryView = lazyView(() => import('./components/ReadingLibraryView'), 'ReadingLibraryView');
const AttendanceView = lazyView(() => import('./components/AttendanceView'), 'AttendanceView');
const LeaderboardView = lazyView(() => import('./components/LeaderboardView'), 'LeaderboardView');
const AvatarShopView = lazyView(() => import('./components/AvatarShopView'), 'AvatarShopView');
const ForumAndChatsView = lazyView(() => import('./components/ForumAndChatsView'), 'ForumAndChatsView');
const ProfileView = lazyView(() => import('./components/ProfileView'), 'ProfileView');
const AdminView = lazyView(() => import('./components/AdminView'), 'AdminView');

/** Placeholder while a screen file arrives (normally already prefetched). */
const ViewFallback: React.FC = () => (
  <div role="status" aria-live="polite" className="py-16 flex justify-center" data-view-loading>
    <span className="w-8 h-8 rounded-full border-2 border-[#dfcfb3]/30 border-t-[#dfcfb3] animate-spin" aria-hidden="true" />
    <span className="sr-only">…</span>
  </div>
);

const AuthGate = import.meta.env.VITE_DATA_SOURCE === 'live' ? lazy(() => import('./components/AuthGate')) : null;

const MainContent: React.FC = () => {
  const { activeTab, t } = useApp();
  useEffect(() => { prefetchViews(); }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#191615] text-[#f5f2eb] overflow-x-hidden w-full max-w-full">
      <Header />
      <NavigationTabs />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-28 md:pb-10">
        <Suspense fallback={<ViewFallback />}>
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'events' && <EventsView />}
        {activeTab === 'achievements' && <AchievementsView />}
        {activeTab === 'library' && <ReadingLibraryView />}
        {activeTab === 'attendance' && <AttendanceView />}
        {activeTab === 'leaderboard' && <LeaderboardView />}
        {activeTab === 'forum' && <ForumAndChatsView />}
        {activeTab === 'shop' && <AvatarShopView />}
        {activeTab === 'profile' && <ProfileView />}
        {activeTab === 'admin' && <AdminView />}
        </Suspense>
      </main>

      {/* Persistent Mobile Bottom Navigation */}
      <MobileNavigation />

      <footer className="border-t border-[#302a28] bg-[#161312] py-8 px-4 lg:px-8 text-xs text-[#9e948c] mb-[calc(3.75rem+env(safe-area-inset-bottom))] md:mb-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#24201e] ring-1 ring-[#dfcfb3]/40 p-0.5 shrink-0 flex items-center justify-center">
              <img
                src="/assets/aistudio/IMG_9313_86e71ea6.PNG"
                alt="Shanyraq Hub"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-display font-semibold text-[#f5f2eb] text-center sm:text-left">
              SHAŃYRAQ HUB · {t('footerTagline')}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <span>Алматы · Астана</span>
            <span>·</span>
            <span>{t('footerPrivateRooms')}</span>
            {isDemoData && (
              <>
                <span>·</span>
                <span className="font-mono text-amber-400/80">Demo Environment</span>
              </>
            )}
            <span>·</span>
            <span>© 2026 Shanyraq Hub Ecosystem</span>
          </div>
        </div>
      </footer>

      {/* Global Member Profile Inspection Modal */}
      <MemberProfileModal />
      <AchievementToast />
      <AppErrorNotice />
    </div>
  );
};

/** Before the app context exists: the saved language (Kazakh by default) for the loading screen. */
const BOOT_TEXT = {
  kz: { loading: 'Жүктелуде…', error: 'Деректерді жүктеу мүмкін болмады' },
  ru: { loading: 'Загрузка…', error: 'Не удалось загрузить данные' },
  en: { loading: 'Loading…', error: 'Could not load the data' },
} as const;
const bootText = () => {
  try { const l = localStorage.getItem('shanyraq_lang'); return BOOT_TEXT[l === 'ru' || l === 'en' ? l : 'kz']; } catch { return BOOT_TEXT.kz; }
};

/** Shown for the moment the initial data loads (demo module or, later, Supabase). */
const LoadingScreen: React.FC<{ error?: string }> = ({ error }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#191615] text-[#9e948c] px-6 text-center">
    <div className="w-14 h-14 rounded-full overflow-hidden bg-[#24201e] ring-1 ring-[#dfcfb3]/40 p-1 flex items-center justify-center animate-pulse">
      <img src="/icons/icon-192.png" alt="Shanyraq Hub" className="w-full h-full object-contain rounded-full" />
    </div>
    <span className="text-xs" role="status">{error ? `${bootText().error}: ${error}` : bootText().loading}</span>
  </div>
);

export default function App() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadInitialData()
      .then(setInitialData)
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (!initialData) return <LoadingScreen error={error} />;

  if (AuthGate) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AuthGate>
          {account => (
            <AppProvider initialData={initialData} account={account}>
              <MainContent />
            </AppProvider>
          )}
        </AuthGate>
      </Suspense>
    );
  }

  return (
    <AppProvider initialData={initialData}>
      <MainContent />
    </AppProvider>
  );
}
