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
  Coins,
  Globe,
} from 'lucide-react';
import { TIERS } from '../data/gamification';

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

  const handleSelectTab = (tabId: NavTab) => {
    setActiveTab(tabId);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Fixed Bottom Bar on Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1e1b1a]/95 backdrop-blur-md border-t border-[#352f2c] px-2 py-1.5 safe-area-pb">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {/* 1. Dashboard */}
          <button
            onClick={() => handleSelectTab('dashboard')}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center min-h-[44px] py-1 px-0.5 transition-colors ${
              activeTab === 'dashboard' ? 'text-[#dfcfb3]' : 'text-[#8c8279]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span className="max-w-full text-[10px] max-[374px]:text-[9px] mt-0.5 font-medium truncate">
              {t('tabDashboard')}
            </span>
          </button>

          {/* 2. Events */}
          <button
            onClick={() => handleSelectTab('events')}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center min-h-[44px] py-1 px-0.5 transition-colors ${
              activeTab === 'events' ? 'text-[#dfcfb3]' : 'text-[#8c8279]'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span className="max-w-full text-[10px] max-[374px]:text-[9px] mt-0.5 font-medium truncate">
              {t('tabEventsShort')}
            </span>
          </button>

          {/* 3. Library */}
          <button
            onClick={() => handleSelectTab('library')}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center min-h-[44px] py-1 px-0.5 transition-colors ${
              activeTab === 'library' ? 'text-[#dfcfb3]' : 'text-[#8c8279]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="max-w-full text-[10px] max-[374px]:text-[9px] mt-0.5 font-medium truncate">
              {t('tabLibrary')}
            </span>
          </button>

          {/* 4. Leaderboard */}
          <button
            onClick={() => handleSelectTab('leaderboard')}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center min-h-[44px] py-1 px-0.5 transition-colors ${
              activeTab === 'leaderboard' ? 'text-[#dfcfb3]' : 'text-[#8c8279]'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span className="max-w-full text-[10px] max-[374px]:text-[9px] mt-0.5 font-medium truncate">
              {t('tabLeaderboard')}
            </span>
          </button>

          {/* 5. Menu trigger */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className={`flex flex-1 min-w-0 flex-col items-center justify-center min-h-[44px] py-1 px-0.5 transition-colors ${
              isMenuOpen ? 'text-[#dfcfb3]' : 'text-[#8c8279]'
            }`}
          >
            <Menu className="w-4 h-4" />
            <span className="max-w-full text-[10px] max-[374px]:text-[9px] mt-0.5 font-medium truncate">
              {t('navMenu')}
            </span>
          </button>
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
            className="flex-1 mt-auto w-full bg-[#201d1c] border-t border-[#3f3834] rounded-t-2xl p-5 space-y-4 overflow-y-auto overscroll-contain"
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
                className="p-2 rounded-lg bg-[#191615] text-[#9e948c] hover:text-white"
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
                    className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold uppercase ${
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {allSections.map(sec => {
                  const Icon = sec.icon;
                  const isCurrent = activeTab === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => handleSelectTab(sec.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-medium transition-all ${
                        isCurrent
                          ? 'bg-[#dfcfb3] text-[#1e1b1a] font-bold shadow-sm'
                          : 'bg-[#191615] text-[#d6cebf] hover:bg-[#282321] border border-[#302a28]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isCurrent ? 'text-[#1e1b1a]' : 'text-[#dfcfb3]'}`} />
                        <span>{sec.label}</span>
                      </div>
                      {sec.badge && (
                        <span className={`text-[10px] font-mono ${isCurrent ? 'text-[#1e1b1a]' : 'text-amber-400'}`}>
                          {sec.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Profile & Shop footer in drawer */}
            <div className="pt-2 border-t border-[#302a28] flex items-center justify-between text-xs text-[#8c8279]">
              <span className="font-mono text-amber-400 font-semibold">
                {t('navBalance')}: {currentUser.coins} 🪙
              </span>
              <button
                onClick={() => handleSelectTab('profile')}
                className="text-[#dfcfb3] hover:underline font-medium"
              >
                {t('navOpenProfile')} →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
