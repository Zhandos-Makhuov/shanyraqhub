import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Language,
  UserProfile,
  UserRole,
  CommunityEvent,
  ForumTopic,
  EncryptedChatRoom,
  AppNotification,
  CoinTransaction,
  AuditLog,
  ItemCategory,
  ReadBook,
  PeerReview,
  DirectionId,
  Achievement,
} from '../types';
import { TRANSLATIONS } from '../data/translations';
import { NEW_MEMBER_ID, NEW_MEMBER_PROFILE, INITIAL_USERS, INITIAL_EVENTS, INITIAL_FORUM_TOPICS, INITIAL_CHAT_ROOMS, INITIAL_COIN_TRANSACTIONS, INITIAL_AUDIT_LOGS, INITIAL_NOTIFICATIONS } from '../data/mockData';
import { SHOP_ITEMS, TIERS, ATTENDANCE_XP, attendanceCoinsForTier, tierForXp } from '../data/gamification';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';
import { getAchievementMetric } from '../utils/achievementProgress';
import { sendLocalPushNotification, requestWebPushPermission } from '../utils/notifications';
import { canAccessRoom, canAssignRole, hasRole, isStaffRole } from '../utils/permissions';
import { hasEventStarted } from '../utils/eventTime';
import { isDemoMode } from '../utils/demoMode';
import { hasQualifyingReview, isWeekFreeForCredit } from '../utils/bookCredit';
import { computeDayStreak, computeWeekStreak, toLocalDay } from '../utils/streak';

