import React, { useMemo, useState } from 'react';
import { registeredCount } from '../utils/counts';
import { useApp } from '../context/AppContext';
import { TIERS } from '../data/gamification';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';
import { activeDirections, eventImage } from '../data/directions';
import {
  formatEventDay,
  getEventStart,
  hasEventEnded,
  hasEventStarted,
  isCheckInWindowOpen,
} from '../utils/eventTime';
import { computeCommunityStats } from '../utils/communityStats';
import { setEventsIntent } from '../utils/navIntent';
import { EventCard } from './EventCard';
import { MyQrModal } from './CheckInQr';
import { ACHIEVEMENT_ICONS } from './achievementIcons';
import { CommunityEvent } from '../types';
import {
  Calendar,
  ArrowRight,
  Coins,
  QrCode,
  MessageSquareText,
  CalendarCheck,
  Compass,
  Flame,
  UserCheck,
  Award,
} from 'lucide-react';

const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum', 'titanium', 'tengri'] as const;
const FEEDBACK_REMINDER_DAYS = 30;

type NextStep =
  | { kind: 'qr'; event: CommunityEvent }
  | { kind: 'feedback'; event: CommunityEvent }
  | { kind: 'registered'; event: CommunityEvent }
  | { kind: 'suggest'; event: CommunityEvent }
  | { kind: 'neutral' };

/**
 * Member home: 1) who I am and how far I am, 2) the one thing worth doing now,
 * 3) what is coming up, 4) my progress, 5) club directions, 6) the club in numbers.
 * Everything is derived from data the app already has; nothing is invented.
 */
