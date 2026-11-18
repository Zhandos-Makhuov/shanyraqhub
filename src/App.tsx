import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { NavigationTabs } from './components/NavigationTabs';
import { MobileNavigation } from './components/MobileNavigation';
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
  const { activeTab } = useApp();

  return (
    <div className="min-h-screen flex flex-col bg-[#191615] text-[#f5f2eb] overflow-x-hidden w-full max-w-full">
      <Header />
      <NavigationTabs />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-10">
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

      {/* Persistent Mobile Bottom Navigation */}
      <MobileNavigation />

      <footer className="border-t border-[#302a28] bg-[#161312] py-8 px-4 lg:px-8 text-xs text-[#8c8279] mb-14 md:mb-0">
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
              SHAŃYRAQ HUB · Клуб Тұлғалық Даму Және Кітап Мәдениеті
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px]">
            <span>Алматы · Астана</span>
            <span>·</span>
            <span>Закрытые комнаты</span>
            <span>·</span>
            <span className="font-mono text-amber-400/80">Demo Environment</span>
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
