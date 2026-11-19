/**
 * Live data layer (stage 6): reads the club's data from Supabase and performs actions
 * through the server's RPCs. The server is the only place where rewards, achievements,
 * capacity and permission checks happen; the client just shows the result.
 *
 * Loaded only in live mode (AuthGate is a dynamic import), so demo builds never include it.
 */
import { supabase } from './client';
import { buildPublicNames, eventFromRow, profileFromRows, CLUB_TIME_ZONE } from './adapters';
import type {
  AchievementRevocationRow, EventAttendanceRow, EventFeedbackRow, EventRegistrationRow, EventRow,
  PeerReviewRow, ProfileRow, UserAchievementRow, UserBalanceRow, UserRoleRow,
} from './rows';
import type { AppNotification, CommunityEvent, UserProfile } from '../../types';

export interface LiveSnapshot {
  users: UserProfile[];
  events: CommunityEvent[];
  notifications: AppNotification[];
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

const rows = async <T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> => {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
};

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link_tab: string | null;
  read_at: string | null;
  created_at: string;
  user_id: string;
}

/** DB notification types the screens do not have their own icon for. */
const notificationType = (t: string): AppNotification['type'] =>
  t === 'registration' ? 'new_event' : t === 'system' ? 'broadcast' : (t as AppNotification['type']);

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: CLUB_TIME_ZONE, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));

/** Everything the screens need, read through RLS with the member's own token. */
export const loadSnapshot = async (email: string, myId: string): Promise<LiveSnapshot> => {
  const c = db();
  const [profiles, roles, balances, events, registrations, attendance, feedback, achievements, revocations, reviews, notifications] =
    await Promise.all([
      rows<ProfileRow>(c.from('profiles').select('*')),
      rows<UserRoleRow>(c.from('user_roles').select('user_id, role')),
      rows<UserBalanceRow>(c.from('user_balances').select('user_id, xp, coins')),
      rows<EventRow>(c.from('events').select('*').order('starts_at', { ascending: true })),
      rows<EventRegistrationRow>(c.from('event_registrations').select('*')),
      rows<EventAttendanceRow>(c.from('event_attendance').select('event_id, user_id, checked_in_at')),
      rows<EventFeedbackRow>(c.from('event_feedback').select('*')),
      rows<UserAchievementRow>(c.from('user_achievements').select('user_id, achievement_id, unlocked_at')),
      rows<AchievementRevocationRow>(c.from('achievement_revocations').select('*')),
      rows<PeerReviewRow>(c.from('peer_reviews').select('*')),
      rows<NotificationRow>(
        c.from('notifications').select('id, type, title, body, link_tab, read_at, created_at, user_id')
          .order('created_at', { ascending: false }).limit(50),
      ),
    ]);
  const names = buildPublicNames(profiles, roles);
  const rel = { roles, balances, events, registrations, attendance, feedback, peerReviews: reviews, names,
    userAchievements: achievements, revocations };
  return {
    users: profiles.map(p => profileFromRows(p, { ...rel, email: p.id === myId ? email : undefined })),
    events: events.map(e => eventFromRow(e, { registrations, attendance, feedback, names })),
    notifications: notifications.map(n => ({
      id: n.id,
      userId: n.user_id,
      type: notificationType(n.type),
      title: n.title,
      message: n.body,
      timestamp: formatWhen(n.created_at),
      read: n.read_at !== null,
      linkTab: (n.link_tab ?? undefined) as AppNotification['linkTab'],
    })),
  };
};

/** Server error text -> translation key (raw database messages are never shown). */
const SERVER_ERRORS: [RegExp, string][] = [
  [/event_full/, 'liveErrEventFull'],
  [/registration_closed/, 'liveErrRegistrationClosed'],
  [/event_already_started/, 'liveErrEventStarted'],
  [/event_not_available|event_not_found/, 'liveErrEventNotAvailable'],
  [/feedback_requires_attendance/, 'liveErrFeedbackAttendance'],
  [/duplicate key/, 'liveErrDuplicate'],
  [/checkin_window_closed/, 'liveErrCheckinWindow'],
  [/cannot_check_in_yourself/, 'liveErrCheckinSelf'],
  [/not an organizer of this event/, 'liveErrNotEventOrganizer'],
  [/forbidden|permission denied|row-level security/, 'liveErrForbidden'],
  [/check constraint|violates/, 'liveErrInvalid'],
  [/fetch|network/i, 'authErrorNetwork'],
];
export const serverErrorKey = (message: string) => SERVER_ERRORS.find(([re]) => re.test(message))?.[1] ?? 'authErrorGeneric';

const call = async (fn: string, args: Record<string, unknown>): Promise<ActionResult> => {
  try {
    const { error } = await db().rpc(fn, args);
    return error ? { ok: false, error: serverErrorKey(error.message) } : { ok: true };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};

export const registerForEvent = (eventId: string) => call('register_for_event', { p_event: eventId });
export const cancelEventRegistration = (eventId: string) => call('cancel_event_registration', { p_event: eventId });
export const manualCheckIn = (eventId: string, userId: string, reason: string) =>
  call('manual_check_in', { p_event: eventId, p_user: userId, p_reason: reason });
export const submitEventFeedback = (eventId: string, satisfaction: number, usefulness: number, comment: string) =>
  call('submit_event_feedback', { p_event: eventId, p_satisfaction: satisfaction, p_usefulness: usefulness, p_comment: comment });

/** Club-local date + time (Asia/Almaty, UTC+5 all year) -> timestamptz. */
export const clubDateTimeToIso = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString();

export const createEvent = async (ev: Partial<CommunityEvent> & { date: string; time: string }): Promise<ActionResult> => {
  try {
    // created_by is set by the database (trigger) to the caller; RLS allows organizer+ only.
    const { error } = await db().from('events').insert({
      title: ev.title,
      direction: ev.direction,
      starts_at: clubDateTimeToIso(ev.date, ev.time),
      duration_minutes: ev.durationMinutes ?? 90,
      format: ev.format ?? 'offline',
      location_address: ev.format === 'online' ? null : ev.locationAddress || null,
      online_url: ev.format === 'online' ? ev.locationAddress || null : null,
      location_details: ev.locationDetails || null,
      description: ev.description ?? '',
      required_materials: ev.requiredMaterials ?? [],
      capacity: ev.maxCapacity ?? 25,
      status: 'published',
      speaker_name: ev.speaker?.name ?? null,
      speaker_role: ev.speaker?.role ?? null,
    });
    return error ? { ok: false, error: serverErrorKey(error.message) } : { ok: true };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};

export const markAllNotificationsRead = async (): Promise<ActionResult> => {
  try {
    const { error } = await db().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    return error ? { ok: false, error: serverErrorKey(error.message) } : { ok: true };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};
