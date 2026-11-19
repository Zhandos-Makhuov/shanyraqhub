import { countCreditedBooks, hasQualifyingReview } from './bookCredit';
import { hasEventStarted } from './eventTime';
import { AchievementRule, CommunityEvent, DirectionId, ForumTopic, UserProfile } from '../types';

export interface AchievementData {
  users: UserProfile[];
  events: CommunityEvent[];
  forumTopics: ForumTopic[];
  /** Current activity streaks of the user being measured. */
  streak: number;
  weekStreak: number;
}

/**
 * Verified attendance of a user: check-ins recorded on events, plus attended
 * history entries for events that are no longer in the calendar.
 * Returns eventId -> direction.
 */
const attendedEvents = (user: UserProfile, events: CommunityEvent[]): Map<string, DirectionId> => {
  const attended = new Map<string, DirectionId>();
  events.forEach(e => {
    if (e.attendedUserIds.includes(user.id)) attended.set(e.id, e.direction);
  });
  user.attendedEvents.forEach(record => {
    if (record.status === 'attended' && !attended.has(record.eventId)) {
      attended.set(record.eventId, record.direction);
    }
  });
  return attended;
};

/** A hosted gathering counts once it has started and at least this many members were checked in. */
export const MIN_ATTENDEES_FOR_HOSTED = 3;
/** "Well rated": at least this many feedback forms with an average satisfaction of 4.5+. */
export const MIN_FEEDBACKS_FOR_RATING = 3;
export const WELL_RATED_AVERAGE = 4.5;

const hostedEvents = (userId: string, events: CommunityEvent[]): CommunityEvent[] =>
  events.filter(
    e =>
      e.hostId === userId &&
      hasEventStarted(e) &&
      e.attendedUserIds.filter(id => id !== userId).length >= MIN_ATTENDEES_FOR_HOSTED
  );

/** Current value of an achievement metric for one user. Manual achievements are always 0. */
export const getAchievementMetric = (userId: string, rule: AchievementRule, data: AchievementData): number => {
  const user = data.users.find(u => u.id === userId);
  if (!user) return 0;
  const replies = () => data.forumTopics.flatMap(t => t.replies).filter(r => r.authorId === userId);

  switch (rule.metric) {
    case 'books_completed':
      // Finished books with a 100+ character review, at most one per week.
      return countCreditedBooks(user.readBooks);
    case 'books_reviewed':
      return user.readBooks.filter(hasQualifyingReview).length;
    case 'events_attended': {
      const attended = [...attendedEvents(user, data.events).values()];
      return rule.direction ? attended.filter(d => d === rule.direction).length : attended.length;
    }
    case 'event_directions':
      return new Set(attendedEvents(user, data.events).values()).size;
    case 'feedback_given':
      return data.events.filter(e => e.feedbacks.some(f => f.userId === userId)).length;
    case 'positive_reviews_received':
      return user.peerReviews.filter(r => r.rating >= 4).length;
    case 'reviews_given':
      return data.users.flatMap(u => u.peerReviews).filter(r => r.authorId === userId).length;
    case 'forum_topics':
      return data.forumTopics.filter(t => t.authorId === userId).length;
    case 'forum_replies':
      return replies().length;
    case 'upvotes_received':
      return replies().reduce((sum, r) => sum + r.upvotes.filter(id => id !== userId).length, 0);
    case 'activity_streak':
      return data.streak;
    case 'activity_week_streak':
      return data.weekStreak;
    case 'events_hosted':
      return hostedEvents(userId, data.events).length;
    case 'well_rated_events_hosted':
      return hostedEvents(userId, data.events).filter(e => {
        const ratings = e.feedbacks.filter(f => f.userId !== userId).map(f => f.satisfactionRating);
        return ratings.length >= MIN_FEEDBACKS_FOR_RATING && ratings.reduce((a, b) => a + b, 0) / ratings.length >= WELL_RATED_AVERAGE;
      }).length;
    case 'manual':
    default:
      return 0;
  }
};
