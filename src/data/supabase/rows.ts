/**
 * Row shapes of the Supabase tables (supabase/migrations/*), written by hand.
 * Only the columns the app reads. Not imported by the app yet: used by
 * ./adapters.ts, which will be wired in when Supabase is connected (stage 6).
 */
import type { DirectionId, ItemCategory, Language } from '../../types';

export type DbRole = 'member' | 'organizer' | 'moderator' | 'admin' | 'superadmin';
export type DbMembershipStatus = 'pending' | 'active' | 'rejected' | 'left' | 'removed';

export interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  city: string | null;
  telegram_handle: string | null;
  directions: DirectionId[];
  preferred_language: Language;
  push_notifications_enabled: boolean;
  telegram_notifications_enabled: boolean;
  created_at: string;
}

export interface UserRoleRow { user_id: string; role: DbRole }
export interface UserBalanceRow { user_id: string; xp: number; coins: number }
export interface ProfileContactRow { user_id: string; phone: string | null }

export interface MembershipRow {
  id: string;
  user_id: string;
  direction: DirectionId;
  status: DbMembershipStatus;
  role: 'member' | 'lead';
  created_at: string;
}

export interface EventRow {
  id: string;
  title: string;
  direction: DirectionId;
  starts_at: string;
  duration_minutes: number;
  format: 'offline' | 'online';
  location_address: string | null;
  location_details: string | null;
  online_url: string | null;
  description: string;
  required_materials: string[];
  capacity: number;
  registration_deadline: string | null;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  speaker_name: string | null;
  speaker_role: string | null;
  speaker_avatar_url: string | null;
  speaker_bio: string | null;
  cover_url: string | null;
  created_by: string | null;
}

export interface EventRegistrationRow {
  event_id: string;
  user_id: string;
  status: 'registered' | 'cancelled' | 'waitlisted';
  registered_at: string;
}

export interface EventAttendanceRow { event_id: string; user_id: string; checked_in_at: string }

export interface EventFeedbackRow {
  event_id: string;
  user_id: string;
  satisfaction: number;
  usefulness: number;
  comment: string;
  created_at: string;
}

export interface BookRow {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  cover_color: string | null;
  cover_url: string | null;
}

export interface UserBookRow {
  id: string;
  user_id: string;
  book_id: string;
  status: 'reading' | 'completed';
  rating: number | null;
  review: string | null;
  finished_at: string | null;
}

export interface PeerReviewRow {
  id: string;
  author_id: string;
  target_id: string;
  rating: number;
  aspect: 'communication' | 'inspiration' | 'knowledge' | 'teamwork';
  comment: string;
  is_hidden: boolean;
  created_at: string;
}

export interface UserAchievementRow { user_id: string; achievement_id: string; unlocked_at: string }
export interface AchievementRevocationRow { user_id: string; achievement_id: string; lifted_at: string | null }
export interface UserInventoryRow { user_id: string; item_id: string }
export interface UserEquipmentRow { user_id: string; category: ItemCategory; item_id: string }
