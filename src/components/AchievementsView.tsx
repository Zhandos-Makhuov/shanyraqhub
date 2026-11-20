import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';
import {
  Activity,
  Award,
  BookHeart,
  Handshake,
  Puzzle,
  BookMarked,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle,
  ClipboardCheck,
  Coins,
  Compass,
  Flame,
  Footprints,
  Heart,
  HeartHandshake,
  Hourglass,
  Landmark,
  Languages,
  Library,
  Medal,
  MessageSquarePlus,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Palette,
  PenLine,
  PenTool,
  Presentation,
  ShieldCheck,
  Star,
  Sparkles,
  Sunrise,
  ThumbsUp,
  Trophy,
} from 'lucide-react';

/** Icon names used in data/achievements.ts. Unknown names fall back to Award. */
export const ACHIEVEMENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity,
  BookHeart,
  Handshake,
  Puzzle,
  BookMarked,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Compass,
  Flame,
  Footprints,
  Heart,
  HeartHandshake,
  Hourglass,
  Landmark,
  Languages,
  Library,
  Medal,
  MessageSquarePlus,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Palette,
  PenLine,
  PenTool,
  Presentation,
  Star,
  Sunrise,
  ThumbsUp,
  Trophy,
};

export const AchievementsView: React.FC = () => {
  const { allUsers, currentUser, language, t, setSelectedUserModal, getAchievementProgress } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const getIcon = (iconName: string) => ACHIEVEMENT_ICONS[iconName] || Award;

  const categories = [
    { id: 'all', label: t('achCatAll') },
    { id: 'books', label: t('achCatBooks') },
    { id: 'community', label: t('achCatCommunity') },
    { id: 'english', label: 'English Club' },
    { id: 'sport', label: t('achCatSport') },
    { id: 'general', label: t('achCatGeneral') },
    { id: 'challenges', label: t('achCatChallenges') },
  ];

  const filteredAchievements = ALL_ACHIEVEMENTS.filter(ach => {
    if (selectedCategory !== 'all' && ach.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
          {t('achievementsTitle')}
        </h1>
        <p className="text-xs text-[#9e948c] mt-1">
          {t('achievementsSubtitle')}
        </p>
      </div>

      {/* Categories Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedCategory === cat.id
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'bg-[#23201e] text-[#9e948c] hover:text-[#f5f2eb] border border-[#352f2c]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Trophy Wall Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAchievements.map(ach => {
          const Icon = getIcon(ach.icon);

          // Find which members unlocked this achievement
          const unlockedMembers = allUsers.filter(u =>
            u.achievements.some(a => a.id === ach.id || a.titleRu === ach.titleRu)
          );

          const isUnlockedByMe = currentUser.achievements.some(
            a => a.id === ach.id || a.titleRu === ach.titleRu
          );

          return (
            <div
              key={ach.id}
              className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                isUnlockedByMe
                  ? 'bg-gradient-to-b from-[#2a2420] to-[#201d1c] border-[#dfcfb3]/40 shadow-lg'
                  : 'bg-[#23201e] border-[#352f2c]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                      isUnlockedByMe
                        ? 'bg-[#dfcfb3]/15 border-[#dfcfb3] text-[#dfcfb3] shadow-[0_0_15px_rgba(223,207,179,0.3)]'
                        : 'bg-[#1a1716] border-[#3b3430] text-[#736a62]'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1c1918] border border-[#302a28] text-[10px] text-[#f5d77f] font-mono font-semibold">
                      <Coins className="w-3 h-3 text-amber-400" />
                      +{ach.coinReward}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-[#dfcfb3] font-mono">
                      <Sparkles className="w-3 h-3" />
                      +{ach.xpReward} XP
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
                    {language === 'kz' ? ach.titleKz : language === 'en' ? ach.titleEn : ach.titleRu}
                  </h3>
                  <p className="text-xs text-[#a39b94] mt-1 leading-relaxed">
                    {language === 'kz' ? ach.descriptionKz : language === 'en' ? ach.descriptionEn : ach.descriptionRu}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#302a28] space-y-2">
                {/* Progress / Status */}
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#8c8279]">{t('achStatus')}:</span>
                  {isUnlockedByMe ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t('achUnlocked')}
                    </span>
                  ) : (
                    isManualAchievement(ach) ? (
                      <span className="text-[#8c8279] flex items-center gap-1" title={t('achByModeratorTitle')}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {t('achByModerator')}
                      </span>
                    ) : (
                      <span className="text-[#736a62] font-mono">
                        {t('achInProgress')} ({Math.min(getAchievementProgress(currentUser.id, ach.id), ach.requiredCount || 1)}/{ach.requiredCount || 1})
                      </span>
                    )
                  )}
                </div>

                {/* Who unlocked */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-[#8c8279]">{t('unlockedBy')}:</span>
                  <div className="flex items-center -space-x-1.5">
                    {unlockedMembers.length === 0 ? (
                      <span className="text-[#736a62] text-[10px]">{t('achNobodyYet')}</span>
                    ) : (
                      unlockedMembers.slice(0, 4).map(member => (
                        <img
                          key={member.id}
                          src={member.avatar}
                          alt={member.name}
                          title={member.name}
                          onClick={() => setSelectedUserModal(member)}
                          className="w-5 h-5 rounded-full object-cover ring-1 ring-[#1e1b1a] cursor-pointer hover:scale-110 transition-transform"
                        />
                      ))
                    )}
                    {unlockedMembers.length > 4 && (
                      <span className="text-[9px] text-[#8c8279] pl-2 font-mono">
                        +{unlockedMembers.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
