/**
 * One-shot hand-over between screens without touching the app context:
 * the home page picks a direction or an event, the events page opens with it.
 */
export interface EventsIntent {
  direction?: string;
  /** Open this event's details. */
  openEventId?: string;
  /** Open the feedback form for this event. */
  feedbackEventId?: string;
}

let pending: EventsIntent | null = null;

export const setEventsIntent = (intent: EventsIntent) => {
  pending = intent;
};

export const takeEventsIntent = (): EventsIntent => {
  const intent = pending ?? {};
  pending = null;
  return intent;
};

/** Forum: open this topic (e.g. from a "new reply in your topic" notification). */
export interface ForumIntent {
  topicId: string;
}

let pendingForum: ForumIntent | null = null;
export const FORUM_INTENT_EVENT = 'shq-forum-intent';

/** Hands a topic to the forum screen; if it is already open, it is told through an event. */
export const setForumIntent = (intent: ForumIntent) => {
  pendingForum = intent;
  window.dispatchEvent(new Event(FORUM_INTENT_EVENT));
};

export const takeForumIntent = (): ForumIntent | null => {
  const intent = pendingForum;
  pendingForum = null;
  return intent;
};
