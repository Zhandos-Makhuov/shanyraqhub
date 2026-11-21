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

const DATE_LOCALES: Record<string, string> = { ru: 'ru-RU', kz: 'kk-KZ', en: 'en-GB' };

/** "Сб, 23 нояб." / "сб, 23 қар." / "Sat, 23 Nov" — the event's day in club time, for cards. */
const KZ_WEEKDAYS = ['Жс', 'Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб'];
const KZ_MONTHS = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];

export const formatEventDay = (event: Pick<CommunityEvent, 'date' | 'time'>, language: string): string => {
  // Kazakh month names are missing from some browsers' date data (they print "M11"), so they are spelled here.
  if (language === 'kz') {
    const [y, m, d] = event.date.split('-').map(Number);
    if (!y || !m || !d) return event.date;
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${KZ_WEEKDAYS[weekday]}, ${d} ${KZ_MONTHS[m - 1]}`;
  }
  try {
    const s = new Intl.DateTimeFormat(DATE_LOCALES[language] || 'ru-RU', {
      timeZone: 'Asia/Almaty', weekday: 'short', day: 'numeric', month: 'short',
    }).format(getEventStart(event));
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return event.date;
  }
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
