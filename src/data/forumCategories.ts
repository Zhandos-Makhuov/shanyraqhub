import { ForumCategory } from '../types';

/**
 * Forum sections (reference data, not demo data). The same list is written into supabase/seed.sql
 * (scripts/generate-seed.ts → public.forum_categories). In live mode the site reads the sections from the
 * database instead, so a section added there appears without a rebuild. A topic's section is always one of
 * these ids — never a club direction id (directions and forum sections are different lists).
 */
export const FORUM_CATEGORIES: ForumCategory[] = [
  { id: 'books', nameRu: 'Книжная полка & Рецензии', nameKz: 'Кітап сөресі & Пікірлер', nameEn: 'Book Shelf & Reviews' },
  { id: 'english', nameRu: 'Speaking English Club', nameKz: 'Speaking English Club', nameEn: 'Speaking English Club' },
  { id: 'arabic', nameRu: 'Арабский язык & Каллиграфия', nameKz: 'Араб тілі & Каллиграфия', nameEn: 'Arabic & Calligraphy' },
  { id: 'sport', nameRu: 'Спорт и бег Tarlan', nameKz: 'Tarlan спорт және жүгіру', nameEn: 'Tarlan Sports & Running' },
  { id: 'art', nameRu: 'Арт-терапия и керамика', nameKz: 'Арт-терапия және керамика', nameEn: 'Art Therapy & Ceramics' },
  { id: 'intellect', nameRu: 'Интеллектуальные игры Zerde', nameKz: 'Zerde зияткерлік ойындары', nameEn: 'Zerde Intellectual Games' },
  { id: 'general', nameRu: 'Общие анонсы и идеи', nameKz: 'Жалпы хабарландырулар', nameEn: 'General Announcements & Ideas' },
];

/** Limits of the database (core schema): the form checks the same numbers before sending. */
export const FORUM_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  contentMax: 20000,
  replyMax: 10000,
  chatMax: 4000,
} as const;
