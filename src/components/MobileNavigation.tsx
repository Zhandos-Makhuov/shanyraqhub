import React, { useEffect, useState } from 'react';
import { useApp, NavTab } from '../context/AppContext';
import {
  Compass,
  Calendar,
  BookOpen,
  Trophy,
  Menu,
  X,
  Award,
  UserCheck,
  MessageSquare,
  Sparkles,
  User,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { TIERS } from '../data/gamification';

/** Sections always on the bottom bar; the rest open from "More". */
const BAR_TABS: { id: NavTab; labelKey: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', labelKey: 'tabDashboard', icon: Compass },
  { id: 'events', labelKey: 'tabEventsShort', icon: Calendar },
  { id: 'library', labelKey: 'tabLibrary', icon: BookOpen },
  { id: 'leaderboard', labelKey: 'tabLeaderboard', icon: Trophy },
];

export const MobileNavigation: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    currentUser,
    language,
    setLanguage,
    t,
    ln,
  } = useApp();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // The real visible height (Telegram Mini App / mobile browsers: 100vh can be taller than what is shown),
  // and no page scrolling behind the open menu.
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    if (!isMenuOpen) return;
    const update = () => setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      document.body.style.overflow = overflow;
    };
  }, [isMenuOpen]);

  const isStaff =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'admin' ||
    currentUser.role === 'moderator' ||
    currentUser.role === 'organizer';

  const userTier = TIERS[currentUser.tier];

  const allSections: { id: NavTab; label: string; icon: React.FC<{ className?: string }>; badge?: string }[] = [
    { id: 'dashboard', label: t('tabDashboard'), icon: Compass },
    { id: 'events', label: t('tabEvents'), icon: Calendar },
    { id: 'achievements', label: t('tabAchievements'), icon: Award },
    { id: 'library', label: t('tabLibrary'), icon: BookOpen },
    { id: 'attendance', label: t('tabAttendance'), icon: UserCheck },
    { id: 'leaderboard', label: t('tabLeaderboard'), icon: Trophy },
    { id: 'forum', label: t('tabForum'), icon: MessageSquare },
    { id: 'shop', label: t('tabShop'), icon: Sparkles, badge: `${currentUser.coins} 🪙` },
    { id: 'profile', label: t('tabProfile'), icon: User },
    ...(isStaff ? [{ id: 'admin' as NavTab, label: t('tabAdmin'), icon: ShieldCheck }] : []),
  ];

  const inBar = BAR_TABS.some(b => b.id === activeTab);

  const handleSelectTab = (tabId: NavTab) => {
    setActiveTab(tabId);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Fixed bottom bar: four main sections + "More" (everything else lives in the sheet). */}
      <nav
        aria-label={t('navAllSections')}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1e1b1a]/95 backdrop-blur-md border-t border-[#352f2c] px-1.5 pt-1 safe-area-pb"
      >
        <div className="flex items-stretch justify-around max-w-md mx-auto">
          {[
            ...BAR_TABS.map(b => ({ ...b, label: t(b.labelKey), active: activeTab === b.id, onClick: () => handleSelectTab(b.id) })),
            { id: 'more', icon: Menu, label: t('navMenu'), active: isMenuOpen || !inBar, onClick: () => setIsMenuOpen(true) },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                aria-current={item.active ? 'page' : undefined}
                className={`flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 min-h-[52px] px-0.5 transition-colors ${
                  item.active ? 'text-[#ecd9bf]' : 'text-[#8c8279] active:text-[#d6cebf]'
                }`}
              >
                <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-colors ${item.active ? 'bg-[#dfcfb3]/15' : ''}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className={`max-w-full text-[11px] max-[359px]:text-[10px] leading-tight truncate ${item.active ? 'font-semibold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Full-Screen / Slide-over Mobile Navigation Drawer */}
      {isMenuOpen && (
        <div
          className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm animate-fade-in"
          style={{ height: viewportHeight }}
          onClick={e => e.target === e.currentTarget && setIsMenuOpen(false)}
        >
          <div
            className="mt-auto w-full bg-[#201d1c] border-t border-[#3f3834] rounded-t-2xl p-5 space-y-4 overflow-y-auto overscroll-contain"
            style={{ maxHeight: Math.round(viewportHeight * 0.85), paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#352f2c]">
              <div className="flex items-center gap-2.5">
                <img
                  src={currentUser.avatar}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover ring-1 ring-[#dfcfb3]"
                />
                <div>
                  <span className="text-xs font-bold text-[#f5f2eb] block">
                    {currentUser.name}
                  </span>
                  <span className={`text-[10px] font-semibold ${userTier.textColor}`}>
                    {ln(userTier)} · {currentUser.xp} XP
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsMenuOpen(false)}
                aria-label={t('actionClose')}
                className="btn-icon text-[#9e948c]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Language Quick Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#191615] border border-[#302a28] text-xs">
              <span className="text-[#8c8279] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#dfcfb3]" />
                <span>{t('navLanguage')}:</span>
              </span>
              <div className="flex items-center gap-1">
                {(['ru', 'kz', 'en'] as const).map(l => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`min-h-8 min-w-10 px-2.5 rounded-lg text-xs font-mono font-semibold uppercase ${
                      language === l
                        ? 'bg-[#dfcfb3] text-[#1e1b1a]'
                        : 'text-[#8c8279] hover:text-[#f5f2eb]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* All Sections List */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#736a62] px-2 block mb-1">
                {t('navAllSections')}
              </span>

              <div className="grid grid-cols-2 gap-2">
                {allSections.filter(sec => !BAR_TABS.some(b => b.id === sec.id)).map(sec => {
                  const Icon = sec.icon;
                  const isCurrent = activeTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => handleSelectTab(sec.id)}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={`flex flex-col items-start gap-2 min-h-[72px] p-3 rounded-xl text-left text-[13px] transition-colors ${
                        isCurrent
                          ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                          : 'bg-[#191615] text-[#e6dfd3] font-medium border border-[#302a28] active:bg-[#282321]'
                      }`}
                    >
                      <span className="w-full flex items-center justify-between">
                        <Icon className={`w-5 h-5 ${isCurrent ? 'text-[#1e1b1a]' : 'text-[#dfcfb3]'}`} />
                        {sec.badge && (
                          <span className={`text-[11px] font-mono-numbers ${isCurrent ? 'text-[#1e1b1a]' : 'text-amber-400'}`}>
                            {sec.badge}
                          </span>
                        )}
                      </span>
                      <span className="leading-tight">{sec.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
