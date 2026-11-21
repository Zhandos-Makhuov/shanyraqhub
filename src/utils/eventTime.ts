import { CommunityEvent } from '../types';

/** Club time zone offset: Almaty/Astana, UTC+5 all year (Kazakhstan has no daylight saving time). */
export const CLUB_UTC_OFFSET = '+05:00';

/**
 * Start of an event. `date` (YYYY-MM-DD) and `time` (HH:mm) are the club's local time in Almaty,
 * whatever time zone the visitor's device is in.
 */
export const getEventStart = (event: Pick<CommunityEvent, 'date' | 'time'>): Date => {
  const [hours, minutes] = (event.time || '00:00').split(':').map(Number);
  const hh = String(hours || 0).padStart(2, '0');
  const mm = String(minutes || 0).padStart(2, '0');
  return new Date(`${event.date}T${hh}:${mm}:00${CLUB_UTC_OFFSET}`);
};

/** Registration is closed once the event has started. */
export const hasEventStarted = (event: Pick<CommunityEvent, 'date' | 'time'>, now = new Date()): boolean =>
  getEventStart(event).getTime() <= now.getTime();

/** Check-in (QR code) is possible from 2 hours before the start until 1 hour after the end (same window as the server). */
export const isCheckInWindowOpen = (
  event: Pick<CommunityEvent, 'date' | 'time' | 'durationMinutes'>,
  now = new Date(),
): boolean => {
  const start = getEventStart(event).getTime();
  const end = start + (event.durationMinutes || 90) * 60_000;
  return now.getTime() >= start - 2 * 3600_000 && now.getTime() <= end + 3600_000;
};

/** The event is over: its start plus duration has passed. */
export const hasEventEnded = (
  event: Pick<CommunityEvent, 'date' | 'time' | 'durationMinutes'>,
  now = new Date(),
): boolean => getEventStart(event).getTime() + (event.durationMinutes || 90) * 60_000 <= now.getTime();

/**
 * "Сб, 23 нояб." / "Сб, 23 қар." / "Sat, 23 Nov" — the event's day for cards and details.
 * Day and month names come from the translations (dateWeekdaysShort, dateMonthsShort), so every
 * browser shows the same text (some lack Kazakh date data and would print "M11").
 * `date` is already the club's local day (Almaty), so no time-zone conversion is needed.
 */
export const formatEventDay = (event: Pick<CommunityEvent, 'date'>, t: (key: string) => string): string => {
  const [y, m, d] = event.date.split('-').map(Number);
  if (!y || !m || !d) return event.date;
  const weekdays = t('dateWeekdaysShort').split(',');
  const months = t('dateMonthsShort').split(',');
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (weekdays.length !== 7 || months.length !== 12) return event.date;
  return t('dateDayPattern').replace('{wd}', weekdays[weekday]).replace('{d}', String(d)).replace('{m}', months[m - 1]);
};

/** What a member sees on an event card; the order of checks matches the registration rules. */
export type EventStatus = 'attended' | 'ended' | 'inProgress' | 'registered' | 'full' | 'open';

export const getEventStatus = (
  event: Pick<CommunityEvent, 'date' | 'time' | 'durationMinutes' | 'maxCapacity' | 'registeredUserIds' | 'attendedUserIds'>,
  userId: string,
  now = new Date(),
): EventStatus => {
  if (event.attendedUserIds.includes(userId)) return 'attended';
  if (hasEventEnded(event, now)) return 'ended';
  if (hasEventStarted(event, now)) return 'inProgress';
  if (event.registeredUserIds.includes(userId)) return 'registered';
  if (event.registeredUserIds.length >= event.maxCapacity) return 'full';
  return 'open';
};
