import React from 'react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS, eventImage } from '../data/directions';
import { exportEventToIcs } from '../utils/calendar';
import { formatEventDay, getEventStatus, isCheckInWindowOpen, EventStatus } from '../utils/eventTime';
import { CommunityEvent } from '../types';
import { Clock, MapPin, Users, Download, QrCode, Globe } from 'lucide-react';

/**
 * One event card for the home page and the events page.
 * Order of importance: picture → title → direction → short description → when/where → seats → status → action.
 * Registration goes through the same context functions as before (no new rules here).
 */
export const EventCard: React.FC<{
  event: CommunityEvent;
  /** compact: home page (no description footer extras). */
  variant?: 'full' | 'compact';
  onOpen: (event: CommunityEvent) => void;
  onQr?: (event: CommunityEvent) => void;
  onFeedback?: (event: CommunityEvent) => void;
  className?: string;
}> = ({ event, variant = 'full', onOpen, onQr, onFeedback, className = '' }) => {
  const { currentUser, registerForEvent, cancelEventRegistration, issueCheckInCode, language, t } = useApp();

  const status: EventStatus = getEventStatus(event, currentUser.id);
  const registered = event.registeredUserIds.length;
  const seatsLeft = Math.max(0, event.maxCapacity - registered);
  const direction = COMMUNITY_DIRECTIONS.find(d => d.id === event.direction);
  const directionName = direction
    ? language === 'kz' ? direction.shortNameKz : language === 'en' ? direction.shortNameEn : direction.shortNameRu
    : '';
  const isPast = status === 'ended' || status === 'attended';
  const canShowQr = !!onQr && !!issueCheckInCode && event.registeredUserIds.includes(currentUser.id)
    && status !== 'attended' && isCheckInWindowOpen(event);
  // Same "already given" rule as submitEventFeedback.
  const feedbackGiven = event.feedbacks.some(f => f.userId === currentUser.id)
    || currentUser.attendedEvents.some(a => a.eventId === event.id && a.feedbackGiven);
  const canGiveFeedback = !!onFeedback && status === 'attended' && !feedbackGiven;

  const statusBadge: Partial<Record<EventStatus, { label: string; cls: string }>> = {
    registered: { label: t('evStatusRegistered'), cls: 'bg-[#dfcfb3] text-[#1e1b1a]' },
    attended: { label: t('evStatusAttended'), cls: 'bg-emerald-900/80 text-emerald-200' },
    inProgress: { label: t('evStatusInProgress'), cls: 'bg-amber-900/80 text-amber-200' },
    full: { label: t('eventFull'), cls: 'bg-black/70 text-[#d6cebf]' },
    ended: { label: t('evStatusEnded'), cls: 'bg-black/70 text-[#b0a79d]' },
  };
  const badge = statusBadge[status];

  // Primary action: one clear button; secondary actions are small and quiet.
  let primary: React.ReactNode;
  if (canShowQr) {
    primary = (
      <button onClick={() => onQr!(event)} className="btn-primary">
        <QrCode className="w-4 h-4" />
        <span>{t('qrMyCodeButton')}</span>
      </button>
    );
  } else if (canGiveFeedback) {
    primary = (
      <button onClick={() => onFeedback!(event)} className="btn-primary">
        {t('actionLeaveFeedback')}
      </button>
    );
  } else if (status === 'registered') {
    primary = (
      <button onClick={() => cancelEventRegistration(event.id)} className="btn-secondary">
        {t('evCancelRegistration')}
      </button>
    );
  } else if (status === 'open') {
    primary = (
      <button onClick={() => registerForEvent(event.id)} className="btn-primary">
        {t('actionRegister')}
      </button>
    );
  } else {
    primary = (
      <button onClick={() => onOpen(event)} className="btn-ghost">
        {t('evDetails')}
      </button>
    );
  }

  return (
    <article
      className={`group rounded-2xl bg-[#23201e] border border-[#352f2c] hover:border-[#4d443f] overflow-hidden flex flex-col transition-colors ${isPast ? 'opacity-90' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onOpen(event)}
        className="relative block w-full text-left focus-visible:outline-none"
        aria-label={`${t('evDetails')}: ${event.title}`}
      >
        <img
          src={eventImage(event)}
          alt=""
          loading="lazy"
          className={`w-full object-cover ${variant === 'compact' ? 'h-28 sm:h-32' : 'h-32 sm:h-36'} ${isPast ? 'grayscale-[35%]' : ''}`}
        />
        {badge && (
          <span className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-sm ${badge.cls}`}>
            {badge.label}
          </span>
        )}
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[11px] font-medium text-[#e6dfd3]">
          {event.format === 'online' && <Globe className="w-3 h-3" />}
          {event.format === 'offline' ? t('evOffline') : t('evOnline')}
        </span>
      </button>

      <div className="flex-1 flex flex-col p-4 gap-2.5">
        <div className="min-w-0">
          {directionName && (
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#c8b393] truncate">
              {directionName}
            </span>
          )}
          <h3
            onClick={() => onOpen(event)}
            className="mt-0.5 font-display text-base font-bold leading-snug text-[#f5f2eb] group-hover:text-[#ecd9bf] cursor-pointer transition-colors line-clamp-2"
          >
            {event.title}
          </h3>
        </div>

        {variant === 'full' && (
          <p className="text-[13px] text-[#a39b94] leading-relaxed line-clamp-2">{event.description}</p>
        )}

        <div className="mt-auto space-y-1.5 text-[13px] text-[#b0a79d]">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="w-3.5 h-3.5 text-[#c8b393] shrink-0" />
            <span className="truncate">
              <span className="font-medium text-[#e6dfd3]">{formatEventDay(event, t)}</span>
              {' · '}{event.time}
              <span className="text-[#8c8279]"> · {event.durationMinutes} {t('evMin')}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-[#c8b393] shrink-0" />
            <span className="truncate">{event.locationAddress}</span>
          </div>
          {!isPast && (
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-3.5 h-3.5 text-[#c8b393] shrink-0" />
              <span className="truncate">
                <span className="font-mono-numbers">{registered}/{event.maxCapacity}</span>
                <span className="text-[#8c8279]">
                  {' · '}{seatsLeft > 0 ? t('dashSeatsLeft').replace('{n}', String(seatsLeft)) : t('eventFull')}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 flex items-center gap-2">
        <div className="flex-1 min-w-0 [&>button]:w-full">{primary}</div>
        {variant === 'full' && !isPast && (
          <button
            onClick={() => exportEventToIcs(event)}
            className="btn-icon"
            title={t('actionExportCalendar')}
            aria-label={t('actionExportCalendar')}
          >
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
};
