import { AppNotification, AuditLog, CoinTransaction, CommunityEvent, EncryptedChatRoom, ForumTopic, UserProfile } from '../types';
import { isDemoData } from '../config/runtime';

/** Everything the app starts with when nothing is saved in this browser yet. */
export interface InitialData {
  users: UserProfile[];
  events: CommunityEvent[];
  forumTopics: ForumTopic[];
  chatRooms: EncryptedChatRoom[];
  coinTransactions: CoinTransaction[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
}

/** Live mode starts empty: no fabricated members, events or statistics. */
const EMPTY: InitialData = {
  users: [],
  events: [],
  forumTopics: [],
  chatRooms: [],
  coinTransactions: [],
  auditLogs: [],
  notifications: [],
};

/**
 * Loads the initial data for the current data source.
 * Demo data is a dynamic import, so live builds never contain it.
 * The Supabase data layer will plug in here (live mode) in a later stage.
 */
export const loadInitialData = async (): Promise<InitialData> => {
  // Compared directly against the inlined env value so the bundler removes the
  // demo import from live builds (isDemoData is the same check, see config/runtime.ts).
  if (import.meta.env.VITE_DATA_SOURCE === 'live' || !isDemoData) return EMPTY;
  const demo = await import('./mockData');
  return {
    users: demo.INITIAL_USERS,
    events: demo.INITIAL_EVENTS,
    forumTopics: demo.INITIAL_FORUM_TOPICS,
    chatRooms: demo.INITIAL_CHAT_ROOMS,
    coinTransactions: demo.INITIAL_COIN_TRANSACTIONS,
    auditLogs: demo.INITIAL_AUDIT_LOGS,
    notifications: demo.INITIAL_NOTIFICATIONS,
  };
};
