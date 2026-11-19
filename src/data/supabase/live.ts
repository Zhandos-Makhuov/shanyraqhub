/**
 * Live data layer (stage 6): reads the club's data from Supabase and performs actions
 * through the server's RPCs. The server is the only place where rewards, achievements,
 * capacity and permission checks happen; the client just shows the result.
 *
 * Loaded only in live mode (AuthGate is a dynamic import), so demo builds never include it.
 */
import { supabase } from './client';
import { applyCatalog, type AchievementRow, type CatalogReport, type ShopItemRow, type TierRow } from '../catalog';
import { buildPublicNames, eventFromRow, profileFromRows, CLUB_TIME_ZONE } from './adapters';
import type {
  MembershipRow, ProfileContactRow, UserEquipmentRow, UserInventoryRow,
  AchievementRevocationRow, BookRow, UserBookRow, EventAttendanceRow, EventFeedbackRow, EventRegistrationRow, EventRow,
  PeerReviewRow, ProfileRow, UserAchievementRow, UserBalanceRow, UserRoleRow,
} from './rows';
import type { AppNotification, AuditLog, ChatMessage, CoinTransaction, CommunityEvent, DirectionId, ItemCategory, PeerReview, EncryptedChatRoom, ForumTopic, ReadBook, UserProfile, UserRole } from '../../types';
import { hasRole } from '../../utils/permissions';
import { roleFromDb, roleToDb } from './adapters';

export interface LiveSnapshot {
  users: UserProfile[];
  events: CommunityEvent[];
  notifications: AppNotification[];
  forumTopics: ForumTopic[];
  chatRooms: EncryptedChatRoom[];
  coinTransactions: CoinTransaction[];
  auditLogs: AuditLog[];
  /** Pending direction applications this member may decide on (lead of the direction or moderator+; RLS). */
  membershipApplications: MembershipApplication[];
}

export interface MembershipApplication {
  id: string;
  userId: string;
  userName: string;
  direction: DirectionId;
  message: string;
  createdAt: string;
}
interface LedgerRow { id: number; user_id: string; coin_delta: number; reason: string; created_at: string }
interface AuditRow { id: number; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; details: Record<string, unknown>; created_at: string }

interface ForumCategoryRow { id: string; name_ru: string; name_kz: string; name_en: string; sort_order: number }
interface ForumTopicRow {
  id: string; category_id: string; direction: DirectionId | null; author_id: string; title: string; content: string;
  is_pinned: boolean; is_closed: boolean; view_count: number; created_at: string;
}
interface ForumReplyRow { id: string; topic_id: string; author_id: string; content: string; created_at: string }
interface TopicVoteRow { topic_id: string; user_id: string }
interface ReplyVoteRow { reply_id: string; user_id: string }
interface ChatRoomRow {
  id: string; title_ru: string; title_kz: string; title_en: string; description_ru: string; description_kz: string;
  description_en: string; direction: DirectionId | null; min_role: UserRoleRow['role'];
}
interface ChatMessageRow { id: number; room_id: string; sender_id: string; body: string; created_at: string }

