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
  /** Show only the member's own events (registered or attended) — Phase 5. */
  mine?: boolean;
}

let pending: EventsIntent | null = null;
export const EVENTS_INTENT_EVENT = 'shq-events-intent';

/** If the events page is already open it is told through an event (e.g. a notification about an event). */
export const setEventsIntent = (intent: EventsIntent) => {
  pending = intent;
  window.dispatchEvent(new Event(EVENTS_INTENT_EVENT));
};

export const takeEventsIntent = (): EventsIntent => {
  const intent = pending ?? {};
  pending = null;
  return intent;
};

/**
 * Forum: open this topic (e.g. from a "new reply in your topic" notification),
 * or show the discussions of a book (from the Books screen: search by its title, offer a new topic).
 */
export type ForumIntent = { topicId: string } | { book: { title: string; author: string } } | { mine: true };

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

/** Books: open this book's window (e.g. "continue reading" on the home page) — Phase 5. */
export interface LibraryIntent {
  title: string;
  author: string;
}

let pendingLibrary: LibraryIntent | null = null;

/** The library screen is never open while the home page is, so a plain hand-over is enough. */
export const setLibraryIntent = (intent: LibraryIntent) => {
  pendingLibrary = intent;
};

export const takeLibraryIntent = (): LibraryIntent | null => {
  const intent = pendingLibrary;
  pendingLibrary = null;
  return intent;
};
