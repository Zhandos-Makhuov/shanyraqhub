/** Book genres: stored in Russian (the value saved with the book), shown through translation keys. */
export const BOOK_GENRES = [
  ['Классика / Философия', 'libGenre0'],
  ['Исторический эпос', 'libGenre1'],
  ['Когнитивная психология', 'libGenre2'],
  ['Саморазвитие и привычки', 'libGenre3'],
  ['Бизнес и лидерство', 'libGenre4'],
  ['Художественная проза', 'libGenre5'],
  ['Научпоп и космология', 'libGenre6'],
] as const;

/** The genre in the current language (unknown genres are shown as written). */
export const genreLabel = (genre: string, t: (key: string) => string) => {
  const key = BOOK_GENRES.find(g => g[0] === genre)?.[1];
  return key ? t(key) : genre;
};
