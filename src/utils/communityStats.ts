import { CommunityEvent, DirectionId, UserProfile } from '../types';
import { hasQualifyingReview } from './bookCredit';
import { hasEventStarted } from './eventTime';
import { attendedCount, registeredCount } from './counts';

/**
 * Community statistics computed ONLY from real data in the current data source.
 * No multipliers, offsets or hard-coded numbers: an empty club shows zeros / "—".
 */
export interface CommunityStats {
  members: number;
  newMembersLast30Days: number;
  reviewedBooks: number;
  verifiedVisits: number;
  registrations: number;
  /** Share of registrations that ended with a verified visit (0–100), null when there are none. */
  attendanceRate: number | null;
  eventsHeld: number;
  /** Average event satisfaction 1–5, null when there is no feedback yet. */
  avgSatisfaction: number | null;
  feedbackCount: number;
}

export const computeCommunityStats = (users: UserProfile[], events: CommunityEvent[], now = new Date()): CommunityStats => {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Event counts are public; the lists of who registered / came are private in live (Phase 3, C-21).
  const verifiedVisits = events.reduce((n, e) => n + attendedCount(e), 0);
  const registrations = events.reduce((n, e) => n + registeredCount(e), 0);
  const feedbacks = events.flatMap(e => e.feedbacks);
  return {
    members: users.length,
    newMembersLast30Days: users.filter(u => (u.joinedDate || '') >= since).length,
    reviewedBooks: users.flatMap(u => u.readBooks).filter(hasQualifyingReview).length,
    verifiedVisits,
    registrations,
    attendanceRate: registrations > 0 ? Math.round((verifiedVisits / registrations) * 100) : null,
    eventsHeld: events.filter(e => hasEventStarted(e)).length,
    avgSatisfaction: feedbacks.length > 0 ? feedbacks.reduce((s, f) => s + f.satisfactionRating, 0) / feedbacks.length : null,
    feedbackCount: feedbacks.length,
  };
};

/** Share of members (0–100) with at least one verified visit in each direction. */
export const computeDirectionReach = (
  users: UserProfile[],
  directions: DirectionId[]
): Record<DirectionId, number> => {
  const result = {} as Record<DirectionId, number>;
  directions.forEach(dir => {
    const reached = users.filter(u => u.attendedEvents.some(a => a.status === 'attended' && a.direction === dir)).length;
    result[dir] = users.length > 0 ? Math.round((reached / users.length) * 100) : 0;
  });
  return result;
};
