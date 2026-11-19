import { ReadBook } from '../types';
import { weekStartDay } from './streak';

/**
 * Books are self-reported, so a book only "counts" (reward + book achievements)
 * when it is finished AND has a real review, and at most one book per week counts.
 * Mirrors the rule in the proposed Supabase schema (save_user_book / books_completed).
 */
export const MIN_REVIEW_CHARS = 100;

export const reviewLength = (review?: string): number => (review || '').trim().length;

/** Finished book with a review of at least MIN_REVIEW_CHARS characters. */
export const hasQualifyingReview = (book: Pick<ReadBook, 'status' | 'review'>): boolean =>
  book.status === 'completed' && reviewLength(book.review) >= MIN_REVIEW_CHARS;

const bookWeek = (book: Pick<ReadBook, 'dateFinished'>): string | null => {
  const [y, m, d] = (book.dateFinished || '').split('-').map(Number);
  return y && m && d ? weekStartDay(new Date(y, m - 1, d)) : null;
};

/** Number of credited books: qualifying books, at most one per week (Mon–Sun). */
export const countCreditedBooks = (books: ReadBook[]): number =>
  new Set(books.filter(hasQualifyingReview).map(bookWeek).filter(Boolean)).size;

/** Would a book finished on `day` be credited, given the member's other books? */
export const isWeekFreeForCredit = (books: ReadBook[], day: string, excludeBookId?: string): boolean => {
  const week = bookWeek({ dateFinished: day });
  return !books.some(b => b.id !== excludeBookId && hasQualifyingReview(b) && bookWeek(b) === week);
};
