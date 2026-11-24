import { CommunityEvent, ForumTopic, UserProfile } from '../types';
import { canSeeForumPost } from './forumPermissions';

/**
 * Phase 5 — member experience. Everything here is derived from data the app already has
 * (the member's shelf, events, forum topics); nothing is stored, nothing is rewarded.
 */

const ts = (value: string | undefined) => Date.parse(value ?? '') || 0;

/** Latest moment something happened in a topic (the topic or its newest reply). */
export const topicLastActivity = (topic: ForumTopic) =>
  Math.max(ts(topic.createdAt), ...topic.replies.map(r => ts(r.createdAt)));

export interface MyDiscussion {
  topic: ForumTopic;
  /** Replies by other people written after the member's own last post in the topic. */
  newReplies: number;
  lastActivity: number;
}

/**
 * Topics the member started or replied in, newest activity first.
 * "New" = replies by others after the member's own latest post (no read-tracking exists, so this is the honest measure).
 */
export const myDiscussions = (topics: ForumTopic[], user: Pick<UserProfile, 'id' | 'role'>): MyDiscussion[] =>
  topics
    .filter(tp => canSeeForumPost(tp, user))
    .filter(tp => tp.authorId === user.id || tp.replies.some(r => r.authorId === user.id))
    .map(tp => {
      const visible = tp.replies.filter(r => canSeeForumPost(r, user));
      const mineLast = Math.max(
        tp.authorId === user.id ? ts(tp.createdAt) : 0,
        ...visible.filter(r => r.authorId === user.id).map(r => ts(r.createdAt)),
      );
      const newReplies = visible.filter(r => r.authorId !== user.id && ts(r.createdAt) > mineLast).length;
      return { topic: tp, newReplies, lastActivity: topicLastActivity(tp) };
    })
    .sort((a, b) => b.newReplies - a.newReplies || b.lastActivity - a.lastActivity);

/** Books on the member's shelf marked "reading". */
export const readingNow = (user: Pick<UserProfile, 'readBooks'>) => user.readBooks.filter(b => b.status === 'reading');

export type FirstStepId = 'profile' | 'direction' | 'event' | 'book' | 'forum';
export interface FirstStep {
  id: FirstStepId;
  done: boolean;
}

/**
 * "First steps" for a new member: five ordinary ways into the club. Done-state comes from real data only.
 * (No reward is attached — the steps only point to existing screens.)
 */
export const firstSteps = (user: UserProfile, events: CommunityEvent[], topics: ForumTopic[]): FirstStep[] => [
  { id: 'profile', done: !!user.bio?.trim() },
  { id: 'direction', done: user.directions.length > 0 || (user.pendingDirections?.length ?? 0) > 0 },
  {
    id: 'event',
    done:
      events.some(e => e.registeredUserIds.includes(user.id) || e.attendedUserIds.includes(user.id)) ||
      user.attendedEvents.length > 0,
  },
  { id: 'book', done: user.readBooks.length > 0 },
  { id: 'forum', done: topics.some(tp => tp.authorId === user.id || tp.replies.some(r => r.authorId === user.id)) },
];

export interface Contribution {
  visits: number;
  booksRead: number;
  bookReviews: number;
  topics: number;
  replies: number;
  eventFeedback: number;
}

const inMonth = (value: string | undefined, monthStart: number) => ts(value) >= monthStart;

/**
 * What the member has given to the club: confirmed visits, finished books, written reviews, forum posts, event feedback.
 * `since` (ms) limits it to a period (e.g. this month); without it — all time.
 */
export const contribution = (user: UserProfile, events: CommunityEvent[], topics: ForumTopic[], since?: number): Contribution => {
  const ok = (value: string | undefined) => since === undefined || inMonth(value, since);
  const visitsFromEvents = events.filter(e => e.attendedUserIds.includes(user.id));
  const completed = user.readBooks.filter(b => b.status === 'completed' && ok(b.dateFinished));
  const myTopics = topics.filter(tp => tp.authorId === user.id && ok(tp.createdAt));
  const myReplies = topics.flatMap(tp => tp.replies).filter(r => r.authorId === user.id && ok(r.createdAt));
  return {
    visits: visitsFromEvents.filter(e => ok(e.date)).length,
    booksRead: completed.length,
    bookReviews: completed.filter(b => (b.review ?? '').trim().length > 0).length,
    topics: myTopics.length,
    replies: myReplies.length,
    eventFeedback: events.filter(e => e.feedbacks.some(f => f.userId === user.id) && ok(e.date)).length,
  };
};

/** Start of the current month in the club's time zone (Almaty, UTC+5), as ms. */
export const clubMonthStart = (now = new Date()) => {
  const almaty = new Date(now.getTime() + 5 * 3_600_000);
  return Date.UTC(almaty.getUTCFullYear(), almaty.getUTCMonth(), 1) - 5 * 3_600_000;
};
