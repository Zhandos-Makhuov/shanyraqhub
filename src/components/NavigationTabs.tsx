import React from 'react';
import { useApp, NavTab } from '../context/AppContext';
import {
  Calendar,
  Award,
  BookOpen,
  UserCheck,
  Trophy,
  MessageSquare,
  Sparkles,
  User,
  ShieldCheck,
  Compass,
} from 'lucide-react';

export const NavigationTabs: React.FC = () => {
  const { activeTab, setActiveTab, t, currentUser } = useApp();

  const isStaff = currentUser.role === 'super_admin' || currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role === 'organizer';

  const tabs: { id: NavTab; label: string; icon: React.FC<{ className?: string }>; badge?: string }[] = [
    { id: 'dashboard', label: t('tabDashboard'), icon: Compass },
    { id: 'events', label: t('tabEvents'), icon: Calendar },
    { id: 'achievements', label: t('tabAchievements'), icon: Award },
    { id: 'library', label: t('tabLibrary'), icon: BookOpen },
    { id: 'attendance', label: t('tabAttendance'), icon: UserCheck },
    { id: 'leaderboard', label: t('tabLeaderboard'), icon: Trophy },
    { id: 'forum', label: t('tabForum'), icon: MessageSquare },
    { id: 'shop', label: t('tabShop'), icon: Sparkles, badge: '🪙' },
    { id: 'profile', label: t('tabProfile'), icon: User },
    ...(isStaff ? [{ id: 'admin' as NavTab, label: t('tabAdmin'), icon: ShieldCheck }] : []),
  ];

  return (
    <nav className="bg-[#191615] border-b border-[#302a28] px-4 lg:px-8 overflow-x-auto scrollbar-none">
      <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 py-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
                isActive
                  ? 'bg-[#dfcfb3] text-[#1e1b1a] shadow-sm font-semibold'
                  : 'text-[#a39b94] hover:text-[#f5f2eb] hover:bg-[#25211f]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#1e1b1a]' : 'text-[#dfcfb3]'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[10px] ml-0.5">{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
