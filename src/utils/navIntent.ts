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
