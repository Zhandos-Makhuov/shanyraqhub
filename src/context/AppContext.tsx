import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '../types';
import { TRANSLATIONS } from '../data/translations';
import { INITIAL_USERS, INITIAL_EVENTS, INITIAL_FORUM_TOPICS, INITIAL_CHAT_ROOMS, INITIAL_COIN_TRANSACTIONS, INITIAL_AUDIT_LOGS, INITIAL_NOTIFICATIONS } from '../data/mockData';
import { SHOP_ITEMS, TIERS } from '../data/gamification';
import { sendLocalPushNotification, requestWebPushPermission } from '../utils/notifications';
import { simulateEncrypt } from '../utils/crypto';

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
  checkInAttendance: (eventId: string, userId?: string) => void;
  submitEventFeedback: (eventId: string, satisfaction: number, usefulness: number, comment: string) => void;
  createEvent: (newEventData: Partial<CommunityEvent>) => void;

  allReadBooks: (ReadBook & { readerName: string; readerAvatar: string; readerId: string })[];
  addReadBook: (book: Omit<ReadBook, 'id'>) => void;

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
  adjustUserCoins: (targetUserId: string, amount: number, reason: string) => void;
  dispatchBroadcast: (title: string, content: string, channels: ('push' | 'telegram' | 'whatsapp')[], directionTarget?: string) => void;

  addPeerReview: (targetUserId: string, rating: number, comment: string, aspect: PeerReview['aspect']) => void;
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
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return allUsers[0]?.id || 'user-admin-1';
  });

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

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('shanyraq_lang', lang);
  };

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.ru;
    return dict[key] || TRANSLATIONS.ru[key] || key;
  };

  const currentUser = allUsers.find(u => u.id === currentUserId) || allUsers[0];

  const switchCurrentUser = (userId: string) => {
    setCurrentUserId(userId);
  };

  // XP progression & tier calculation
  const recalculateTier = (xp: number) => {
    if (xp >= TIERS.tengri.minXp) return 'tengri';
    if (xp >= TIERS.titanium.minXp) return 'titanium';
    if (xp >= TIERS.platinum.minXp) return 'platinum';
    if (xp >= TIERS.gold.minXp) return 'gold';
    if (xp >= TIERS.silver.minXp) return 'silver';
    return 'bronze';
  };

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

  const updateProfile = (updated: Partial<UserProfile>) => {
    setAllUsers(prev =>
      prev.map(u => (u.id === currentUser.id ? { ...u, ...updated } : u))
    );
  };

  // Event Registrations
  const registerForEvent = (eventId: string) => {
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

  const checkInAttendance = (eventId: string, targetUserId?: string) => {
    const uid = targetUserId || currentUser.id;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return;

    if (ev.attendedUserIds.includes(uid)) {
      return; // Already checked in
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

    addXpAndCoins(uid, 60, 40, `Подтверждение визита на «${ev.title}»`);

    try {
      confetti({ particleCount: 50, spread: 80, origin: { y: 0.6 } });
    } catch {}
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

    addXpAndCoins(currentUser.id, 30, 20, 'Обратная связь по мероприятию');
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

    addXpAndCoins(currentUser.id, 50, 30, `Добавление книги «${book.title}» в библиотеку`);

    try {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
    } catch {}
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
    addXpAndCoins(currentUser.id, 30, 15, 'Создание темы на форуме');
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

    addXpAndCoins(currentUser.id, 20, 10, 'Ответ в обсуждении форума');
  };

  const upvoteReply = (topicId: string, replyId: string) => {
    setForumTopics(prev =>
      prev.map(t => {
        if (t.id !== topicId) return t;
        return {
          ...t,
          replies: t.replies.map(r => {
            if (r.id !== replyId) return r;
            const already = r.upvotes.includes(currentUser.id);
            const upvotes = already
              ? r.upvotes.filter(id => id !== currentUser.id)
              : [...r.upvotes, currentUser.id];
            if (!already) {
              addXpAndCoins(r.authorId, 15, 10, 'Полезный ответ на форуме');
            }
            return { ...r, upvotes };
          }),
        };
      })
    );
  };

  const upvoteTopic = (topicId: string) => {
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

  // Encrypted Chat
  const sendChatMessage = (roomId: string, text: string) => {
    const room = chatRooms.find(r => r.id === roomId);
    const key = room?.encryptionFingerprint || 'SHANYRAQ-KEY';
    const { cipherText } = simulateEncrypt(text, key);

    const newMsg = {
      id: `msg-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderAvatar: currentUser.avatar,
      senderRole: currentUser.role,
      text,
      encryptedHash: cipherText.slice(0, 24),
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

    addXpAndCoins(currentUser.id, 25, -item.priceCoins, `Покупка предмета «${item.nameRu}»`);

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
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
    setAllUsers(prev =>
      prev.map(u => (u.id === targetUserId ? { ...u, role: newRole } : u))
    );
    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'ROLE_UPDATE',
        target: `${targetUserId} -> ${newRole}`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: `Смена роли пользователю администратором ${currentUser.name}`,
      },
      ...prev,
    ]);
  };

  const adjustUserCoins = (targetUserId: string, amount: number, reason: string) => {
    addXpAndCoins(targetUserId, 0, amount, reason);
    setAuditLogs(prev => [
      {
        id: `audit-${Date.now()}`,
        adminId: currentUser.id,
        adminName: currentUser.name,
        action: 'COIN_ADJUST',
        target: `${targetUserId} (${amount > 0 ? '+' : ''}${amount} coins)`,
        timestamp: new Date().toLocaleDateString('ru-RU') + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        details: reason,
      },
      ...prev,
    ]);
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

    addXpAndCoins(targetUserId, 40, 25, `Отзыв от участника ${currentUser.name}`);
    addXpAndCoins(currentUser.id, 20, 10, 'Оставлен отзыв об участнике');

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
