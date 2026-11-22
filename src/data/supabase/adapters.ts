/**
 * Compatibility layer: Supabase rows -> the objects the existing screens use
 * (UserProfile, CommunityEvent, ReadBook). Pure functions, no network.
 *
 * Purpose: when Supabase is connected (stage 6) the screens and AppContext keep
 * working unchanged; only the data source switches. Not imported by the app yet,
 * so it does not affect the current demo or live bundles.
 *
 * Known mismatches handled here:
 *   - role 'superadmin' (DB) <-> 'super_admin' (UI)
 *   - events.starts_at (timestamptz) -> date 'YYYY-MM-DD' + time 'HH:mm' in Asia/Almaty
 *   - registrations / attendance live in separate tables -> registeredUserIds / attendedUserIds
 *   - event_feedback has no id -> id = '<event_id>:<user_id>' (same key moderation reports use)
 *   - tier is never stored: always derived from XP (tierForXp)
 *   - reputationPoints is not stored: derived like the client does (XP/2 + 3 × received ratings)
 *   - profiles.directions mirrors ACTIVE memberships (DB trigger); pending applications are separate
 */
import { ALL_ACHIEVEMENTS } from '../achievements';
import { tierForXp } from '../gamification';
import type {
  AttendedEventRecord, CommunityEvent, DirectionId, EventFeedback, PeerReview,
  ReadBook, UserInventory, UserProfile, UserRole,
} from '../../types';
import type {
  AchievementRevocationRow, BookRow, DbRole, EventAttendanceRow, EventFeedbackRow, EventRegistrationRow,
  EventRow, MembershipRow, PeerReviewRow, ProfileContactRow, ProfileRow, UserAchievementRow,
  UserBalanceRow, UserBookRow, UserEquipmentRow, UserInventoryRow, UserRoleRow,
} from './rows';

export const CLUB_TIME_ZONE = 'Asia/Almaty';
const DEFAULT_AVATAR = '/icons/icon-192.png';

export const roleFromDb = (role: DbRole | undefined): UserRole => (role === 'superadmin' ? 'super_admin' : role ?? 'member');
export const roleToDb = (role: UserRole): DbRole => (role === 'super_admin' ? 'superadmin' : role);

/** Splits a timestamp into the club's local date and time. */
export const toClubDateTime = (iso: string): { date: string; time: string } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
};

const byUser = <T extends { user_id: string }>(rows: T[] = [], userId: string) => rows.filter(r => r.user_id === userId);
const byEvent = <T extends { event_id: string }>(rows: T[] = [], eventId: string) => rows.filter(r => r.event_id === eventId);

export interface PublicNames { [userId: string]: { name: string; avatar: string; role: UserRole } }

/** Display name/avatar/role lookup used for feedback, reviews and forum authors. */
export const buildPublicNames = (profiles: ProfileRow[], roles: UserRoleRow[] = []): PublicNames =>
  Object.fromEntries(profiles.map(p => [p.id, {
    name: p.display_name,
    avatar: p.avatar_url || DEFAULT_AVATAR,
    role: roleFromDb(roles.find(r => r.user_id === p.id)?.role),
  }]));

export const feedbackFromRow = (row: EventFeedbackRow, names: PublicNames): EventFeedback => ({
  id: `${row.event_id}:${row.user_id}`,
  eventId: row.event_id,
  userId: row.user_id,
  userName: names[row.user_id]?.name ?? '—',
  userAvatar: names[row.user_id]?.avatar ?? DEFAULT_AVATAR,
  satisfactionRating: row.satisfaction,
  usefulnessRating: row.usefulness,
  comment: row.comment,
  createdAt: row.created_at,
});

export interface EventRelations {
  registrations?: EventRegistrationRow[];
  attendance?: EventAttendanceRow[];
  feedback?: EventFeedbackRow[];
  names?: PublicNames;
}

export const eventFromRow = (row: EventRow, rel: EventRelations = {}): CommunityEvent => {
  const { date, time } = toClubDateTime(row.starts_at);
  const deadline = row.registration_deadline ? toClubDateTime(row.registration_deadline).date : date;
  const names = rel.names ?? {};
  return {
    id: row.id,
    title: row.title,
    coverUrl: row.cover_url ?? undefined,
    direction: row.direction,
    date,
    time,
    durationMinutes: row.duration_minutes,
    format: row.format,
    locationAddress: row.format === 'online' ? (row.online_url ?? '') : (row.location_address ?? ''),
    locationDetails: row.location_details ?? undefined,
    description: row.description,
    requiredMaterials: row.required_materials ?? [],
    maxCapacity: row.capacity,
    registrationDeadline: deadline,
    registeredUserIds: byEvent(rel.registrations, row.id).filter(r => r.status === 'registered').map(r => r.user_id),
    attendedUserIds: byEvent(rel.attendance, row.id).map(a => a.user_id),
    speaker: {
      name: row.speaker_name ?? '',
      role: row.speaker_role ?? '',
      avatar: row.speaker_avatar_url || DEFAULT_AVATAR,
      bio: row.speaker_bio ?? undefined,
    },
    hostId: row.created_by ?? undefined,
    feedbacks: byEvent(rel.feedback, row.id).map(f => feedbackFromRow(f, names)),
    isCompleted: row.status === 'completed',
  };
};

export const readBookFromRow = (row: UserBookRow, book: BookRow | undefined): ReadBook => ({
  id: row.id,
  title: book?.title ?? '',
  author: book?.author ?? '',
  genre: book?.genre ?? '',
  userRating: row.rating ?? 0,
  review: row.review ?? undefined,
  dateFinished: row.finished_at ?? '',
  coverColor: book?.cover_color ?? undefined,
  coverUrl: book?.cover_url ?? undefined,
  status: row.status,
});