/** Club calendar day (Asia/Almaty) of a timestamp, as YYYY-MM-DD. */
export const clubDay = (iso: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: CLUB_TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: CLUB_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso)).replace(',', '');

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
  const [profiles, roles, balances, events, registrations, attendance, feedback, achievements, revocations, reviews, notifications, books, userBooks,
    categories, topics, replies, topicVotes, replyVotes, rooms, messages, inventory, equipment, memberships, contacts, ledger, audits] =
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
      rows<BookRow>(c.from('books').select('id, title, author, genre, cover_color, cover_url')),
      rows<UserBookRow & { created_at: string }>(c.from('user_books').select('id, user_id, book_id, status, rating, review, finished_at, created_at').order('updated_at', { ascending: false })),
      rows<ForumCategoryRow>(c.from('forum_categories').select('*')),
      rows<ForumTopicRow>(c.from('forum_topics')
        .select('id, category_id, direction, author_id, title, content, is_pinned, is_closed, view_count, created_at')
        .order('created_at', { ascending: false })),
      rows<ForumReplyRow>(c.from('forum_replies').select('id, topic_id, author_id, content, created_at').order('created_at')),
      rows<TopicVoteRow>(c.from('forum_topic_votes').select('topic_id, user_id')),
      rows<ReplyVoteRow>(c.from('forum_reply_votes').select('reply_id, user_id')),
      // RLS returns only the rooms the member's role may enter (the moderators' room stays invisible to members).
      rows<ChatRoomRow>(c.from('chat_rooms').select('*').order('created_at')),
      rows<ChatMessageRow>(c.from('chat_messages').select('id, room_id, sender_id, body, created_at')
        .order('created_at', { ascending: false }).limit(500)),
      rows<UserInventoryRow>(c.from('user_inventory').select('user_id, item_id')),
      rows<UserEquipmentRow>(c.from('user_equipment').select('user_id, category, item_id')),
      // RLS: own applications, active members of every direction, and pending ones the member may decide on.
      rows<MembershipRow & { message: string | null }>(c.from('memberships').select('id, user_id, direction, status, role, created_at, message')),
      rows<ProfileContactRow>(c.from('profile_contacts').select('user_id, phone')),            // own (admins: all)
      rows<LedgerRow>(c.from('reward_ledger').select('id, user_id, coin_delta, reason, created_at')    // own (admins: all)
        .neq('coin_delta', 0).order('created_at', { ascending: false }).limit(300)),
      rows<AuditRow>(c.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)), // admins only
    ]);
  const names = buildPublicNames(profiles, roles);
  const rel = { roles, balances, events, registrations, attendance, feedback, peerReviews: reviews, names,
    userAchievements: achievements, revocations, books, userBooks, inventory, equipment, memberships, contacts };
  // Days with real activity per member — the same sources as private.activity_days on the server
  // (check-ins, event feedback, books, forum topics and replies, peer reviews), in club time.
  const activity = new Map<string, Set<string>>();
  const mark = (user: string, iso: string) => {
    if (!activity.has(user)) activity.set(user, new Set());
    activity.get(user)!.add(clubDay(iso));
  };
  attendance.forEach(a => mark(a.user_id, a.checked_in_at));
  feedback.forEach(f => mark(f.user_id, f.created_at));
  userBooks.forEach(b => mark(b.user_id, b.created_at));
  topics.forEach(t => mark(t.author_id, t.created_at));
  replies.forEach(r => mark(r.author_id, r.created_at));
  reviews.forEach(r => mark(r.author_id, r.created_at));

  const nameOf = (id: string) => names[id] ?? { name: '—', avatar: '/icons/icon-192.png', role: 'member' as UserRole };
  const forumTopics: ForumTopic[] = topics.map(t => {
    const cat = categories.find(cat => cat.id === t.category_id);
    const author = nameOf(t.author_id);
    return {
      id: t.id,
      categoryId: t.category_id,
      categoryNameRu: cat?.name_ru ?? t.category_id,
      categoryNameKz: cat?.name_kz ?? t.category_id,
      categoryNameEn: cat?.name_en ?? t.category_id,
      direction: t.direction ?? undefined,
      title: t.title,
      content: t.content,
      authorId: t.author_id,
      authorName: author.name,
      authorAvatar: author.avatar,
      authorRole: author.role,
      createdAt: formatDateTime(t.created_at),
      upvotes: topicVotes.filter(v => v.topic_id === t.id).map(v => v.user_id),
      views: t.view_count,
      isPinned: t.is_pinned,
      isClosed: t.is_closed,
      replies: replies.filter(r => r.topic_id === t.id).map(r => {
        const a = nameOf(r.author_id);
        return {
          id: r.id, authorId: r.author_id, authorName: a.name, authorAvatar: a.avatar, authorRole: a.role,
          content: r.content, createdAt: formatDateTime(r.created_at),
          upvotes: replyVotes.filter(v => v.reply_id === r.id).map(v => v.user_id),
        };
      }),
    };
  });
  const chatRooms: EncryptedChatRoom[] = rooms.map(r => {
    const minRole = roleFromDb(r.min_role);
    return {
      id: r.id,
      titleRu: r.title_ru, titleKz: r.title_kz, titleEn: r.title_en,
      descriptionRu: r.description_ru, descriptionKz: r.description_kz, descriptionEn: r.description_en,
      direction: r.direction ?? undefined,
      // Honest: messages are protected by roles on the server (RLS), not end-to-end encrypted.
      isEndToEndEncrypted: false,
      encryptionFingerprint: '',
      memberCount: profiles.filter(p => hasRole(nameOf(p.id).role, minRole)).length,
      accessLevel: hasRole(minRole, 'moderator') ? 'moderators' : 'all',
      messages: messages.filter(m => m.room_id === r.id).reverse().map((m): ChatMessage => {
        const snd = nameOf(m.sender_id);
        return { id: String(m.id), senderId: m.sender_id, senderName: snd.name, senderAvatar: snd.avatar, senderRole: snd.role,
          text: m.body, timestamp: formatTime(m.created_at) };
      }),
    };
  });
  const coinTransactions: CoinTransaction[] = ledger.map(l => ({
    id: String(l.id), userId: l.user_id, amount: Math.abs(l.coin_delta), type: l.coin_delta > 0 ? 'earn' : 'spend',
    reasonRu: l.reason, reasonKz: l.reason, reasonEn: l.reason, createdAt: formatDateTime(l.created_at),
  }));
  const auditLogs: AuditLog[] = audits.map(a => ({
    id: String(a.id), adminId: a.actor_id ?? '', adminName: a.actor_id ? nameOf(a.actor_id).name : 'Система',
    action: a.action, target: [a.target_type, a.target_id].filter(Boolean).join(' '),
    timestamp: formatDateTime(a.created_at), details: JSON.stringify(a.details),
  }));
  const membershipApplications: MembershipApplication[] = memberships
    .filter(m => m.status === 'pending' && m.user_id !== myId)
    .map(m => ({ id: m.id, userId: m.user_id, userName: nameOf(m.user_id).name, direction: m.direction,
      message: m.message ?? '', createdAt: formatDateTime(m.created_at) }));
  return {
    forumTopics,
    chatRooms,
    coinTransactions,
    auditLogs,
    membershipApplications,
    users: profiles.map(p => ({
      ...profileFromRows(p, { ...rel, email: p.id === myId ? email : undefined }),
      pendingDirections: memberships.filter(m => m.user_id === p.id && m.status === 'pending').map(m => m.direction),
      activityDays: [...(activity.get(p.id) ?? [])],
    })),
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
  [/not_registered/, 'liveErrNotRegistered'],
  [/cannot_vote_own/, 'liveErrOwnVote'],
  [/insufficient_coins/, 'liveErrNotEnoughCoins'],
  [/exceeded the maximum allowed size|payload too large|413/i, 'liveErrImageTooLarge'],
  [/mime type|invalid_mime/i, 'liveErrImageType'],
  [/already_owned/, 'liveErrAlreadyOwned'],
  [/item_not_owned|item_not_available/, 'liveErrItemNotOwned'],
  [/reapply_too_soon/, 'liveErrReapplyTooSoon'],
  [/membership_removed/, 'liveErrMembershipRemoved'],
  [/membership_not_pending/, 'liveErrDuplicate'],
  [/reason_required/, 'liveErrReasonRequired'],
  [/cannot change your own role|cannot adjust your own balance|cannot award an achievement to yourself|cannot revoke your own achievement|cannot review own membership/, 'liveErrSelfAction'],
  [/cannot demote the last superadmin/, 'liveErrLastSuperadmin'],
  [/amount out of range/, 'liveErrInvalid'],
  [/invalid_token/, 'liveErrQrInvalid'],
  [/token_already_used/, 'liveErrQrUsed'],
  [/token_expired/, 'liveErrQrExpired'],
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

/** QR content prefix (the server strips it): lets the scanner ignore unrelated QR codes. */
export const QR_PREFIX = 'shq1:';

/** Member: one-time check-in code for an event they registered for (valid 5 minutes, see issue_checkin_token). */
export const issueCheckinToken = async (
  eventId: string,
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string }> => {
  try {
    const { data, error } = await db().rpc('issue_checkin_token', { p_event: eventId });
    if (error) return { ok: false, error: serverErrorKey(error.message) };
    const row = (data as { token: string; expires_at: string }[] | null)?.[0];
    if (!row) return { ok: false, error: 'authErrorGeneric' };
    return { ok: true, code: QR_PREFIX + row.token, expiresAt: row.expires_at };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};

/** Organizer: confirms the visit of the member whose code was scanned (event organizer or moderator+). */
export const checkInWithToken = async (
  code: string,
): Promise<{ ok: true; userId: string; eventId: string; newlyCheckedIn: boolean } | { ok: false; error: string }> => {
  try {
    const { data, error } = await db().rpc('check_in_with_token', { p_token: code.trim() });
    if (error) return { ok: false, error: serverErrorKey(error.message) };
    const row = (data as { event_id: string; user_id: string; newly_checked_in: boolean }[] | null)?.[0];
    if (!row) return { ok: false, error: 'authErrorGeneric' };
    return { ok: true, userId: row.user_id, eventId: row.event_id, newlyCheckedIn: row.newly_checked_in };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};

/**
 * Tiers, shop and achievements from the database (owner decision, stage 6.2). Applied to the lists
 * the screens use before the app renders. Must run before loadSnapshot (profiles use ALL_ACHIEVEMENTS).
 */
export const loadCatalog = async (): Promise<CatalogReport> => {
  const c = db();
  const [tiers, shopItems, achievements] = await Promise.all([
    rows<TierRow>(c.from('tiers').select('*').order('sort_order')),
    rows<ShopItemRow>(c.from('shop_items').select('*')),
    rows<AchievementRow>(c.from('achievements').select('*')),
  ]);
  return applyCatalog({ tiers, shopItems, achievements });
};

/**
 * Saves a book to the member's library (save_user_book). The server decides about the reward
 * (finished + review of 100+ characters + one credited book per week; finish date set by the DB).
 * `credited` tells whether this save produced a new book reward.
 */
export const saveUserBook = async (book: Omit<ReadBook, 'id'>): Promise<{ ok: true; credited: boolean } | { ok: false; error: string }> => {
  try {
    const c = db();
    const started = new Date(Date.now() - 5000).toISOString(); // small margin for clock differences
    const { error } = await c.rpc('save_user_book', {
      p_title: book.title,
      p_author: book.author,
      p_genre: book.genre ?? '',
      p_status: book.status ?? 'completed',
      p_rating: book.userRating || null,
      p_review: book.review ?? null,
    });
    if (error) return { ok: false, error: serverErrorKey(error.message) };
    // Own rows only: admins can read everyone's ledger.
    const me = (await c.auth.getSession()).data.session?.user.id ?? '';
    const { data } = await c.from('reward_ledger').select('id')
      .eq('user_id', me).eq('source', 'book_added').gte('created_at', started).limit(1);
    return { ok: true, credited: (data?.length ?? 0) > 0 };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};

const insertOrDelete = async (op: PromiseLike<{ error: { message: string } | null }>): Promise<ActionResult> => {
  try {
    const { error } = await op;
    return error ? { ok: false, error: serverErrorKey(error.message) } : { ok: true };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};
const myId = async () => (await db().auth.getSession()).data.session?.user.id ?? '';

/** Forum and chats: plain inserts under RLS; rewards, daily caps and self-vote checks are database triggers. */
export const createForumTopic = async (title: string, content: string, categoryId: string, direction?: DirectionId) =>
  insertOrDelete(db().from('forum_topics').insert({ title, content, category_id: categoryId, direction: direction ?? null, author_id: await myId() }));
export const replyToForumTopic = async (topicId: string, content: string) =>
  insertOrDelete(db().from('forum_replies').insert({ topic_id: topicId, content, author_id: await myId() }));
export const setReplyVote = async (replyId: string, on: boolean) => {
  const me = await myId();
  return insertOrDelete(on
    ? db().from('forum_reply_votes').insert({ reply_id: replyId, user_id: me })
    : db().from('forum_reply_votes').delete().eq('reply_id', replyId).eq('user_id', me));
};
export const setTopicVote = async (topicId: string, on: boolean) => {
  const me = await myId();
  return insertOrDelete(on
    ? db().from('forum_topic_votes').insert({ topic_id: topicId, user_id: me })
    : db().from('forum_topic_votes').delete().eq('topic_id', topicId).eq('user_id', me));
};
export const sendChatMessage = async (roomId: string, text: string) =>
  insertOrDelete(db().from('chat_messages').insert({ room_id: roomId, body: text, sender_id: await myId() }));

// --- Shop (server checks coins and ownership; the purchase is written to the reward ledger) ---
export const purchaseShopItem = (itemId: string) => call('purchase_shop_item', { p_item: itemId });
export const equipItem = (itemId: string) => call('equip_item', { p_item: itemId });
export const unequipItem = (category: ItemCategory) => call('unequip_item', { p_category: category });

// --- Own profile (RLS: only own row; directions are NOT written here — memberships decide them) ---
export const updateOwnProfile = async (p: Partial<UserProfile>): Promise<ActionResult> => {
  const me = await myId();
  const fields: Record<string, unknown> = {};
  if (p.name !== undefined) fields.display_name = p.name;
  if (p.bio !== undefined) fields.bio = p.bio;
  if (p.city !== undefined) fields.city = p.city || null;
  if (p.telegram !== undefined) fields.telegram_handle = p.telegram || null;
  if (p.avatar !== undefined) fields.avatar_url = p.avatar || null;
  if (p.pushNotificationsEnabled !== undefined) fields.push_notifications_enabled = p.pushNotificationsEnabled;
  if (p.telegramNotificationsEnabled !== undefined) fields.telegram_notifications_enabled = p.telegramNotificationsEnabled;
  if (p.preferredLanguage !== undefined) fields.preferred_language = p.preferredLanguage;
  if (Object.keys(fields).length) {
    const r = await insertOrDelete(db().from('profiles').update(fields).eq('id', me));
    if (!r.ok) return r;
  }
  if (p.phone !== undefined) return insertOrDelete(db().from('profile_contacts').update({ phone: p.phone || null }).eq('user_id', me));
  return { ok: true };
};

// --- Directions: joining needs approval (owner decision) ---
export const requestMembership = (direction: DirectionId, message = '') => call('request_membership', { p_direction: direction, p_message: message });
export const leaveMembership = (direction: DirectionId) => call('leave_membership', { p_direction: direction });
export const reviewMembership = (membershipId: string, approve: boolean, note = '') =>
  call('review_membership', { p_membership: membershipId, p_approve: approve, p_note: note || null });

// --- Peer reviews (rewards and the notification are database triggers) ---
export const addPeerReview = async (targetId: string, rating: number, comment: string, aspect: PeerReview['aspect']) =>
  insertOrDelete(db().from('peer_reviews').insert({ author_id: await myId(), target_id: targetId, rating, comment, aspect }));

// --- Administration (each RPC checks the caller's role on the server) ---
export const setUserRole = (userId: string, role: UserRole) => call('set_user_role', { p_user: userId, p_role: roleToDb(role) });
export const adminAdjustCoins = (userId: string, amount: number, reason: string) =>
  call('admin_adjust_coins', { p_user: userId, p_amount: amount, p_reason: reason });
export const awardAchievement = (userId: string, achievementId: string, note: string) =>
  call('award_achievement', { p_user: userId, p_achievement: achievementId, p_note: note });
export const revokeAchievement = (userId: string, achievementId: string, reason: string) =>
  call('revoke_achievement', { p_user: userId, p_achievement: achievementId, p_reason: reason });
export const dispatchBroadcast = (title: string, body: string, channels: string[], direction?: DirectionId) =>
  call('dispatch_broadcast', { p_title: title, p_body: body, p_channels: channels, p_direction: direction ?? null });

// --- Profile photo (Storage bucket "avatars": each member writes only into the folder named after their id) ---
const AVATAR_MAX_SIDE = 512;

/** Downscales a photo in the browser (phone photos are often larger than the 2 MB bucket limit). */
const toAvatarJpeg = async (file: File): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, AVATAR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('image_encode_failed'))), 'image/jpeg', 0.85));
};

export const uploadAvatar = async (file: File): Promise<ActionResult> => {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, error: 'liveErrImageType' };
    const c = db();
    const me = await myId();
    const blob = await toAvatarJpeg(file);
    const path = `${me}/avatar-${Date.now()}.jpg`;
    const up = await c.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (up.error) return { ok: false, error: serverErrorKey(up.error.message) };
    const url = c.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    const r = await insertOrDelete(c.from('profiles').update({ avatar_url: url }).eq('id', me));
    if (!r.ok) return r;
    // Remove older photos of this member (Storage API; SQL deletes are blocked by Supabase).
    const { data: old } = await c.storage.from('avatars').list(me);
    const stale = (old ?? []).map(o => `${me}/${o.name}`).filter(p => p !== path);
    if (stale.length) await c.storage.from('avatars').remove(stale);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: serverErrorKey(e instanceof Error ? e.message : String(e)) };
  }
};
