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