export const peerReviewFromRow = (row: PeerReviewRow, names: PublicNames): PeerReview => ({
  id: row.id,
  targetUserId: row.target_id,
  authorId: row.author_id,
  authorName: names[row.author_id]?.name ?? '—',
  authorAvatar: names[row.author_id]?.avatar ?? DEFAULT_AVATAR,
  authorRole: names[row.author_id]?.role ?? 'member',
  rating: row.rating,
  comment: row.comment,
  aspect: row.aspect,
  createdAt: row.created_at,
});

const EQUIP_SLOT: Record<string, keyof UserInventory> = {
  avatar: 'equippedAvatarSkin', frame: 'equippedFrame', aura: 'equippedAura',
  headwear: 'equippedHeadwear', artifact: 'equippedArtifact',
};

export const inventoryFromRows = (userId: string, owned: UserInventoryRow[] = [], equipped: UserEquipmentRow[] = []): UserInventory => {
  const inv: UserInventory = { ownedItemIds: byUser(owned, userId).map(r => r.item_id) };
  byUser(equipped, userId).forEach(e => { (inv as unknown as Record<string, string>)[EQUIP_SLOT[e.category]] = e.item_id; });
  return inv;
};

/** The member's history: one record per event they registered for or attended. */
export const attendedRecordsFor = (
  userId: string, events: EventRow[], registrations: EventRegistrationRow[] = [],
  attendance: EventAttendanceRow[] = [], feedback: EventFeedbackRow[] = [],
): AttendedEventRecord[] => {
  const eventIds = new Set([...byUser(registrations, userId), ...byUser(attendance, userId)].map(r => r.event_id));
  return events.filter(e => eventIds.has(e.id)).map(e => {
    const check = attendance.find(a => a.event_id === e.id && a.user_id === userId);
    const reg = registrations.find(r => r.event_id === e.id && r.user_id === userId);
    const { date } = toClubDateTime(e.starts_at);
    return {
      eventId: e.id,
      title: e.title,
      date,
      direction: e.direction,
      status: check ? 'attended' : reg?.status === 'registered' ? 'registered' : 'cancelled',
      checkInTime: check ? toClubDateTime(check.checked_in_at).time : undefined,
      feedbackGiven: feedback.some(f => f.event_id === e.id && f.user_id === userId),
    };
  });
};

export interface ProfileRelations {
  email?: string;
  roles?: UserRoleRow[];
  balances?: UserBalanceRow[];
  contacts?: ProfileContactRow[];
  memberships?: MembershipRow[];
  events?: EventRow[];
  registrations?: EventRegistrationRow[];
  attendance?: EventAttendanceRow[];
  feedback?: EventFeedbackRow[];
  books?: BookRow[];
  userBooks?: UserBookRow[];
  peerReviews?: PeerReviewRow[];
  userAchievements?: UserAchievementRow[];
  revocations?: AchievementRevocationRow[];
  inventory?: UserInventoryRow[];
  equipment?: UserEquipmentRow[];
  names?: PublicNames;
}

export const profileFromRows = (p: ProfileRow, rel: ProfileRelations = {}): UserProfile => {
  const balance = rel.balances?.find(b => b.user_id === p.id);
  const xp = balance?.xp ?? 0;
  const received = (rel.peerReviews ?? []).filter(r => r.target_id === p.id && !r.is_hidden);
  const active = byUser(rel.memberships, p.id).filter(m => m.status === 'active').map(m => m.direction);
  const directions: DirectionId[] = rel.memberships ? active : p.directions;
  const unlocked = new Map(byUser(rel.userAchievements, p.id).map(a => [a.achievement_id, a.unlocked_at]));
  return {
    id: p.id,
    name: p.display_name,
    email: rel.email ?? '',
    handle: `@${p.handle}`,
    role: roleFromDb(rel.roles?.find(r => r.user_id === p.id)?.role),
    avatar: p.avatar_url || DEFAULT_AVATAR,
    bio: p.bio,
    city: p.city ?? '',
    telegram: p.telegram_handle ?? undefined,
    phone: rel.contacts?.find(c => c.user_id === p.id)?.phone ?? undefined,
    joinedDate: toClubDateTime(p.created_at).date,
    directions,
    xp,
    coins: balance?.coins ?? 0,
    tier: tierForXp(xp),
    reputationPoints: Math.round(xp / 2) + received.reduce((s, r) => s + r.rating * 3, 0),
    readBooks: byUser(rel.userBooks, p.id).map(ub => readBookFromRow(ub, rel.books?.find(b => b.id === ub.book_id))),
    attendedEvents: attendedRecordsFor(p.id, rel.events ?? [], rel.registrations, rel.attendance, rel.feedback),
    achievements: ALL_ACHIEVEMENTS.filter(a => unlocked.has(a.id))
      .map(a => ({ ...a, isUnlocked: true, unlockedAt: toClubDateTime(unlocked.get(a.id)!).date })),
    peerReviews: received.map(r => peerReviewFromRow(r, rel.names ?? {})),
    inventory: inventoryFromRows(p.id, rel.inventory, rel.equipment),
    preferredLanguage: p.preferred_language,
    telegramNotificationsEnabled: p.telegram_notifications_enabled,
    pushNotificationsEnabled: p.push_notifications_enabled,
    revokedAchievementIds: byUser(rel.revocations, p.id).filter(r => !r.lifted_at).map(r => r.achievement_id),
  };
};
