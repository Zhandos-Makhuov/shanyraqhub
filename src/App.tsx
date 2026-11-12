import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { DashboardView } from './components/DashboardView';
import { EventsView } from './components/EventsView';
import { AchievementsView } from './components/AchievementsView';
import { ReadingLibraryView } from './components/ReadingLibraryView';
import { AttendanceView } from './components/AttendanceView';
import { LeaderboardView } from './components/LeaderboardView';
import { AvatarShopView } from './components/AvatarShopView';
import { ForumAndChatsView } from './components/ForumAndChatsView';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { MemberProfileModal } from './components/MemberProfileModal';

const MainContent: React.FC = () => {
  const { activeTab, t } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#191615] text-[#f5f2eb]">
      <Header />
      <NavigationTabs />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6">
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
      </main>

      <footer className="border-t border-[#302a28] bg-[#161312] py-8 px-4 lg:px-8 text-xs text-[#8c8279]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/IMG_9313_86e71ea6.PNG"
              alt="Shanyraq Hub"
              className="w-6 h-6 rounded-full object-cover ring-1 ring-[#dfcfb3]/40"
            />
            <span className="font-display font-semibold text-[#f5f2eb]">
              SHAŃYRAQ HUB · Клуб Тұлғалық Даму Және Кітап Мәдениеті
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Алматы · Астана</span>
            <span>·</span>
            <span>E2EE Security</span>
            <span>·</span>
            <span>© 2026 Shanyraq Hub Ecosystem</span>
          </div>
        </div>
      </footer>

      {/* Global Member Profile Inspection Modal */}
      <MemberProfileModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