export type NavTab =
  | 'dashboard'
  | 'events'
  | 'achievements'
  | 'library'
  | 'attendance'
  | 'leaderboard'
  | 'forum'
  | 'shop'
  | 'profile'
  | 'admin';

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;

  currentUser: UserProfile;
  allUsers: UserProfile[];
  switchCurrentUser: (userId: string) => void;
  updateProfile: (updated: Partial<UserProfile>) => void;

  selectedUserModal: UserProfile | null;
  setSelectedUserModal: (user: UserProfile | null) => void;

  events: CommunityEvent[];
  registerForEvent: (eventId: string) => void;
  cancelEventRegistration: (eventId: string) => void;
  checkInAttendance: (eventId: string, userId: string) => boolean;
  submitEventFeedback: (eventId: string, satisfaction: number, usefulness: number, comment: string) => void;
  createEvent: (newEventData: Partial<CommunityEvent>) => void;

  allReadBooks: (ReadBook & { readerName: string; readerAvatar: string; readerId: string })[];
  /** Returns true if the book was credited (reward + book achievements). */
  addReadBook: (book: Omit<ReadBook, 'id'>) => boolean;

  forumTopics: ForumTopic[];
  createForumTopic: (title: string, content: string, categoryId: string, direction?: DirectionId) => void;
  replyToForumTopic: (topicId: string, content: string) => void;
  upvoteReply: (topicId: string, replyId: string) => void;
  upvoteTopic: (topicId: string) => void;

  chatRooms: EncryptedChatRoom[];
  sendChatMessage: (roomId: string, text: string) => void;

  buyShopItem: (itemId: string) => boolean;
  equipShopItem: (itemId: string, category: ItemCategory) => void;
  unequipShopItem: (category: ItemCategory) => void;

  coinTransactions: CoinTransaction[];
  auditLogs: AuditLog[];
  notifications: AppNotification[];
  markAllNotificationsAsRead: () => void;
  togglePushNotifications: () => Promise<boolean>;

  updateUserRole: (targetUserId: string, newRole: UserRole) => void;
  adjustUserCoins: (targetUserId: string, amount: number, reason: string) => boolean;
  dispatchBroadcast: (title: string, content: string, channels: ('push' | 'telegram' | 'whatsapp')[], directionTarget?: string) => void;

  addPeerReview: (targetUserId: string, rating: number, comment: string, aspect: PeerReview['aspect']) => void;

  /** Consecutive days with real activity (attendance, feedback, books, forum, reviews). */
  getActivityStreak: (userId: string) => number;
  /** Consecutive weeks (Mon–Sun) with at least one real activity. */
  getWeekStreak: (userId: string) => number;

  /** Current progress towards an achievement (0 for manual ones). */
  getAchievementProgress: (userId: string, achievementId: string) => number;
  /** Moderator+ awards a manual achievement to another member. */
  awardAchievement: (userId: string, achievementId: string, note: string) => boolean;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEY = 'shanyraq_hub_app_state_v1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('shanyraq_lang');
    return (saved as Language) || 'ru';
  });

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_users`);
    const users: UserProfile[] = saved ? JSON.parse(saved) : INITIAL_USERS;
    // Every visitor starts as a new first-tier member (also added to data saved before this existed).
    const withNewcomer = users.some(u => u.id === NEW_MEMBER_ID) ? users : [NEW_MEMBER_PROFILE, ...users];
    // Tier is always derived from XP (keeps saved data correct when thresholds change).
    return withNewcomer.map(u => ({ ...u, tier: tierForXp(u.xp) }));
  });

  const [currentUserId, setCurrentUserId] = useState<string>(NEW_MEMBER_ID);

  const [events, setEvents] = useState<CommunityEvent[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_events`);
    return saved ? JSON.parse(saved) : INITIAL_EVENTS;
  });

  const [forumTopics, setForumTopics] = useState<ForumTopic[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_topics`);
    return saved ? JSON.parse(saved) : INITIAL_FORUM_TOPICS;
  });

  const [chatRooms, setChatRooms] = useState<EncryptedChatRoom[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_chats`);
    return saved ? JSON.parse(saved) : INITIAL_CHAT_ROOMS;
  });

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_notifs`);
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
  });

  const [coinTransactions, setCoinTransactions] = useState<CoinTransaction[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_txs`);
    return saved ? JSON.parse(saved) : INITIAL_COIN_TRANSACTIONS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_audits`);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  // Days (YYYY-MM-DD, local) on which each user did something real. Drives the activity streak.
  const [activityLog, setActivityLog] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`${STORAGE_KEY}_activity`) || '{}');
    } catch {
      return {};
    }
  });

  const [selectedUserModal, setSelectedUserModal] = useState<UserProfile | null>(null);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(allUsers));
  }, [allUsers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_events`, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_topics`, JSON.stringify(forumTopics));
  }, [forumTopics]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_chats`, JSON.stringify(chatRooms));
  }, [chatRooms]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_notifs`, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_txs`, JSON.stringify(coinTransactions));
  }, [coinTransactions]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_audits`, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_activity`, JSON.stringify(activityLog));
  }, [activityLog]);

  // Reward idempotency log: key -> timestamp (ms). A key is paid out at most once.
  // A ref (not only state) so two calls in the same click cannot both pass the check.
  const rewardLogRef = useRef<Record<string, number>>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(`${STORAGE_KEY}_rewards`) || '{}');
      } catch {
        return {};
      }
    })()
  );

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('shanyraq_lang', lang);
  };

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.ru;
    return dict[key] || TRANSLATIONS.ru[key] || key;
  };

  const currentUser = allUsers.find(u => u.id === currentUserId) || allUsers[0];

  // Test-account switching exists only in demo mode (see isDemoMode).
  const switchCurrentUser = (userId: string) => {
    if (!isDemoMode) return;
    setCurrentUserId(userId);
  };

  // XP progression & tier calculation
  const recalculateTier = tierForXp;

  const addXpAndCoins = (userId: string, xpDelta: number, coinsDelta: number, reasonRu: string) => {
    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== userId) return u;
        const newXp = Math.max(0, u.xp + xpDelta);
        const newCoins = Math.max(0, u.coins + coinsDelta);
        const newTier = recalculateTier(newXp);
        const tierUpgraded = newTier !== u.tier;

        if (tierUpgraded) {
          try {
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#dfcfb3', '#f5d77f', '#ffffff'],
            });
          } catch {}
          setNotifications(n => [
            {
              id: `notif-tier-${Date.now()}`,
              userId: u.id,
              type: 'level_up',
              title: 'Повышение клубного ранга!',
              message: `Поздравляем! Ваш статус повышен до ${TIERS[newTier].nameRu}!`,
              timestamp: 'Только что',
              read: false,
              linkTab: 'profile',
            },
            ...n,
          ]);
        }

        return {
          ...u,
          xp: newXp,
          coins: newCoins,
          tier: newTier,
          reputationPoints: u.reputationPoints + Math.round(xpDelta / 2),
        };
      })
    );

    if (coinsDelta !== 0) {
      setCoinTransactions(prev => [
        {
          id: `tx-${Date.now()}-${Math.random()}`,
          userId,
          amount: Math.abs(coinsDelta),
          type: coinsDelta > 0 ? 'earn' : 'spend',
          reasonRu,
          reasonKz: reasonRu,
          reasonEn: reasonRu,
          createdAt: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ]);
    }
  };

  const recordActivity = (userId: string) => {
    const today = toLocalDay();
    setActivityLog(prev => {
      const days = prev[userId] || [];
      if (days.includes(today)) return prev;
      return { ...prev, [userId]: [...days, today].slice(-400) };
    });
  };

  const activityDays = (userId: string): string[] => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return [];
    return [
      ...(activityLog[userId] || []),
      // Verified history that existed before the activity log.
      ...user.attendedEvents.filter(a => a.status === 'attended').map(a => a.date),
      ...user.readBooks.filter(b => b.status === 'completed').map(b => b.dateFinished),
    ];
  };

  const getActivityStreak = (userId: string): number => computeDayStreak(activityDays(userId));
  const getWeekStreak = (userId: string): number => computeWeekStreak(activityDays(userId));

  /**
   * Single entry point for activity rewards.
   * - `key` makes the reward idempotent: the same key never pays twice
   *   (double clicks, un-vote/re-vote, delete/re-post).
   * - `dailyCap` limits how many rewards with the same `capGroup` a user can get per 24h.
   * Returns true if the reward was granted.
   * Mirrors private.grant_reward() in the proposed Supabase schema.
   */
  const grantRewardOnce = (
    key: string,
    userId: string,
    xpDelta: number,
    coinsDelta: number,
    reasonRu: string,
    cap?: { group: string; dailyCap: number }
  ): boolean => {
    const log = rewardLogRef.current;
    if (log[key]) return false;

    if (cap) {
      const since = Date.now() - 24 * 60 * 60 * 1000;
      const usedToday = Object.entries(log).filter(
        ([k, ts]) => k.startsWith(`${cap.group}:`) && k.endsWith(`:${userId}`) && ts > since
      ).length;
      if (usedToday >= cap.dailyCap) {
        return false;
      }
    }

    log[key] = Date.now();
    localStorage.setItem(`${STORAGE_KEY}_rewards`, JSON.stringify(log));
    addXpAndCoins(userId, xpDelta, coinsDelta, reasonRu);
    return true;
  };

  const updateProfile = (updated: Partial<UserProfile>) => {
    setAllUsers(prev =>
      prev.map(u => (u.id === currentUser.id ? { ...u, ...updated } : u))
    );
  };

  // Event Registrations
  const registerForEvent = (eventId: string) => {
    const target = events.find(e => e.id === eventId);
    if (!target) return;
    if (target.registeredUserIds.includes(currentUser.id)) return; // no duplicate registration
    if (hasEventStarted(target)) return; // registration closes when the event starts
    if (target.registeredUserIds.length >= target.maxCapacity) {
      alert('Все места на это мероприятие уже заняты.');
      return;
    }

    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        if (ev.registeredUserIds.includes(currentUser.id)) return ev;
        return {
          ...ev,
          registeredUserIds: [...ev.registeredUserIds, currentUser.id],
        };
      })
    );

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        const exists = u.attendedEvents.some(a => a.eventId === eventId);
        const targetEvent = events.find(e => e.id === eventId);
        if (!targetEvent) return u;
        if (exists) {
          return {
            ...u,
            attendedEvents: u.attendedEvents.map(a =>
              a.eventId === eventId ? { ...a, status: 'registered' } : a
            ),
          };
        }
        return {
          ...u,
          attendedEvents: [
            ...u.attendedEvents,
            {
              eventId,
              title: targetEvent.title,
              date: targetEvent.date,
              direction: targetEvent.direction,
              status: 'registered',
            },
          ],
        };
      })
    );

    try {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.7 } });
    } catch {}

    setNotifications(prev => [
      {
        id: `notif-reg-${Date.now()}`,
        userId: currentUser.id,
        type: 'new_event',
        title: 'Успешная регистрация на мероприятие',
        message: `Вы записаны на «${events.find(e => e.id === eventId)?.title}». Детали и список материалов сохранены в кабинете.`,
        timestamp: 'Только что',
        read: false,
        linkTab: 'events',
      },
      ...prev,
    ]);
  };

  const cancelEventRegistration = (eventId: string) => {
    const target = events.find(e => e.id === eventId);
    if (!target || hasEventStarted(target) || target.attendedUserIds.includes(currentUser.id)) return;

    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        return {
          ...ev,
          registeredUserIds: ev.registeredUserIds.filter(id => id !== currentUser.id),
        };
      })
    );

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        return {
          ...u,
          attendedEvents: u.attendedEvents.map(a =>
            a.eventId === eventId ? { ...a, status: 'cancelled' } : a
          ),
        };
      })
    );
  };

  // Only staff (organizer+) can confirm attendance, and never their own.
  const checkInAttendance = (eventId: string, targetUserId: string): boolean => {
    if (!isStaffRole(currentUser.role) || targetUserId === currentUser.id) return false;
    const uid = targetUserId;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return false;

    if (ev.attendedUserIds.includes(uid)) {
      return false; // Already checked in
    }

    setEvents(prev =>
      prev.map(e => {
        if (e.id !== eventId) return e;
        return {
          ...e,
          attendedUserIds: [...e.attendedUserIds, uid],
        };
      })
    );

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== uid) return u;
        const attendedRecord = u.attendedEvents.find(a => a.eventId === eventId);
        const checkTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const updatedAttended = attendedRecord
          ? u.attendedEvents.map(a =>
              a.eventId === eventId ? { ...a, status: 'attended' as const, checkInTime: checkTime } : a
            )
          : [
              ...u.attendedEvents,
              {
                eventId,
                title: ev.title,
                date: ev.date,
                direction: ev.direction,
                status: 'attended' as const,
                checkInTime: checkTime,
              },
            ];
        return { ...u, attendedEvents: updatedAttended };
      })
    );

    // Tier bonus: silver +10% … tengri +30% coins (see TIERS.attendanceCoinBonusPercent).
    const attendee = allUsers.find(u => u.id === uid);
    const coins = attendanceCoinsForTier(attendee?.tier ?? 'bronze');
    grantRewardOnce(`attendance:${eventId}:${uid}`, uid, ATTENDANCE_XP, coins, `Подтверждение визита на «${ev.title}»`);
    recordActivity(uid);

    try {
      confetti({ particleCount: 50, spread: 80, origin: { y: 0.6 } });
    } catch {}
    return true;
  };

  const submitEventFeedback = (
    eventId: string,
    satisfactionRating: number,
    usefulnessRating: number,
    comment: string
  ) => {
    const feedbackItem = {
      id: `fb-${Date.now()}`,
      eventId,
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      satisfactionRating,
      usefulnessRating,
      comment,
      createdAt: new Date().toLocaleDateString('ru-RU'),
    };

    const targetEvent = events.find(e => e.id === eventId);
    if (!targetEvent || !targetEvent.attendedUserIds.includes(currentUser.id)) return; // only attendees
    const alreadyGiven =
      targetEvent.feedbacks.some(f => f.userId === currentUser.id) ||
      currentUser.attendedEvents.some(a => a.eventId === eventId && a.feedbackGiven);
    if (alreadyGiven) return;

    setEvents(prev =>
      prev.map(ev => {
        if (ev.id !== eventId) return ev;
        return {
          ...ev,
          feedbacks: [feedbackItem, ...ev.feedbacks],
        };
      })
    );

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        return {
          ...u,
          attendedEvents: u.attendedEvents.map(a =>
            a.eventId === eventId ? { ...a, feedbackGiven: true } : a
          ),
        };
      })
    );

    grantRewardOnce(`feedback:${eventId}:${currentUser.id}`, currentUser.id, 30, 20, 'Обратная связь по мероприятию');
    recordActivity(currentUser.id);
  };

  const createEvent = (newEventData: Partial<CommunityEvent>) => {
    const newEvent: CommunityEvent = {
      id: `event-${Date.now()}`,
      title: newEventData.title || 'Новая клубная встреча',
      direction: newEventData.direction || 'books',
      date: newEventData.date || new Date().toISOString().split('T')[0],
      time: newEventData.time || '19:00',
      durationMinutes: newEventData.durationMinutes || 90,
      format: newEventData.format || 'offline',
      locationAddress: newEventData.locationAddress || 'Алматы, Shanyraq Hub Coworking',
      locationDetails: newEventData.locationDetails || 'Главный зал',
      description: newEventData.description || '',
      requiredMaterials: newEventData.requiredMaterials || [],
      maxCapacity: newEventData.maxCapacity || 25,
      registrationDeadline: newEventData.registrationDeadline || 'За 2 часа до начала',
      registeredUserIds: [currentUser.id],
      attendedUserIds: [],
      speaker: newEventData.speaker || {
        name: currentUser.name,
        role: 'Ведущий Shanyraq Hub',
        avatar: currentUser.avatar,
      },
      feedbacks: [],
    };

    setEvents(prev => [newEvent, ...prev]);

    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'EVENT_CREATE',
        target: newEvent.title,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Создано мероприятие (${newEvent.format}, лимит: ${newEvent.maxCapacity})`,
      },
      ...prev,
    ]);

    setNotifications(prev => [
      {
        id: `notif-new-ev-${Date.now()}`,
        userId: currentUser.id,
        type: 'new_event',
        title: 'Новое событие добавлено в календарь!',
        message: `Мероприятие «${newEvent.title}» опубликовано и доступно для записи.`,
        timestamp: 'Только что',
        read: false,
        linkTab: 'events',
      },
      ...prev,
    ]);

    try {
      confetti({ particleCount: 40, spread: 60 });
    } catch {}
  };

  // Reading Library
  const allReadBooks = allUsers.flatMap(u =>
    u.readBooks.map(b => ({
      ...b,
      readerName: u.name,
      readerAvatar: u.avatar,
      readerId: u.id,
    }))
  );

  const addReadBook = (book: Omit<ReadBook, 'id'>) => {
    const newBook: ReadBook = {
      ...book,
      id: `book-${Date.now()}`,
      status: book.status || 'completed',
    };

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        return {
          ...u,
          readBooks: [newBook, ...u.readBooks],
        };
      })
    );

    recordActivity(currentUser.id);

    // Self-reported: rewarded only for a finished book with a real review,
    // at most one book per week (see utils/bookCredit.ts). Otherwise it is
    // simply saved to the library.
    const credited =
      hasQualifyingReview(newBook) && isWeekFreeForCredit(currentUser.readBooks, newBook.dateFinished);
    if (credited) {
      const bookKey = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
      grantRewardOnce(
        `book:${bookKey}:${currentUser.id}`,
        currentUser.id,
        50,
        30,
        `Книга «${book.title}» с рецензией`
      );
      try {
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
      } catch {}
    }
    return credited;
  };

  // Forum
  const createForumTopic = (title: string, content: string, categoryId: string, direction?: DirectionId) => {
    const newTopic: ForumTopic = {
      id: `topic-${Date.now()}`,
      categoryId,
      categoryNameRu: title,
      categoryNameKz: title,
      categoryNameEn: title,
      direction,
      title,
      content,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRole: currentUser.role,
      createdAt: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      upvotes: [],
      views: 1,
      replies: [],
    };

    setForumTopics(prev => [newTopic, ...prev]);
    recordActivity(currentUser.id);
    grantRewardOnce(`forum_topic:${newTopic.id}:${currentUser.id}`, currentUser.id, 30, 15, 'Создание темы на форуме', {
      group: 'forum_topic',
      dailyCap: 3,
    });
  };

  const replyToForumTopic = (topicId: string, content: string) => {
    const newReply = {
      id: `reply-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRole: currentUser.role,
      content,
      createdAt: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      upvotes: [],
    };

    setForumTopics(prev =>
      prev.map(t => {
        if (t.id !== topicId) return t;
        return {
          ...t,
          replies: [...t.replies, newReply],
        };
      })
    );

    recordActivity(currentUser.id);
    grantRewardOnce(`forum_reply:${newReply.id}:${currentUser.id}`, currentUser.id, 20, 10, 'Ответ в обсуждении форума', {
      group: 'forum_reply',
      dailyCap: 10,
    });
  };

  const upvoteReply = (topicId: string, replyId: string) => {
    const reply = forumTopics.find(t => t.id === topicId)?.replies.find(r => r.id === replyId);
    if (!reply || reply.authorId === currentUser.id) return; // no self-votes
    const isAdding = !reply.upvotes.includes(currentUser.id);

    setForumTopics(prev =>
      prev.map(t => {
        if (t.id !== topicId) return t;
        return {
          ...t,
          replies: t.replies.map(r => {
            if (r.id !== replyId) return r;
            const upvotes = isAdding
              ? [...r.upvotes.filter(id => id !== currentUser.id), currentUser.id]
              : r.upvotes.filter(id => id !== currentUser.id);
            return { ...r, upvotes };
          }),
        };
      })
    );

    // Keyed on (reply, voter): un-vote + re-vote never pays the author twice.
    if (isAdding) {
      grantRewardOnce(
        `reply_upvote:${replyId}:${currentUser.id}:${reply.authorId}`,
        reply.authorId,
        15,
        10,
        'Полезный ответ на форуме'
      );
    }
  };

  const upvoteTopic = (topicId: string) => {
    const topic = forumTopics.find(t => t.id === topicId);
    if (!topic || topic.authorId === currentUser.id) return; // no self-votes
    setForumTopics(prev =>
      prev.map(t => {
        if (t.id !== topicId) return t;
        const already = t.upvotes.includes(currentUser.id);
        const upvotes = already
          ? t.upvotes.filter(id => id !== currentUser.id)
          : [...t.upvotes, currentUser.id];
        return { ...t, upvotes };
      })
    );
  };

  // Closed (members-only) chat rooms
  const sendChatMessage = (roomId: string, text: string) => {
    const room = chatRooms.find(r => r.id === roomId);
    if (!room || !canAccessRoom(room, currentUser.role)) return;

    const newMsg = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderRole: currentUser.role,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatRooms(prev =>
      prev.map(r => {
        if (r.id !== roomId) return r;
        return {
          ...r,
          messages: [...r.messages, newMsg],
        };
      })
    );
  };

  // Virtual Shop & Avatar
  const buyShopItem = (itemId: string): boolean => {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return false;
    if (currentUser.coins < item.priceCoins) {
      alert('Недостаточно Шаңырақ Коинов! Участвуйте в событиях и читайте книги для пополнения баланса.');
      return false;
    }
    if (currentUser.inventory.ownedItemIds.includes(itemId)) {
      return false;
    }

    if (!grantRewardOnce(`purchase:${itemId}:${currentUser.id}`, currentUser.id, 25, -item.priceCoins, `Покупка предмета «${item.nameRu}»`)) {
      return false;
    }

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        return {
          ...u,
          inventory: {
            ...u.inventory,
            ownedItemIds: [...u.inventory.ownedItemIds, itemId],
          },
        };
      })
    );

    try {
      confetti({ particleCount: 50, spread: 80, origin: { y: 0.6 } });
    } catch {}

    return true;
  };

  const equipShopItem = (itemId: string, category: ItemCategory) => {
    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        const inv = { ...u.inventory };
        if (category === 'avatar') inv.equippedAvatarSkin = itemId;
        if (category === 'frame') inv.equippedFrame = itemId;
        if (category === 'aura') inv.equippedAura = itemId;
        if (category === 'headwear') inv.equippedHeadwear = itemId;
        if (category === 'artifact') inv.equippedArtifact = itemId;
        return { ...u, inventory: inv };
      })
    );
  };

  const unequipShopItem = (category: ItemCategory) => {
    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== currentUser.id) return u;
        const inv = { ...u.inventory };
        if (category === 'avatar') inv.equippedAvatarSkin = undefined;
        if (category === 'frame') inv.equippedFrame = undefined;
        if (category === 'aura') inv.equippedAura = undefined;
        if (category === 'headwear') inv.equippedHeadwear = undefined;
        if (category === 'artifact') inv.equippedArtifact = undefined;
        return { ...u, inventory: inv };
      })
    );
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => (n.userId === currentUser.id ? { ...n, read: true } : n)));
  };

  const togglePushNotifications = async (): Promise<boolean> => {
    const granted = await requestWebPushPermission();
    setAllUsers(prev =>
      prev.map(u => (u.id === currentUser.id ? { ...u, pushNotificationsEnabled: granted } : u))
    );
    if (granted) {
      sendLocalPushNotification(
        'SHANYRAQ HUB: Уведомления активированы',
        'Вы будете оперативно получать анонсы встреч и клубные напоминания.'
      );
    }
    return granted;
  };

  const updateUserRole = (targetUserId: string, newRole: UserRole) => {
    const target = allUsers.find(u => u.id === targetUserId);
    if (!target || target.role === newRole) return;
    if (!canAssignRole(currentUser.role, currentUser.id, targetUserId, target.role, newRole)) {
      alert('Недостаточно прав для назначения этой роли.');
      return;
    }
    if (target.role === 'super_admin' && allUsers.filter(u => u.role === 'super_admin').length <= 1) {
      alert('Нельзя понизить последнего Super Admin.');
      return;
    }
    setAllUsers(prev =>
      prev.map(u => (u.id === targetUserId ? { ...u, role: newRole } : u))
    );
    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'ROLE_UPDATE',
        target: `${target.name}: ${target.role} -> ${newRole}`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Смена роли пользователю администратором ${currentUser.name}`,
      },
      ...prev,
    ]);
  };

  const adjustUserCoins = (targetUserId: string, amount: number, reason: string): boolean => {
    const target = allUsers.find(u => u.id === targetUserId);
    if (!target || !hasRole(currentUser.role, 'admin')) {
      alert('Корректировать баланс могут только администраторы.');
      return false;
    }
    if (targetUserId === currentUser.id) {
      alert('Нельзя изменять собственный баланс.');
      return false;
    }
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000 || !reason.trim()) {
      alert('Укажите сумму (от -10000 до 10000, не 0) и причину.');
      return false;
    }
    if (target.coins + amount < 0) {
      alert(`Недостаточно коинов: на балансе ${target.coins}.`);
      return false;
    }
    addXpAndCoins(targetUserId, 0, amount, reason);
    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'COIN_ADJUST',
        target: `${target.name} (${amount > 0 ? '+' : ''}${amount} coins)`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: reason,
      },
      ...prev,
    ]);
    return true;
  };

  const dispatchBroadcast = (
    title: string,
    content: string,
    channels: ('push' | 'telegram' | 'whatsapp')[],
    directionTarget?: string
  ) => {
    const targetUsers = allUsers.filter(u => {
      if (!directionTarget || directionTarget === 'all') return true;
      return u.directions.includes(directionTarget as DirectionId);
    });

    const newNotifs: AppNotification[] = targetUsers.map(u => ({
      id: `notif-broad-${Date.now()}-${u.id}`,
      userId: u.id,
      type: 'broadcast',
      title: `🏛 Shanyraq Hub: ${title}`,
      message: content,
      timestamp: 'Только что',
      read: false,
      linkTab: 'events',
    }));

    setNotifications(prev => [...newNotifs, ...prev]);

    if (channels.includes('push')) {
      sendLocalPushNotification(`Shanyraq Hub: ${title}`, content);
    }

    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'BROADCAST_DISPATCH',
        target: `${targetUsers.length} адресатов (${channels.join(', ')})`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Тема: ${title}`,
      },
      ...prev,
    ]);

    try {
      confetti({ particleCount: 35, spread: 70 });
    } catch {}
  };

  const addPeerReview = (
    targetUserId: string,
    rating: number,
    comment: string,
    aspect: PeerReview['aspect']
  ) => {
    if (targetUserId === currentUser.id) return; // no self-reviews
    const target = allUsers.find(u => u.id === targetUserId);
    if (!target) return;
    // One review per author, target and aspect.
    if (target.peerReviews.some(r => r.authorId === currentUser.id && r.aspect === aspect)) {
      alert('Вы уже оставляли отзыв этому участнику по этому критерию.');
      return;
    }

    const review: PeerReview = {
      id: `review-${Date.now()}`,
      targetUserId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRole: currentUser.role,
      rating,
      comment,
      aspect,
      createdAt: new Date().toLocaleDateString('ru-RU'),
    };

    setAllUsers(prev =>
      prev.map(u => {
        if (u.id !== targetUserId) return u;
        return {
          ...u,
          peerReviews: [review, ...u.peerReviews],
          reputationPoints: u.reputationPoints + rating * 3,
        };
      })
    );

    grantRewardOnce(
      `review_recv:${currentUser.id}:${aspect}:${targetUserId}`,
      targetUserId,
      40,
      25,
      `Отзыв от участника ${currentUser.name}`
    );
    recordActivity(currentUser.id);
    grantRewardOnce(
      `review_given:${targetUserId}:${aspect}:${currentUser.id}`,
      currentUser.id,
      20,
      10,
      'Оставлен отзыв об участнике',
      { group: 'review_given', dailyCap: 3 }
    );

    setNotifications(prev => [
      {
        id: `notif-rev-${Date.now()}`,
        userId: targetUserId,
        type: 'review',
        title: 'Новый отзыв в вашем профиле',
        message: `${currentUser.name} оставил(а) о вас теплый отзыв: «${comment.slice(0, 60)}...» (+25 коинов).`,
        timestamp: 'Только что',
        read: false,
        linkTab: 'profile',
      },
      ...prev,
    ]);
  };

  // ---------------------------------------------------------------------------
  // Achievements: unlocked only from verified activity (see data/achievements.ts)
  // ---------------------------------------------------------------------------
  const achievementData = (userId: string) => ({
    users: allUsers,
    events,
    forumTopics,
    streak: getActivityStreak(userId),
    weekStreak: getWeekStreak(userId),
  });

  const getAchievementProgress = (userId: string, achievementId: string): number => {
    const ach = ALL_ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!ach?.rule) return 0;
    return getAchievementMetric(userId, ach.rule, achievementData(userId));
  };

  const unlockAchievement = (userId: string, ach: Achievement): boolean => {
    const user = allUsers.find(u => u.id === userId);
    if (!user || user.achievements.some(a => a.id === ach.id)) return false;

    const unlockedAt = new Date().toISOString().slice(0, 10);
    setAllUsers(prev =>
      prev.map(u =>
        u.id !== userId || u.achievements.some(a => a.id === ach.id)
          ? u
          : { ...u, achievements: [...u.achievements, { ...ach, isUnlocked: true, unlockedAt }] }
      )
    );
    grantRewardOnce(`achievement:${ach.id}:${userId}`, userId, ach.xpReward, ach.coinReward, `Достижение «${ach.titleRu}»`);

    const notifId = `notif-ach-${ach.id}-${userId}`;
    setNotifications(prev =>
      prev.some(n => n.id === notifId)
        ? prev
        : [
            {
              id: notifId,
              userId,
              type: 'achievement',
              title: 'Новое достижение!',
              message: `Открыто «${ach.titleRu}»: +${ach.xpReward} XP и +${ach.coinReward} коинов.`,
              timestamp: 'Только что',
              read: false,
              linkTab: 'achievements',
            },
            ...prev,
          ]
    );

    if (userId === currentUser.id) {
      try {
        confetti({ particleCount: 70, spread: 75, origin: { y: 0.6 }, colors: ['#dfcfb3', '#f5d77f', '#ffffff'] });
      } catch {}
    }
    return true;
  };

  // Re-check automatic achievements whenever verified data changes.
  // Each unlock is idempotent (achievement already on the profile + reward key).
  useEffect(() => {
    allUsers.forEach(user => {
      const data = achievementData(user.id);
      ALL_ACHIEVEMENTS.forEach(ach => {
        if (!ach.rule || isManualAchievement(ach)) return;
        if (user.achievements.some(a => a.id === ach.id)) return;
        if (getAchievementMetric(user.id, ach.rule, data) >= ach.rule.threshold) {
          unlockAchievement(user.id, ach);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, events, forumTopics, activityLog]);

  const awardAchievement = (userId: string, achievementId: string, note: string): boolean => {
    const ach = ALL_ACHIEVEMENTS.find(a => a.id === achievementId);
    const target = allUsers.find(u => u.id === userId);
    if (!ach || !target) return false;
    if (!hasRole(currentUser.role, 'moderator')) {
      alert('Выдавать достижения могут только модераторы и администраторы.');
      return false;
    }
    if (userId === currentUser.id) {
      alert('Нельзя выдать достижение самому себе.');
      return false;
    }
    if (!isManualAchievement(ach)) {
      alert('Это достижение открывается автоматически за активность.');
      return false;
    }
    if (!unlockAchievement(userId, ach)) {
      alert(`У участника уже есть достижение «${ach.titleRu}».`);
      return false;
    }
    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'ACHIEVEMENT_AWARD',
        target: `${target.name}: ${ach.titleRu}`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: note.trim() || 'Без комментария',
      },
      ...prev,
    ]);
    return true;
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        activeTab,
        setActiveTab,
        currentUser,
        allUsers,
        switchCurrentUser,
        updateProfile,
        selectedUserModal,
        setSelectedUserModal,
        events,
        registerForEvent,
        cancelEventRegistration,
        checkInAttendance,
        submitEventFeedback,
        createEvent,
        allReadBooks,
        addReadBook,
        forumTopics,
        createForumTopic,
        replyToForumTopic,
        upvoteReply,
        upvoteTopic,
        chatRooms,
        sendChatMessage,
        buyShopItem,
        equipShopItem,
        unequipShopItem,
        coinTransactions,
        auditLogs,
        notifications,
        markAllNotificationsAsRead,
        togglePushNotifications,
        updateUserRole,
        adjustUserCoins,
        dispatchBroadcast,
        addPeerReview,
        getActivityStreak,
        getWeekStreak,
        getAchievementProgress,
        awardAchievement,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
