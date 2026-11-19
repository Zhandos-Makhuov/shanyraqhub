import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TIERS } from '../data/gamification';
import { Bell, Globe, Sparkles, ChevronDown, Coins, Database } from 'lucide-react';
import { Language } from '../types';
import { DemoStatusModal } from './DemoStatusModal';
import { canSwitchTestAccounts, isDemoData } from '../config/runtime';

export const Header: React.FC = () => {
  const {
    language,
    setLanguage,
    t,
    currentUser,
    allUsers,
    switchCurrentUser,
    notifications,
    markAllNotificationsAsRead,
    togglePushNotifications,
    setActiveTab,
  } = useApp();

  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const myNotifs = notifications.filter(n => n.userId === currentUser.id);
  const unreadNotifs = myNotifs.filter(n => !n.read);
  const userTier = TIERS[currentUser.tier] || TIERS.bronze;

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ru', label: 'Русский', flag: 'RU' },
    { code: 'kz', label: 'Қазақша', flag: 'KZ' },
    { code: 'en', label: 'English', flag: 'EN' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#1e1b1a]/95 backdrop-blur-md border-b border-[#352f2c] px-3 sm:px-6 lg:px-8 py-2.5 transition-colors">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Zone - Fully visible uncropped logo */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group min-w-0"
          >
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#262220] ring-1 ring-[#dfcfb3]/40 p-1 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <img
                src="/assets/aistudio/IMG_9313_86e71ea6.PNG"
                alt="Shanyraq Hub Logo"
                className="w-full h-full object-contain rounded-full"
              />
            </div>
            <div className="flex flex-col min-w-0 max-[374px]:hidden">
              <span className="font-display text-sm sm:text-base md:text-lg font-bold tracking-wider text-[#f5f2eb] group-hover:text-[#dfcfb3] transition-colors truncate">
                SHAŃYRAQ HUB
              </span>
              <span className="text-[10px] text-[#9e948c] tracking-tight hidden lg:inline truncate">
                {t('brandTagline')}
              </span>
            </div>
          </div>

          {/* Right Action Zone */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Demo Status Badge (demo data only) */}
            {isDemoData && (
              <button
                onClick={() => setShowDemoModal(true)}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/60 text-[10px] font-mono text-amber-300 transition-colors"
                title="Статус данных: Режим демонстрации (нажмите для подробностей)"
              >
                <Database className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Демо</span>
              </button>
            )}

            {/* Language Switcher */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowLangDropdown(!showLangDropdown);
                  setShowNotifDropdown(false);
                  setShowUserDropdown(false);
                }}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3f3834] text-xs font-medium text-[#dfcfb3] transition-colors"
                title="Сменить язык"
              >
                <Globe className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                <span className="font-mono uppercase text-[11px] sm:text-xs">{language}</span>
                <ChevronDown className="hidden sm:block w-2.5 h-2.5 text-[#9e948c]" />
              </button>

              {showLangDropdown && (
                <div className="absolute right-0 mt-2 w-36 bg-[#25211f] border border-[#3f3834] rounded-xl shadow-xl py-1 z-50 overflow-hidden">
                  {languages.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLanguage(lang.code);
                        setShowLangDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
                        language === lang.code
                          ? 'bg-[#dfcfb3]/15 text-[#dfcfb3] font-semibold'
                          : 'text-[#d6cebf] hover:bg-[#2d2825]'
                      }`}
                    >
                      <span>{lang.label}</span>
                      <span className="font-mono text-[10px] text-[#9e948c]">{lang.flag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Shanyraq Coins Pill */}
            <button
              onClick={() => setActiveTab('shop')}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3f3834] text-xs font-semibold text-[#f5d77f] transition-all"
              title="Магазин артефактов и баланс коинов"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-mono-numbers text-[11px] sm:text-xs">{currentUser.coins}</span>
              <span className="hidden md:inline text-[10px] text-[#9e948c] font-normal">🪙</span>
            </button>

            {/* Tier Emblem Pill (Desktop) */}
            <button
              onClick={() => setActiveTab('profile')}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#272321] border border-[#3f3834] text-xs"
              title={userTier.nameRu}
            >
              <Sparkles className="w-3 h-3 text-[#dfcfb3]" />
              <span className={`text-[11px] font-medium ${userTier.textColor}`}>
                {language === 'kz' ? userTier.nameKz : language === 'en' ? userTier.nameEn : userTier.nameRu}
              </span>
            </button>

            {/* Notifications Center */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifDropdown(!showNotifDropdown);
                  setShowUserDropdown(false);
                  setShowLangDropdown(false);
                }}
                className="relative p-1.5 sm:p-2 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3f3834] text-[#d6cebf] transition-colors"
                title="Уведомления"
              >
                <Bell className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#dfcfb3]" />
                {unreadNotifs.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-amber-600 text-white text-[9px] sm:text-[10px] font-bold flex items-center justify-center">
                    {unreadNotifs.length}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="absolute right-0 mt-2 w-72 sm:w-96 bg-[#25211f] border border-[#3f3834] rounded-xl shadow-2xl p-3 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-[#38322e]">
                    <span className="text-xs font-semibold text-[#f5f2eb]">Уведомления клуба</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePushNotifications()}
                        className="text-[10px] text-[#dfcfb3] hover:underline"
                      >
                        {currentUser.pushNotificationsEnabled ? 'Push вкл' : 'Включить Push'}
                      </button>
                      {unreadNotifs.length > 0 && (
                        <button
                          onClick={markAllNotificationsAsRead}
                          className="text-[10px] text-[#9e948c] hover:text-[#f5f2eb]"
                        >
                          {t('actionMarkRead')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-[#322c29] mt-2">
                    {myNotifs.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#9e948c]">
                        Нет новых уведомлений
                      </div>
                    ) : (
                      myNotifs.slice(0, 8).map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => {
                            if (notif.linkTab && notif.linkTab !== 'members') {
                              setActiveTab(notif.linkTab as any);
                            }
                            setShowNotifDropdown(false);
                          }}
                          className={`py-2 px-1 text-xs cursor-pointer hover:bg-[#2d2825] rounded transition-colors ${
                            !notif.read ? 'bg-[#dfcfb3]/5 font-medium' : 'text-[#a39b94]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[#f5f2eb] font-semibold text-[11px] truncate">
                              {notif.title}
                            </span>
                            <span className="text-[9px] text-[#857b73] whitespace-nowrap">
                              {notif.timestamp}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#c7beaf] mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile / Switch Persona Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserDropdown(!showUserDropdown);
                  setShowNotifDropdown(false);
                  setShowLangDropdown(false);
                }}
                className="flex items-center gap-1.5 pl-1 pr-1.5 sm:pr-2 py-1 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3f3834] transition-colors"
              >
                <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden ring-1 ring-[#dfcfb3]/50 shrink-0">
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-medium text-[#f5f2eb] max-w-[80px] truncate hidden md:inline">
                  {currentUser.name}
                </span>
                <ChevronDown className="hidden sm:block w-2.5 h-2.5 text-[#9e948c]" />
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-[#25211f] border border-[#3f3834] rounded-xl shadow-2xl p-3 z-50">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-[#38322e]">
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-[#dfcfb3]"
                    />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-bold text-[#f5f2eb] truncate">
                        {currentUser.name}
                      </span>
                      <span className="text-[10px] text-[#dfcfb3]">
                        {currentUser.role.toUpperCase()} · {userTier.nameRu}
                      </span>
                      <span className="text-[10px] text-[#9e948c] font-mono">
                        {currentUser.xp} XP · {currentUser.coins} 🪙
                      </span>
                    </div>
                  </div>

                  {canSwitchTestAccounts && (
                  <div className="pt-2">
                    <div className="text-[10px] font-semibold text-[#8c8279] uppercase tracking-wider mb-1 px-1">
                      {t('actionSwitchUser')}
                    </div>
                    <div className="space-y-1">
                      {allUsers.map(user => (
                        <button
                          key={user.id}
                          onClick={() => {
                            switchCurrentUser(user.id);
                            setShowUserDropdown(false);
                          }}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            user.id === currentUser.id
                              ? 'bg-[#dfcfb3]/15 text-[#dfcfb3] font-medium'
                              : 'text-[#d6cebf] hover:bg-[#2d2825]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <img
                              src={user.avatar}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover"
                            />
                            <span className="truncate">{user.name}</span>
                          </div>
                          <span className="text-[10px] text-[#9e948c] font-mono">
                            {user.role === 'super_admin' ? 'SuperAdmin' : user.role === 'admin' ? 'Admin' : user.role === 'moderator' ? 'Mod' : user.role === 'organizer' ? 'Org' : 'Member'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  )}

                  <div className={`flex items-center justify-between ${canSwitchTestAccounts ? 'mt-3 pt-2 border-t border-[#38322e]' : 'pt-2'}`}>
                    <button
                      onClick={() => {
                        setActiveTab('profile');
                        setShowUserDropdown(false);
                      }}
                      className="text-xs text-[#dfcfb3] hover:underline font-medium"
                    >
                      {t('myProfile')}
                    </button>
                    <button
                      onClick={() => {
                        setShowDemoModal(true);
                        setShowUserDropdown(false);
                      }}
                      className="text-[10px] text-amber-400 hover:underline font-mono"
                    >
                      Статус данных
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Demo Status & Environment Modal */}
      <DemoStatusModal
        isOpen={showDemoModal}
        onClose={() => setShowDemoModal(false)}
      />
    </>
  );
};
