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
  AchievementRevocationRow, BookRow, UserBookRow, EventAttendanceRow, EventFeedbackRow, EventRegistrationRow, EventRow,
  PeerReviewRow, ProfileRow, UserAchievementRow, UserBalanceRow, UserRoleRow,
} from './rows';
import type { AppNotification, ChatMessage, CommunityEvent, DirectionId, EncryptedChatRoom, ForumTopic, ReadBook, UserProfile, UserRole } from '../../types';
import { hasRole } from '../../utils/permissions';
import { roleFromDb } from './adapters';

export interface LiveSnapshot {
  users: UserProfile[];
  events: CommunityEvent[];
  notifications: AppNotification[];
  forumTopics: ForumTopic[];
  chatRooms: EncryptedChatRoom[];
}

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
    categories, topics, replies, topicVotes, replyVotes, rooms, messages] =
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
      rows<UserBookRow>(c.from('user_books').select('id, user_id, book_id, status, rating, review, finished_at').order('updated_at', { ascending: false })),
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
    ]);
  const names = buildPublicNames(profiles, roles);
  const rel = { roles, balances, events, registrations, attendance, feedback, peerReviews: reviews, names,
    userAchievements: achievements, revocations, books, userBooks };
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
  return {
    forumTopics,
    chatRooms,
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
  [/not_registered/, 'liveErrNotRegistered'],
  [/cannot_vote_own/, 'liveErrOwnVote'],
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
