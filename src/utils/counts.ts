import { CommunityEvent, UserProfile } from '../types';

/**
 * Numbers that stay public after the lists became private (Phase 3, C-21):
 * in live they come from get_event_counts / get_member_stats; in demo (and on an older schema) from the lists.
 */
export const registeredCount = (ev: Pick<CommunityEvent, 'registeredUserIds' | 'registeredCount'>) =>
  ev.registeredCount ?? ev.registeredUserIds.length;

export const attendedCount = (ev: Pick<CommunityEvent, 'attendedUserIds' | 'attendedCount'>) =>
  ev.attendedCount ?? ev.attendedUserIds.length;

export const memberVisits = (u: Pick<UserProfile, 'attendedEvents' | 'attendedCount'>) =>
  u.attendedCount ?? u.attendedEvents.filter(a => a.status === 'attended').length;
