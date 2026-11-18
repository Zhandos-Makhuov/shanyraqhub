import { CommunityEvent } from '../types';

/** Local start time of an event built from its `date` (YYYY-MM-DD) and `time` (HH:mm). */
export const getEventStart = (event: Pick<CommunityEvent, 'date' | 'time'>): Date => {
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = (event.time || '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0);
};

/** Registration is closed once the event has started. */
export const hasEventStarted = (event: Pick<CommunityEvent, 'date' | 'time'>, now = new Date()): boolean =>
  getEventStart(event).getTime() <= now.getTime();
