import { UserProfile } from '../types';

/**
 * Profile every visitor starts with: a brand-new member at the first tier.
 * Real accounts will replace this once Supabase Auth is connected.
 */
export const NEW_MEMBER_ID = 'user-new-member';

export const NEW_MEMBER_PROFILE: UserProfile = {
  id: NEW_MEMBER_ID,
  name: 'Новый участник',
  email: '',
  handle: '@new_member',
  role: 'member',
  avatar: '/icons/icon-192.png',
  bio: '',
  city: 'Алматы',
  joinedDate: new Date().toISOString().slice(0, 10),
  directions: [],
  xp: 0,
  coins: 0,
  tier: 'bronze',
  reputationPoints: 0,
  preferredLanguage: 'ru',
  telegramNotificationsEnabled: false,
  pushNotificationsEnabled: false,
  inventory: { ownedItemIds: [] },
  readBooks: [],
  attendedEvents: [],
  achievements: [],
  peerReviews: [],
};
