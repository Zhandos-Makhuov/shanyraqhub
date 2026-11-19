/**
 * Club chat rooms (reference data, not demo): seeded into public.chat_rooms by scripts/generate-seed.ts.
 * Owner decision (stage 6.4): the same three rooms as in the demo, without messages.
 * Access is enforced by the database (RLS on min_role); ids are fixed so the seed can upsert.
 */
import type { DirectionId, UserRole } from '../types';

export interface ChatRoomDefinition {
  id: string;
  titleRu: string;
  titleKz: string;
  titleEn: string;
  descriptionRu: string;
  descriptionKz: string;
  descriptionEn: string;
  direction?: DirectionId;
  /** Lowest role that can read and write (database: chat_rooms.min_role). */
  minRole: Exclude<UserRole, 'super_admin'>;
}

export const CHAT_ROOM_DEFINITIONS: ChatRoomDefinition[] = [
  {
    id: 'c0a1b2c3-0000-4000-8000-000000000001',
    titleRu: 'Книжный Совет «Шаңырақ»',
    titleKz: '«Шаңырақ» Кітап Кеңесі',
    titleEn: 'Shanyraq Literary Council',
    descriptionRu: 'Закрытый канал для координации литературных чтений, голосования за авторов месяца и обмена редкими книгами.',
    descriptionKz: 'Әдеби оқуларды үйлестіруге және ай авторын дауыс беру арқылы таңдауға арналған жабық чат.',
    descriptionEn: 'Curated literary discussions, book selection polls, and rare edition exchanges.',
    direction: 'books',
    minRole: 'member',
  },
  {
    id: 'c0a1b2c3-0000-4000-8000-000000000002',
    titleRu: 'Til-Talk Speakers Lounge',
    titleKz: 'Til-Talk Сөйлесу Бөлмесі',
    titleEn: 'Til-Talk Speakers Lounge',
    // Open to all members (the database does not restrict rooms by direction), so no "only for…" claim.
    descriptionRu: 'Англоязычная комната Speaking Club: ежедневная практика, аудио-заметки и разбор идиом.',
    descriptionKz: 'Speaking Club ағылшын тіліндегі күнделікті тәжірибе бөлмесі.',
    descriptionEn: 'Daily English-only circle with idiom breakdowns and voice prompts.',
    direction: 'english',
    minRole: 'member',
  },
  {
    id: 'c0a1b2c3-0000-4000-8000-000000000003',
    titleRu: 'Совет Модераторов & Безопасность',
    titleKz: 'Модераторлар Кеңесі & Қауіпсіздік',
    titleEn: 'Council of Stewards & Security',
    descriptionRu: 'Закрытый канал администрации: верификация анкет, аудит ролей, согласование бюджета мероприятий.',
    descriptionKz: 'Әкімшілік пен модераторларға арналған қауіпсіз үйлестіру каналы.',
    descriptionEn: 'Restricted administrative channel for audit logs and event scheduling.',
    minRole: 'moderator',
  },
];