export const DashboardView: React.FC = () => {
  const {
    currentUser,
    events,
    registerForEvent,
    setActiveTab,
    allUsers,
    issueCheckInCode,
    getAchievementProgress,
    getWeekStreak,
    language,
    t,
    ln,
    lf,
  } = useApp();
  const [qrEvent, setQrEvent] = useState<CommunityEvent | null>(null);

  // --- Level -----------------------------------------------------------------
  const currentTier = TIERS[currentUser.tier] || TIERS.bronze;
  const tierIndex = TIER_ORDER.indexOf(currentUser.tier);
  const nextTierKey = tierIndex >= 0 && tierIndex < TIER_ORDER.length - 1 ? TIER_ORDER[tierIndex + 1] : null;
  const nextTier = nextTierKey ? TIERS[nextTierKey] : null;
  const xpProgress = nextTier
    ? Math.max(0, Math.min(100, Math.round(((currentUser.xp - currentTier.minXp) / (nextTier.minXp - currentTier.minXp)) * 100)))
    : 100;

  // --- Events ----------------------------------------------------------------
  const me = currentUser.id;
  const upcoming = useMemo(
    // Cancelled events are not offered on the home page (the events page shows them with a mark).
    () => events.filter(e => !hasEventStarted(e) && e.status !== 'cancelled').sort((a, b) => getEventStart(a).getTime() - getEventStart(b).getTime()),
    [events],
  );

  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState('');
  const nextStep: NextStep = useMemo(() => {
    const now = Date.now();
    const qr = issueCheckInCode
      ? events.find(e => e.registeredUserIds.includes(me) && !e.attendedUserIds.includes(me) && isCheckInWindowOpen(e))
      : undefined;
    if (qr) return { kind: 'qr', event: qr };

    const feedback = events
      .filter(e => e.attendedUserIds.includes(me) && hasEventEnded(e))
      // Same "already given" rule as submitEventFeedback.
      .filter(e => !e.feedbacks.some(f => f.userId === me) && !currentUser.attendedEvents.some(a => a.eventId === e.id && a.feedbackGiven))
      .filter(e => now - getEventStart(e).getTime() < FEEDBACK_REMINDER_DAYS * 86_400_000)
      .sort((a, b) => getEventStart(b).getTime() - getEventStart(a).getTime())[0];
    if (feedback) return { kind: 'feedback', event: feedback };

    const registered = upcoming.find(e => e.registeredUserIds.includes(me));
    if (registered) return { kind: 'registered', event: registered };

    const open = upcoming.filter(e => !e.registeredUserIds.includes(me) && registeredCount(e) < e.maxCapacity);
    const suggestion = open.find(e => currentUser.directions?.includes(e.direction)) ?? open[0];
    if (suggestion) return { kind: 'suggest', event: suggestion };

    return { kind: 'neutral' };
  }, [events, upcoming, me, issueCheckInCode, currentUser.directions, currentUser.attendedEvents]);

  const featuredId = nextStep.kind === 'neutral' ? null : nextStep.event.id;
  const upcomingCards = upcoming.filter(e => e.id !== featuredId).slice(0, 3);

  const openEvents = (intent: Parameters<typeof setEventsIntent>[0] = {}) => {
    setEventsIntent(intent);
    setActiveTab('events');
    window.scrollTo({ top: 0 });
  };

  // --- Progress ----------------------------------------------------------------
  const visits = events.filter(e => e.attendedUserIds.includes(me)).length;
  const weekStreak = getWeekStreak(me);
  // Recomputed each render: progress depends on books, forum and reviews too (34 cheap checks).
  const nextAchievement = (() => {
    const unlocked = new Set(currentUser.achievements.map(a => a.id));
    let best: { ach: (typeof ALL_ACHIEVEMENTS)[number]; value: number; target: number } | null = null;
    for (const ach of ALL_ACHIEVEMENTS) {
      const target = ach.rule?.threshold ?? 0;
      if (unlocked.has(ach.id) || isManualAchievement(ach) || target <= 0) continue;
      const value = Math.min(getAchievementProgress(me, ach.id), target);
      if (
        !best ||
        value / target > best.value / best.target ||
        (value / target === best.value / best.target && target < best.target)
      ) {
        best = { ach, value, target };
      }
    }
    return best;
  })();

  const stats = computeCommunityStats(allUsers, events);

  const stepTitle = (key: string, ev?: CommunityEvent) => t(key).replace('{title}', ev?.title ?? '');
  const eventWhen = (ev: CommunityEvent) => `${formatEventDay(ev, t)} · ${ev.time} · ${ev.locationAddress}`;

  const NextAchievementIcon = nextAchievement ? ACHIEVEMENT_ICONS[nextAchievement.ach.icon] || Award : Award;

  return (
    <div className="space-y-6 sm:space-y-8 pb-12 w-full max-w-full">
      {/* 1. Welcome: name, level, XP towards the next level, coins */}
      <section className="relative rounded-2xl bg-gradient-to-br from-[#26211f] to-[#1d1a19] border border-[#3d3632] p-4 sm:p-6 overflow-hidden">
        <div className="relative flex items-start gap-3 sm:gap-4">
          <img
            src={currentUser.avatar}
            alt=""
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover ring-2 ring-[#dfcfb3]/60 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-[#f5f2eb] leading-tight break-words">
              {t('homeWelcome').replace('{name}', currentUser.name)}
            </h1>
            <p className="mt-0.5 text-[13px] text-[#9e948c]">{t('homeSubtitle')}</p>
          </div>
          <button
            onClick={() => setActiveTab('shop')}
            className="hidden sm:inline-flex items-center gap-1.5 min-h-10 px-3 rounded-xl bg-[#272321] border border-[#3f3834] hover:bg-[#322c29] text-sm font-semibold text-[#f5d77f] transition-colors shrink-0"
            title={t('tabShop')}
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-mono-numbers">{currentUser.coins}</span>
          </button>
        </div>

        <div className="relative mt-4">
          <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
            <span className={`font-semibold ${currentTier.textColor}`}>{ln(currentTier)}</span>
            <span className="font-mono-numbers text-[#dfcfb3]">{currentUser.xp} XP</span>
          </div>
          <div
            className="w-full h-2 rounded-full bg-[#141211] border border-[#3b3430] overflow-hidden"
            role="progressbar"
            aria-label={t('prfProgressAria')}
            aria-valuenow={xpProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-[#dfcfb3] rounded-full transition-[width] duration-500" style={{ width: `${xpProgress}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-[#9e948c]">
            <span>
              {nextTier
                ? t('homeXpToNext').replace('{n}', String(Math.max(0, nextTier.minXp - currentUser.xp))).replace('{tier}', ln(nextTier))
                : t('dashMaxTier')}
            </span>
            <button onClick={() => setActiveTab('shop')} className="sm:hidden inline-flex items-center gap-1 font-mono-numbers font-semibold text-[#f5d77f]">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              {currentUser.coins}
            </button>
          </div>
        </div>
      </section>

      {/* 2. Next step + 3. Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden flex flex-col sm:flex-row">
          {nextStep.kind !== 'neutral' && (
            <button
              onClick={() => openEvents({ openEventId: nextStep.event.id })}
              className="sm:w-56 shrink-0"
              aria-label={t('evDetails')}
            >
              <img src={eventImage(nextStep.event)} alt="" className="w-full h-24 sm:h-full object-cover" />
            </button>
          )}
          <div className="flex-1 min-w-0 p-4 sm:p-5 flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#c8b393] flex items-center gap-1.5">
              {nextStep.kind === 'qr' ? <QrCode className="w-3.5 h-3.5" />
                : nextStep.kind === 'feedback' ? <MessageSquareText className="w-3.5 h-3.5" />
                : nextStep.kind === 'registered' ? <CalendarCheck className="w-3.5 h-3.5" />
                : <Compass className="w-3.5 h-3.5" />}
              {t('homeNextStep')}
            </span>

            {nextStep.kind === 'neutral' ? (
              <div>
                <h2 className="font-display text-lg font-bold text-[#f5f2eb] leading-snug">{t('nsNeutralTitle')}</h2>
                <p className="mt-1 text-[13px] text-[#a39b94]">{t('nsNeutralText')}</p>
              </div>
            ) : (
              <div className="min-w-0">
                {(nextStep.kind === 'registered' || nextStep.kind === 'suggest') && (
                  <span className="block mb-0.5 text-[13px] font-medium text-[#dfcfb3]">
                    {t(nextStep.kind === 'registered' ? 'nsRegisteredLabel' : 'nsSuggestLabel')}
                  </span>
                )}
                {/* Status on its own line, so the event title is not cut short on narrow screens. */}
                <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb] leading-snug line-clamp-3 break-words">
                  {nextStep.kind === 'qr' ? stepTitle('nsQrTitle', nextStep.event)
                    : nextStep.kind === 'feedback' ? stepTitle('nsFeedbackTitle', nextStep.event)
                    : nextStep.event.title}
                </h2>
                <p className="mt-1 text-[13px] text-[#a39b94] line-clamp-2">
                  {nextStep.kind === 'qr' ? t('nsQrText')
                    : nextStep.kind === 'feedback' ? t('nsFeedbackText')
                    : eventWhen(nextStep.event)}
                </p>
              </div>
            )}

            <div className="mt-auto flex flex-wrap items-center gap-2">
              {nextStep.kind === 'qr' && (
                <button onClick={() => setQrEvent(nextStep.event)} className="btn-primary">
                  <QrCode className="w-4 h-4" />
                  {t('qrMyCodeButton')}
                </button>
              )}
              {nextStep.kind === 'feedback' && (
                <button onClick={() => openEvents({ feedbackEventId: nextStep.event.id })} className="btn-primary">
                  {t('actionLeaveFeedback')}
                </button>
              )}
              {nextStep.kind === 'suggest' && (
                <button
                  onClick={async () => {
                    if (regBusy) return;
                    setRegBusy(true); setRegError('');
                    const r = await registerForEvent(nextStep.event.id);
                    setRegBusy(false);
                    if (!r.ok) setRegError(t(r.error || 'authErrorGeneric'));
                  }}
                  disabled={regBusy}
                  aria-busy={regBusy}
                  className="btn-primary disabled:opacity-60"
                >
                  {regBusy ? t('evWorking') : t('actionRegister')}
                </button>
              )}
              {regError && <p role="alert" className="basis-full text-[12px] text-red-300" data-event-error>{regError}</p>}
              {nextStep.kind === 'neutral' ? (
                <button onClick={() => openEvents()} className="btn-primary">
                  <Calendar className="w-4 h-4" />
                  {t('homeAllEvents')}
                </button>
              ) : (
                <button onClick={() => openEvents({ openEventId: nextStep.event.id })} className={nextStep.kind === 'registered' ? 'btn-primary' : 'btn-ghost'}>
                  {t('evDetails')}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-[#23201e] border border-[#352f2c] p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#c8b393]">{t('homeProgress')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab('attendance')}
              className="text-left p-3 rounded-xl bg-[#1c1918] border border-[#302a28] hover:border-[#4d443f] transition-colors"
            >
              <UserCheck className="w-4 h-4 text-[#c8b393]" />
              <div className="mt-1.5 text-xl font-bold font-mono-numbers text-[#f5f2eb]">{visits}</div>
              <div className="text-[11px] text-[#9e948c] leading-tight">{t('homeVisits')}</div>
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className="text-left p-3 rounded-xl bg-[#1c1918] border border-[#302a28] hover:border-[#4d443f] transition-colors"
            >
              <Flame className={`w-4 h-4 ${weekStreak > 0 ? 'text-amber-400' : 'text-[#9e948c]'}`} />
              <div className="mt-1.5 text-xl font-bold font-mono-numbers text-[#f5f2eb]">{weekStreak}</div>
              <div className="text-[11px] text-[#9e948c] leading-tight">{t('homeWeekStreak')}</div>
            </button>
          </div>
          <button
            onClick={() => setActiveTab('achievements')}
            className="text-left p-3 rounded-xl bg-[#1c1918] border border-[#302a28] hover:border-[#4d443f] transition-colors"
          >
            <span className="block text-[11px] text-[#9e948c]">{t('homeNextAchievement')}</span>
            {nextAchievement ? (
              <>
                <span className="mt-1 flex items-center gap-2 min-w-0">
                  <NextAchievementIcon className="w-4 h-4 text-[#dfcfb3] shrink-0" />
                  <span className="text-sm font-semibold text-[#f5f2eb] truncate">{lf(nextAchievement.ach, 'title')}</span>
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-[#141211] overflow-hidden">
                    <span
                      className="block h-full bg-[#c8b393] rounded-full"
                      style={{ width: `${Math.round((nextAchievement.value / nextAchievement.target) * 100)}%` }}
                    />
                  </span>
                  <span className="text-[11px] font-mono-numbers text-[#9e948c]">
                    {nextAchievement.value}/{nextAchievement.target}
                  </span>
                </span>
              </>
            ) : (
              <span className="mt-1 block text-sm text-[#d6cebf]">{t('homeAllAchievementsDone')}</span>
            )}
          </button>
        </section>
      </div>

      {/* 4. Upcoming events (the one in "next step" is not repeated) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb] min-w-0">{t('eventsUpcoming')}</h2>
          <button onClick={() => openEvents()} className="inline-flex items-center gap-1 min-h-9 text-[13px] font-medium text-[#dfcfb3] hover:text-[#ecd9bf] shrink-0">
            <span className="sm:hidden">{t('homeAllShort')}</span>
            <span className="hidden sm:inline">{t('homeAllEvents')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {upcomingCards.length === 0 ? (
          <p className="p-5 rounded-2xl bg-[#23201e] border border-[#352f2c] text-[13px] text-[#9e948c] text-center">
            {upcoming.length === 0 ? t('homeNoUpcoming') : t('nsNeutralText')}
          </p>
        ) : (
          <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scrollbar-none">
            {upcomingCards.map(event => (
              <EventCard
                key={event.id}
                event={event}
                variant="compact"
                onOpen={ev => openEvents({ openEventId: ev.id })}
                className="w-[82%] max-w-[320px] sm:w-auto sm:max-w-none shrink-0 snap-start"
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. Club directions: light tiles, each opens events filtered by it */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#f5f2eb]">{t('homeDirections')}</h2>
          <p className="text-[13px] text-[#9e948c]">{t('dashDirectionsSub')}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {activeDirections().map(dir => (
            <button
              key={dir.id}
              onClick={() => openEvents({ direction: dir.id })}
              className="group text-left flex items-center gap-3 p-2.5 sm:p-3 rounded-xl bg-[#23201e] border border-[#352f2c] hover:border-[#4d443f] hover:bg-[#282422] transition-colors min-w-0"
            >
              <img
                src={eventImage({ direction: dir.id })}
                alt=""
                loading="lazy"
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover shrink-0"
              />
              <span className="min-w-0">
                <span className="text-[13px] font-semibold text-[#f5f2eb] group-hover:text-[#ecd9bf] leading-tight line-clamp-2">
                  {language === 'kz' ? dir.shortNameKz : language === 'en' ? dir.shortNameEn : dir.shortNameRu}
                </span>
                <span className="hidden sm:block mt-0.5">
                  <span className="text-[11px] text-[#9e948c] line-clamp-2">{lf(dir, 'description')}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 6. The club in numbers (real data only, see utils/communityStats.ts) */}
      <section className="rounded-2xl border border-[#302a28] p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c] mb-3">{t('homeClubNow')}</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          {[
            { label: t('dashMembers'), value: String(stats.members) },
            { label: t('dashBooks'), value: String(stats.reviewedBooks) },
            { label: t('dashVisits'), value: String(stats.verifiedVisits) },
            {
              label: t('dashSatisfaction'),
              value: stats.avgSatisfaction !== null ? `${stats.avgSatisfaction.toFixed(1)} / 5` : '—',
            },
          ].map(s => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[11px] text-[#9e948c] truncate">{s.label}</dt>
              <dd className="text-base font-semibold font-mono-numbers text-[#d6cebf]">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {qrEvent && <MyQrModal event={qrEvent} onClose={() => setQrEvent(null)} />}
    </div>
  );
};
