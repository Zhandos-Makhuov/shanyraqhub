import React from 'react';
import { useApp } from '../context/AppContext';
import { TIERS } from '../data/gamification';
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import { getEventStart, hasEventStarted } from '../utils/eventTime';
import { computeCommunityStats } from '../utils/communityStats';
import {
  Calendar,
  BookOpen,
  Sparkles,
  ArrowRight,
  MapPin,
  Clock,
  CheckCircle2,
  Users,
  Coins,
  Award,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const {
    currentUser,
    events,
    registerForEvent,
    cancelEventRegistration,
    setActiveTab,
    allReadBooks,
    allUsers,
    language,
    t,
  } = useApp();

  const currentTier = TIERS[currentUser.tier] || TIERS.bronze;

  // Next tier progress
  const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'titanium', 'tengri'] as const;
  const currentIndex = tierOrder.indexOf(currentUser.tier);
  const nextTierKey = currentIndex < tierOrder.length - 1 ? tierOrder[currentIndex + 1] : null;
  const nextTier = nextTierKey ? TIERS[nextTierKey] : null;

  const xpProgress = nextTier
    ? Math.min(
        100,
        Math.round(((currentUser.xp - currentTier.minXp) / (nextTier.minXp - currentTier.minXp)) * 100)
      )
    : 100;

  const upcomingEvents = events
    .filter(e => !hasEventStarted(e))
    .sort((a, b) => getEventStart(a).getTime() - getEventStart(b).getTime())
    .slice(0, 3);
  // Real numbers only (see utils/communityStats.ts).
  const stats = computeCommunityStats(allUsers, events);

  return (
    <div className="space-y-6 sm:space-y-8 pb-12 w-full max-w-full">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-2xl bg-gradient-to-br from-[#26211f] via-[#201d1c] to-[#181514] border border-[#3d3632] p-4 sm:p-6 lg:p-8 overflow-hidden shadow-xl">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none hidden sm:flex items-center justify-center">
          <img
            src="/assets/aistudio/IMG_9313_86e71ea6.PNG"
            alt=""
            className="w-80 h-80 object-contain"
          />
        </div>

        <div className="relative z-10 max-w-2xl space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] sm:text-xs uppercase tracking-widest text-[#dfcfb3] font-semibold">
              Shanyraq Community Hub
            </span>
            <span className="text-[#655d56]">·</span>
            <span className={`text-[11px] sm:text-xs font-medium ${currentTier.textColor}`}>
              {language === 'kz' ? currentTier.nameKz : language === 'en' ? currentTier.nameEn : currentTier.nameRu}
            </span>
          </div>

          <h1 className="font-display text-xl sm:text-3xl lg:text-4xl font-bold text-[#f5f2eb] leading-tight">
            {language === 'kz' ? 'Қош келдіңіз' : language === 'en' ? 'Welcome back' : 'Добро пожаловать'}, {currentUser.name}
          </h1>

          <p className="text-xs sm:text-sm text-[#b0a79d] leading-relaxed">
            {language === 'kz'
              ? 'Тұлғалық өсу, мазмұнды әдебиет және шынайы орта. Клубтық іс-шараларға қатысып, монеталар мен жаңа дәрежелерді бағындырыңыз.'
              : language === 'en'
              ? 'Your sanctuary for intellectual growth, book culture, and authentic friendships. Participate in events, earn Shanyraq coins, and ascend the tiers.'
              : 'Пространство интеллектуального роста, культуры чтения и живого общения. Участвуйте во встречах, зарабатывайте коины и открывайте редкие клубные артефакты.'}
          </p>

          {/* Gamification Progress Bar */}
          <div className="pt-1 sm:pt-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-[#dfcfb3] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-mono-numbers">{currentUser.xp} XP</span>
              </span>
              <span className="text-[#9e948c] text-[11px] sm:text-xs truncate max-w-[200px] sm:max-w-none text-right">
                {nextTier ? (
                  <>
                    {t('nextLevelAt')}: <span className="text-[#f5f2eb] font-mono-numbers">{nextTier.minXp} XP</span> ({language === 'kz' ? nextTier.nameKz : language === 'en' ? nextTier.nameEn : nextTier.nameRu})
                  </>
                ) : (
                  'Максимальный ранг достигнут 👑'
                )}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#161413] border border-[#3b3430] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#bfa882] to-[#dfcfb3] rounded-full transition-all duration-500"
                style={{ width: `${xpProgress}%` }}
              />
            </div>
          </div>

          {/* Quick Action Badges */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
            <button
              onClick={() => setActiveTab('events')}
              className="px-3 sm:px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{t('tabEvents')}</span>
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className="px-3 sm:px-4 py-2 rounded-lg bg-[#2c2725] hover:bg-[#38312e] border border-[#433c37] text-xs font-medium text-[#f5f2eb] transition-all flex items-center gap-1.5 active:scale-95"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#dfcfb3]" />
              <span>{t('tabLibrary')}</span>
            </button>
            <button
              onClick={() => setActiveTab('shop')}
              className="px-3 sm:px-4 py-2 rounded-lg bg-[#2c2725] hover:bg-[#38312e] border border-[#433c37] text-xs font-medium text-[#f5d77f] transition-all flex items-center gap-1.5 active:scale-95"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('tabShop')} ({currentUser.coins} 🪙)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Community Key Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="p-3 sm:p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <div className="flex items-center justify-between text-[#8c8279] mb-1">
            <span className="text-[11px] sm:text-xs font-medium">Резидентов</span>
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#dfcfb3]" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {stats.members}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[#8c8279] truncate block">участников в клубе</span>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <div className="flex items-center justify-between text-[#8c8279] mb-1">
            <span className="text-[11px] sm:text-xs font-medium">Книг в базе</span>
            <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#dfcfb3]" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {stats.reviewedBooks}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[#8c8279] truncate block">с рецензиями</span>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <div className="flex items-center justify-between text-[#8c8279] mb-1">
            <span className="text-[11px] sm:text-xs font-medium">Визитов на встречи</span>
            <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#dfcfb3]" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {stats.verifiedVisits}
          </div>
          <span className="text-[10px] sm:text-[11px] text-[#8c8279] truncate block">подтвержденная явка</span>
        </div>

        <div className="p-3 sm:p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <div className="flex items-center justify-between text-[#8c8279] mb-1">
            <span className="text-[11px] sm:text-xs font-medium">Удовлетворенность</span>
            <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
          </div>
          <div className="text-lg sm:text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {stats.avgSatisfaction !== null ? stats.avgSatisfaction.toFixed(2) : '—'}{' '}
            <span className="text-[10px] sm:text-xs text-[#8c8279] font-normal">/ 5.0</span>
          </div>
          <span className="text-[10px] sm:text-[11px] text-[#8c8279] truncate block">
            {stats.feedbackCount > 0 ? `по ${stats.feedbackCount} отзывам о встречах` : 'отзывов о встречах пока нет'}
          </span>
        </div>
      </div>

      {/* Community Directions Showcase */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
              {language === 'kz' ? 'Клубтық бағыттар' : language === 'en' ? 'Club Chapters & Focus Areas' : 'Направления Shanyraq Hub'}
            </h2>
            <p className="text-xs text-[#9e948c]">
              Выберите активность для участия в событиях
            </p>
          </div>
          <button
            onClick={() => setActiveTab('events')}
            className="text-xs text-[#dfcfb3] hover:underline flex items-center gap-1 font-medium shrink-0"
          >
            <span>Встречи</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {COMMUNITY_DIRECTIONS.slice(0, 4).map(dir => (
            <div
              key={dir.id}
              onClick={() => setActiveTab('events')}
              className="p-4 rounded-xl bg-[#23201e] hover:bg-[#2b2725] border border-[#352f2c] hover:border-[#4d443f] cursor-pointer transition-all group flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-[#dfcfb3] group-hover:text-[#ecd9bf] transition-colors">
                  {language === 'kz' ? dir.nameKz : language === 'en' ? dir.nameEn : dir.nameRu}
                </span>
                <p className="text-[11px] text-[#9e948c] mt-2 line-clamp-3 leading-relaxed">
                  {language === 'kz' ? dir.descriptionKz : language === 'en' ? dir.descriptionEn : dir.descriptionRu}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#302a28] flex items-center justify-between text-[11px] text-[#8c8279]">
                <span>Расписание встреч</span>
                <ArrowRight className="w-3 h-3 text-[#dfcfb3] transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Upcoming Events Highlight */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
              {t('eventsUpcoming')}
            </h2>
            <p className="text-xs text-[#9e948c]">
              Ближайшие встречи и мастер-классы клуба
            </p>
          </div>
          <button
            onClick={() => setActiveTab('events')}
            className="text-xs text-[#dfcfb3] hover:underline flex items-center gap-1 font-medium shrink-0"
          >
            <span>{language === 'kz' ? 'Барлық шаралар' : language === 'en' ? 'View all events' : 'Все события'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {upcomingEvents.map(event => {
            const isRegistered = event.registeredUserIds.includes(currentUser.id);
            const seatsLeft = Math.max(0, event.maxCapacity - event.registeredUserIds.length);

            return (
              <div
                key={event.id}
                className="rounded-xl bg-[#23201e] border border-[#352f2c] overflow-hidden flex flex-col justify-between hover:border-[#4d443f] transition-all"
              >
                <div className="p-4 sm:p-5 space-y-2.5 sm:space-y-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#dfcfb3]">
                      {event.format === 'offline' ? '🏛 Офлайн' : '🌐 Онлайн эфир'}
                    </span>
                    <span className="font-mono text-[#9e948c]">
                      {seatsLeft > 0 ? `Осталось ${seatsLeft} мест` : 'Все места заняты'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#f5f2eb] leading-snug line-clamp-2">
                    {event.title}
                  </h3>

                  <p className="text-xs text-[#a39b94] line-clamp-2 leading-relaxed">
                    {event.description}
                  </p>

                  <div className="pt-2 space-y-1.5 text-xs text-[#8c8279] border-t border-[#302a28]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                      <span className="truncate">{event.date} в {event.time} ({event.durationMinutes} мин)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                      <span className="truncate">{event.locationAddress}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-4 bg-[#1e1b1a] border-t border-[#302a28] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={event.speaker.avatar}
                      alt={event.speaker.name}
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                    <span className="text-[11px] text-[#a39b94] truncate">
                      {event.speaker.name}
                    </span>
                  </div>

                  {isRegistered ? (
                    <button
                      onClick={() => cancelEventRegistration(event.id)}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] text-xs font-medium text-[#dfcfb3] transition-colors shrink-0"
                    >
                      {t('actionRegistered')} (отмена)
                    </button>
                  ) : (
                    <button
                      onClick={() => registerForEvent(event.id)}
                      disabled={seatsLeft === 0}
                      className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-xs font-semibold text-[#1e1b1a] transition-colors shrink-0"
                    >
                      {seatsLeft > 0 ? t('actionRegister') : t('eventFull')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
