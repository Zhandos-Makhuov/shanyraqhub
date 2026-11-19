export type Language = 'ru' | 'kz' | 'en';

export type UserRole = 'super_admin' | 'admin' | 'moderator' | 'organizer' | 'member';

export type DirectionId = 'books' | 'english' | 'arabic' | 'sport' | 'art' | 'intellect' | 'networking' | 'general';

export type TierLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'titanium' | 'tengri';

export interface TierInfo {
  tier: TierLevel;
  /** Extra coins for verified event attendance, in percent (silver 10 … tengri 30). */
  attendanceCoinBonusPercent: number;
  nameRu: string;
  nameKz: string;
  nameEn: string;
  minXp: number;
  badgeIcon: string;
  color: string;
  textColor: string;
  glowColor: string;
  bgGradient: string;
  privilegeRu: string;
  privilegeKz: string;
  privilegeEn: string;
}

export interface Direction {
  id: DirectionId;
  nameRu: string;
  nameKz: string;
  nameEn: string;
  shortNameRu: string;
  shortNameKz: string;
  shortNameEn: string;
  icon: string;
  color: string;
  descriptionRu: string;
  descriptionKz: string;
  descriptionEn: string;
}

export interface ReadBook {
  id: string;
  title: string;
  author: string;
  genre: string;
  userRating: number;
  review?: string;
  dateFinished: string;
  coverColor?: string;
  status: 'completed' | 'reading';
}

export interface AttendedEventRecord {
  eventId: string;
  title: string;
  date: string;
  direction: DirectionId;
  status: 'registered' | 'attended' | 'cancelled';
  checkInTime?: string;
  feedbackGiven?: boolean;
}

export type AchievementMetric =
  | 'books_completed'
  | 'books_reviewed'
  | 'events_attended'
  | 'event_directions'
  | 'feedback_given'
  | 'positive_reviews_received'
  | 'reviews_given'
  | 'forum_topics'
  | 'forum_replies'
  | 'upvotes_received'
  | 'activity_streak'
  | 'activity_week_streak'
  | 'events_hosted'
  | 'well_rated_events_hosted'
  | 'manual';

/** How an achievement is unlocked. See src/data/achievements.ts. */
export interface AchievementRule {
  metric: AchievementMetric;
  threshold: number;
  /** Only for `events_attended`: count one club direction. */
  direction?: DirectionId;
}

export interface Achievement {
  id: string;
  titleRu: string;
  titleKz: string;
  titleEn: string;
  icon: string;
  descriptionRu: string;
  descriptionKz: string;
  descriptionEn: string;
  category: 'books' | 'community' | 'english' | 'sport' | 'general' | 'challenges';
  unlockedAt?: string;
  isUnlocked: boolean;
  requiredCount?: number;
  currentCount?: number;
  xpReward: number;
  coinReward: number;
  rule?: AchievementRule;
}

export interface PeerReview {
  id: string;
  targetUserId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: UserRole;
  rating: number; // 1 to 5
  comment: string;
  aspect: 'communication' | 'inspiration' | 'knowledge' | 'teamwork';
  createdAt: string;
}

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ItemCategory = 'avatar' | 'frame' | 'artifact' | 'aura' | 'headwear';

export interface ShopItem {
  id: string;
  nameRu: string;
  nameKz: string;
  nameEn: string;
  descriptionRu: string;
  descriptionKz: string;
  descriptionEn: string;
  category: ItemCategory;
  rarity: ItemRarity;
  priceCoins: number;
  previewUrl: string;
  borderStyle?: string;
  glowStyle?: string;
  badgeTitle?: string;
}

export interface UserInventory {
  ownedItemIds: string[];
  equippedAvatarSkin?: string;
  equippedFrame?: string;
  equippedAura?: string;
  equippedHeadwear?: string;
  equippedArtifact?: string;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'earn' | 'spend';
  reasonRu: string;
  reasonKz: string;
  reasonEn: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  /** Live: directions the member applied to, waiting for approval. */
  pendingDirections?: DirectionId[];
  name: string;
  email: string;
  handle: string;
  role: UserRole;
  avatar: string;
  bio: string;
  city: string;
  telegram?: string;
  phone?: string;
  joinedDate: string;
  directions: DirectionId[];
  xp: number;
  coins: number;
  tier: TierLevel;
  reputationPoints: number;
  readBooks: ReadBook[];
  attendedEvents: AttendedEventRecord[];
  achievements: Achievement[];
  peerReviews: PeerReview[];
  inventory: UserInventory;
  preferredLanguage: Language;
  telegramNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  /** Achievements revoked by an admin: never auto-unlocked again. */
  revokedAchievementIds?: string[];
}

export interface EventFeedback {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  satisfactionRating: number; // 1 to 5
  usefulnessRating: number; // 1 to 5
  comment: string;
  createdAt: string;
}

export interface EventSpeaker {
  name: string;
  role: string;
  avatar: string;
  bio?: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  direction: DirectionId;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMinutes: number;
  format: 'offline' | 'online';
  locationAddress: string;
  locationDetails?: string;
  description: string;
  requiredMaterials: string[];
  maxCapacity: number;
  registrationDeadline: string;
  registeredUserIds: string[];
  attendedUserIds: string[];
  speaker: EventSpeaker;
  /** Member who hosts/organizes the event (for host achievements). */
  hostId?: string;
  feedbacks: EventFeedback[];
  isCompleted?: boolean;
}

export interface ForumReply {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: UserRole;
  content: string;
  createdAt: string;
  upvotes: string[];
}

export interface ForumTopic {
  id: string;
  categoryId: string;
  categoryNameRu: string;
  categoryNameKz: string;
  categoryNameEn: string;
  direction?: DirectionId;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole: UserRole;
  createdAt: string;
  upvotes: string[];
  views: number;
  replies: ForumReply[];
  isPinned?: boolean;
  isClosed?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole: UserRole;
  text: string;
  encryptedHash?: string;
  timestamp: string;
  isSystem?: boolean;
}

export interface EncryptedChatRoom {
  id: string;
  titleRu: string;
  titleKz: string;
  titleEn: string;
  direction?: DirectionId;
  descriptionRu: string;
  descriptionKz: string;
  descriptionEn: string;
  isEndToEndEncrypted: boolean;
  encryptionFingerprint: string;
  memberCount: number;
  accessLevel: 'all' | 'verified' | 'moderators';
  messages: ChatMessage[];
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'event_reminder' | 'new_event' | 'forum_reply' | 'achievement' | 'broadcast' | 'review' | 'coin_reward' | 'level_up';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  linkTab?: 'events' | 'forum' | 'profile' | 'members' | 'achievements' | 'library' | 'attendance' | 'leaderboard' | 'shop';
  actionMeta?: string;
}

export interface BroadcastLog {
  id: string;
  title: string;
  content: string;
  channels: ('push' | 'telegram' | 'whatsapp')[];
  directionTarget?: string;
  recipientsCount: number;
  sentAt: string;
  senderName: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  target: string;
  timestamp: string;
  details: string;
}
