import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MIN_REVIEW_CHARS, isWeekFreeForCredit, reviewLength } from '../utils/bookCredit';
import { toLocalDay } from '../utils/streak';
import { formatShortDate } from '../utils/eventTime';
import { useApp } from '../context/AppContext';
import { BookOpen, Plus, Search, Star, CheckCircle, X, BookMarked, MessageSquare } from 'lucide-react';
import { ReadBook, UserProfile } from '../types';
import { BOOK_GENRES, genreLabel } from '../data/bookGenres';
import { isDemoData } from '../config/runtime';
import { useDialog } from '../hooks/useDialog';
import { setForumIntent, takeLibraryIntent } from '../utils/navIntent';
import { AvatarWithFallback } from './ProfileParts';
import { ConfirmDialog } from './ForumPostTools';

/**
 * Books: a reading space built on the existing data only.
 * One "book" = all members' entries with the same title and author (that is how the
 * database identifies a book: unique lower(title), lower(author)). Statuses are the
 * existing two (reading / completed); saving goes through saveReadBook (same server rules in live:
 * credit only for a finished book with a 100+ char review, one per week) and reports errors to the form.
 */

/** For "is this book already in the club?": case, ё/е, quotes and punctuation do not matter. */
const looseText = (s: string) =>
  s.toLocaleLowerCase().replace(/ё/g, 'е').replace(/[«»"“”„'’`.,:;!?()\[\]—–-]+/g, ' ').replace(/\s+/g, ' ').trim();


type Entry = ReadBook & { readerName: string; readerAvatar: string; readerId: string };

interface BookGroup {
  key: string;
  title: string;
  author: string;
  genre: string;
  coverUrl?: string;
  coverColor?: string;
  entries: Entry[];
  /** Average of finished readers' ratings (as before: completed entries only). */
  avg: number | null;
  ratings: number;
  readingNow: Entry[];
  reviews: Entry[];
  mine?: Entry;
  lastDate: string;
}

const bookKey = (title: string, author: string) => `${title.trim().toLowerCase()}|${author.trim().toLowerCase()}`;

const Stars: React.FC<{ value: number; size?: string }> = ({ value, size = 'w-3 h-3' }) => (
  <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={`${value}/5`}>
    {[1, 2, 3, 4, 5].map(n => (
      <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-current' : 'opacity-30'}`} />
    ))}
  </span>
);

/**
 * Book cover. In lists — a fixed frame (`ratio`, 2:3 by default; 3:4 on narrow phones), the photo fills it (object-cover,
 * real covers lose a few percent at the edges). `natural`: the whole photo at its own proportions (book window).
 * Without a photo — a calm "book" made of its colour, title and author.
 */
const BookCover: React.FC<{ book: Pick<BookGroup, 'title' | 'author' | 'coverUrl' | 'coverColor'>; className?: string; small?: boolean; ratio?: string; natural?: boolean }> = ({ book, className = '', small, ratio = 'aspect-[2/3]', natural }) =>
  natural && book.coverUrl ? (
    <div aria-hidden="true" className={`relative rounded-lg overflow-hidden border border-black/30 shadow-md bg-[#1a1716] ${className}`}>
      <img src={book.coverUrl} alt="" className="block w-full h-auto" data-cover-natural />
    </div>
  ) : (
  // Decorative: the title and author are always written next to it (screen readers would hear them twice).
  <div aria-hidden="true" className={`relative ${ratio} rounded-lg overflow-hidden border border-black/30 shadow-md ${className}`}>
    {book.coverUrl ? (
      <img src={book.coverUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
    ) : (
      <div className="absolute inset-0 flex flex-col justify-between p-2.5" style={{ backgroundColor: book.coverColor || '#5a4a3a' }}>
        <span className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" />
        <span className="absolute left-0 inset-y-0 w-1.5 bg-black/25" />
        <span className="absolute inset-1.5 border border-white/10 rounded-[5px]" />
        <span className={`relative pl-1 font-display font-bold text-white/90 leading-tight ${small ? 'text-[9px] line-clamp-3' : 'text-[13px] line-clamp-4'}`}>{book.title}</span>
        <span className={`relative pl-1 text-white/70 truncate ${small ? 'text-[8px]' : 'text-[11px]'}`}>{book.author}</span>
      </div>
    )}
  </div>
  );

export const ReadingLibraryView: React.FC = () => {
  const { allReadBooks, allUsers, currentUser, saveReadBook, removeReadBook, setSelectedUserModal, setActiveTab, t } = useApp();

  const [scope, setScope] = useState<'club' | 'mine'>('club');
  const [sort, setSort] = useState<'recent' | 'rating' | 'readers'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  // Phase 5: the home page's "continue reading" opens the book's window directly.
  const [openKey, setOpenKey] = useState<string | null>(() => {
    const intent = takeLibraryIntent();
    return intent ? bookKey(intent.title, intent.author) : null;
  });
  const [reviewSort, setReviewSort] = useState<'newest' | 'top'>('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saved, setSaved] = useState<{ key: string; credited: boolean; shown: boolean } | null>(null);

  // Add / edit form state (same fields and rules as before)
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookGenre, setBookGenre] = useState('Классика / Философия');
  const [bookRating, setBookRating] = useState(5);
  const [bookReview, setBookReview] = useState('');
  const [bookStatus, setBookStatus] = useState<'completed' | 'reading'>('completed');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  // Editing one's own entry, or adding a book that is already in the club: title and author are fixed.
  const [editing, setEditing] = useState(false);
  const [lockTitle, setLockTitle] = useState(false);
  const [editingCoverUrl, setEditingCoverUrl] = useState<string | undefined>(undefined);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const formBusyRef = useRef(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openAdd = (prefill?: { title: string; author: string; genre: string; coverUrl?: string; status: 'completed' | 'reading' }) => {
    setEditing(false); setLockTitle(!!prefill); setEditingCoverUrl(prefill?.coverUrl); setEditingEntry(null); setFormError('');
    setBookTitle(prefill?.title ?? ''); setBookAuthor(prefill?.author ?? ''); setBookGenre(prefill?.genre || BOOK_GENRES[0][0]);
    setBookReview(''); setBookRating(5); setBookStatus(prefill?.status ?? 'completed'); setCoverFile(null);
    setOpenKey(null);
    setShowAddModal(true);
  };
  const openEdit = (item: Entry) => {
    setEditing(true); setLockTitle(true); setEditingCoverUrl(item.coverUrl); setEditingEntry(item); setFormError('');
    setBookTitle(item.title); setBookAuthor(item.author); setBookGenre(item.genre || BOOK_GENRES[0][0]);
    setBookRating(item.userRating || 5); setBookReview(item.review ?? ''); setBookStatus(item.status ?? 'completed'); setCoverFile(null);
    setOpenKey(null);
    setShowAddModal(true);
  };
  const coverPreview = useMemo(() => (coverFile ? URL.createObjectURL(coverFile) : null), [coverFile]);
  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  // S-3a: this book is already finished on my shelf -> "reading" is not offered.
  const finishedAlready = !!bookTitle.trim() && currentUser.readBooks.some(
    b => b.status === 'completed' && bookKey(b.title, b.author) === bookKey(bookTitle, bookAuthor),
  );
  // Live hint: will this book count for the reward and book achievements? (unchanged rule)
  const reviewChars = reviewLength(bookReview);
  const creditHint = (() => {
    if (bookStatus !== 'completed') return { ok: false, text: t('libHintOnlyCompleted') };
    if (reviewChars < MIN_REVIEW_CHARS) return { ok: false, text: t('libHintMoreChars').replace('{n}', String(MIN_REVIEW_CHARS - reviewChars)) };
    if (!isWeekFreeForCredit(currentUser.readBooks, toLocalDay())) return { ok: false, text: t('libHintWeekUsed') };
    return { ok: true, text: t('libHintOk') };
  })();

  // ---- Books grouped from members' entries --------------------------------------------
  const books: BookGroup[] = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of allReadBooks as Entry[]) {
      const k = bookKey(e.title, e.author);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()].map(([key, entries]) => {
      const rated = entries.filter(e => e.status === 'completed' && e.userRating > 0);
      const first = entries[0];
      return {
        key,
        title: first.title,
        author: first.author,
        genre: entries.find(e => e.genre)?.genre ?? '',
        coverUrl: entries.find(e => e.coverUrl)?.coverUrl,
        coverColor: entries.find(e => e.coverColor)?.coverColor,
        entries,
        avg: rated.length ? rated.reduce((s, e) => s + e.userRating, 0) / rated.length : null,
        ratings: rated.length,
        readingNow: entries.filter(e => e.status === 'reading'),
        reviews: entries.filter(e => e.review && e.review.trim()),
        mine: entries.find(e => e.readerId === currentUser.id),
        lastDate: entries.reduce((m, e) => (e.dateFinished > m ? e.dateFinished : m), ''),
      };
    });
  }, [allReadBooks, currentUser.id]);

  // Show "saved" only once the entry is really on the shelf (live: after the server refresh).
  useEffect(() => {
    if (saved && !saved.shown && books.some(b => b.key === saved.key && b.mine)) setSaved({ ...saved, shown: true });
  }, [books, saved]);
  useEffect(() => {
    if (!saved?.shown) return;
    const timer = window.setTimeout(() => setSaved(null), 5000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const q = searchQuery.trim().toLowerCase();
  const matches = (b: BookGroup) =>
    !q || [b.title, b.author, b.genre, genreLabel(b.genre, t), ...b.entries.map(e => e.readerName)].some(v => v.toLowerCase().includes(q));
  const sorted = books.filter(matches).sort((a, b) =>
    sort === 'rating' ? (b.avg ?? 0) - (a.avg ?? 0) || b.ratings - a.ratings
    : sort === 'readers' ? b.entries.length - a.entries.length
    : b.lastDate.localeCompare(a.lastDate));
  const myBooks = books.filter(b => b.mine && matches(b));
  const myReading = myBooks.filter(b => b.mine!.status === 'reading');
  const myDone = myBooks.filter(b => b.mine!.status === 'completed').sort((a, b) => b.mine!.dateFinished.localeCompare(a.mine!.dateFinished));

  const clubDone = allReadBooks.filter(b => b.status === 'completed');
  const ratedAll = clubDone.filter(b => b.userRating > 0);
  const clubAvg = ratedAll.length ? (ratedAll.reduce((s, b) => s + b.userRating, 0) / ratedAll.length).toFixed(1) : '—';
  const weekOpen = isWeekFreeForCredit(currentUser.readBooks, toLocalDay());
  const recentReviews = (allReadBooks as Entry[])
    .filter(e => e.review && e.review.trim() && e.status === 'completed')
    .sort((a, b) => b.dateFinished.localeCompare(a.dateFinished))
    .slice(0, 6);
  const open = books.find(b => b.key === openKey) ?? null;
  const memberOf = (id: string): UserProfile | undefined => allUsers.find(u => u.id === id);

  // The form closes only when the shelf really has the entry; on error it stays open with everything typed.
  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formBusyRef.current || !bookTitle.trim() || !bookAuthor.trim()) return;
    const coverColors = ['#967d58', '#4a433f', '#bfa882', '#475569', '#059669', '#1e1b4b', '#b91c1c'];
    const key = bookKey(bookTitle, bookAuthor);
    formBusyRef.current = true;
    setFormBusy(true);
    setFormError('');
    const r = await saveReadBook({
      title: bookTitle.trim(),
      author: bookAuthor.trim(),
      genre: bookGenre,
      // A rating belongs to a finished book; "reading" saves none.
      userRating: bookStatus === 'completed' ? bookRating : 0,
      review: bookReview.trim() || undefined,
      dateFinished: toLocalDay(),
      coverColor: coverColors[Math.floor(Math.random() * coverColors.length)],
      status: bookStatus,
    }, coverFile ?? undefined);
    formBusyRef.current = false;
    setFormBusy(false);
    if (!r.ok) {
      setFormError(t(r.error || 'authErrorGeneric'));
      return;
    }
    setSaved({ key, credited: !!r.credited, shown: false });
    if (r.coverError) setNotice(t(r.coverError));
    setShowAddModal(false);
    setCoverFile(null);
  };

  const closeForm = () => { if (!formBusyRef.current) setShowAddModal(false); };
  const formRef = useDialog<HTMLFormElement>(showAddModal && !confirmRemove, closeForm);
  const detailRef = useDialog<HTMLDivElement>(!!openKey && !showAddModal, () => setOpenKey(null));

  const doRemove = async () => {
    if (!editingEntry || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError('');
    const r = await removeReadBook(editingEntry.id);
    setRemoveBusy(false);
    if (!r.ok) {
      setRemoveError(t(r.error || 'authErrorGeneric'));
      return;
    }
    setConfirmRemove(false);
    setShowAddModal(false);
    setNotice(t('libRemoved').replace('{title}', editingEntry.title));
  };

  // Possible duplicates while typing a new book: same title (loosely), whoever the author is.
  const similar = useMemo(() => {
    if (lockTitle) return [];
    const tq = looseText(bookTitle);
    if (tq.length < 3) return [];
    return books
      .filter(b => {
        const bt = looseText(b.title);
        return bt === tq || (tq.length >= 4 && (bt.includes(tq) || tq.includes(bt)));
      })
      .slice(0, 3);
  }, [books, bookTitle, lockTitle]);
  const exactMatch = similar.find(b => b.key === bookKey(bookTitle, bookAuthor));

  const discuss = (b: { title: string; author: string }) => {
    setOpenKey(null);
    setForumIntent({ book: { title: b.title, author: b.author } });
    setActiveTab('forum');
  };

  // A render helper (not a nested component) so cards are not re-mounted on every render.
  const renderCard = (b: BookGroup, showMine?: boolean) => (
    <button
      key={b.key}
      onClick={() => { setReviewSort('newest'); setOpenKey(b.key); }}
      className="group text-left flex flex-col gap-1.5 sm:gap-2 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60 rounded-xl"
    >
      <div className="relative">
        {/* Phones (2 columns): a little shorter frame to cut scrolling; the cover photo still fills it (object-cover). */}
        <BookCover book={b} ratio="aspect-[3/4] min-[480px]:aspect-[2/3]" className="w-full transition-transform duration-200 group-hover:-translate-y-0.5" />
      </div>
      <span className="min-w-0">
        <span className="block font-display text-[13px] min-[360px]:text-[14px] font-bold leading-snug text-[#f5f2eb] group-hover:text-[#ecd9bf] line-clamp-2 break-words">{b.title}</span>
        <span className="block text-[12px] text-[#9e948c] truncate">{b.author}</span>
        {b.mine && !showMine && (
          <span className={`mt-1 inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
            b.mine.status === 'reading' ? 'bg-amber-900/50 text-amber-200' : 'bg-emerald-900/50 text-emerald-200'
          }`}>
            {b.mine.status === 'reading' ? t('libMyReading') : t('libMyRead')}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[#9e948c]">
          {showMine && b.mine?.status === 'completed' ? (
            <Stars value={b.mine.userRating} />
          ) : b.avg !== null ? (
            <>
              <Star className="w-3 h-3 text-amber-400 fill-current" />
              <span className="font-mono-numbers text-[#d6cebf]">{b.avg.toFixed(1)}</span>
              <span>· {b.entries.length}</span>
            </>
          ) : (
            <span>{t('libReadersCount').replace('{n}', String(b.entries.length))}</span>
          )}
        </span>
      </span>
    </button>
  );

  const grid = 'grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-5';

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 w-full max-w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#f5f2eb]">{t('libraryTitle')}</h1>
          <p className="text-[13px] text-[#9e948c] mt-0.5">{t('librarySubtitle')}</p>
        </div>
        <button onClick={() => openAdd()} aria-label={t('actionAddBook')} className="btn-primary shrink-0 px-3 sm:px-4" data-add-book>
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span className="hidden min-[400px]:inline">{t('actionAddBook')}</span>
        </button>
      </div>

      {/* My reading summary + the club in one quiet line */}
      <section className="rounded-2xl bg-gradient-to-br from-[#26211f] to-[#1d1a19] border border-[#3d3632] p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-[auto_auto_1fr] gap-2 sm:gap-6 items-center">
          <button onClick={() => setScope('mine')} className="text-left">
            <span className="block text-[11px] text-[#9e948c]">{t('libMyRead')}</span>
            <span className="text-xl font-bold font-mono-numbers text-[#f5f2eb]">{currentUser.readBooks.filter(b => b.status === 'completed').length}</span>
          </button>
          <button onClick={() => setScope('mine')} className="text-left">
            <span className="block text-[11px] text-[#9e948c]">{t('libMyReading')}</span>
            <span className="text-xl font-bold font-mono-numbers text-[#f5f2eb]">{currentUser.readBooks.filter(b => b.status === 'reading').length}</span>
          </button>
          <span className={`col-span-2 sm:col-span-1 inline-flex items-center gap-1.5 text-[12px] ${weekOpen ? 'text-[#c8b393]' : 'text-emerald-400'}`}>
            {weekOpen ? <BookMarked className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
            {weekOpen ? t('libWeekOpen') : t('libWeekCredited')}
          </span>
        </div>
        <p className="pt-2 border-t border-[#302a28] text-[11px] text-[#9e948c]">
          {t('libClubLine').replace('{books}', String(clubDone.length)).replace('{readers}', String(new Set(allReadBooks.map(b => b.readerId)).size)).replace('{avg}', clubAvg)}
        </p>
      </section>

      {saved?.shown && (
        <div role="status" className={`flex items-center gap-2 p-3 rounded-xl border text-[13px] animate-fade-in ${saved.credited ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200' : 'bg-[#23201e] border-[#3d3632] text-[#e6dfd3]'}`}>
          <CheckCircle className="w-4 h-4 shrink-0" />
          {saved.credited ? t('libSavedCredited') : t('libSaved')}
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-xl border bg-[#23201e] border-[#3d3632] text-[13px] text-[#e6dfd3]" data-lib-notice>
          <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
        </div>
      )}

      {/* Scope, search, sort */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#23201e] rounded-xl p-1 border border-[#352f2c]" role="group" aria-label={t('libScopeLabel')}>
            {(['club', 'mine'] as const).map(sc => (
              <button
                key={sc}
                onClick={() => setScope(sc)}
                aria-pressed={scope === sc}
                className={`min-h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${scope === sc ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#9e948c] hover:text-[#d6cebf]'}`}
              >
                {sc === 'club' ? t('libScopeClub') : t('libScopeMine')}
                <span className="ml-1 font-mono-numbers text-[11px] opacity-70">{sc === 'club' ? books.length : books.filter(b => b.mine).length}</span>
              </button>
            ))}
          </div>
          {scope === 'club' && (
            <select
              value={sort}
              onChange={e => setSort(e.target.value as typeof sort)}
              aria-label={t('libSortLabel')}
              className="min-h-10 px-3 rounded-xl bg-[#23201e] border border-[#352f2c] text-xs text-[#d6cebf] focus:outline-none focus:border-[#dfcfb3]/70"
            >
              <option value="recent">{t('libSortRecent')}</option>
              <option value="rating">{t('libSortRating')}</option>
              <option value="readers">{t('libSortReaders')}</option>
            </select>
          )}
        </div>
        <div className="relative sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9e948c] pointer-events-none" />
          <input
            type="search"
            aria-label={t('libSearchLabel')}
            placeholder={t('libSearch')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-[#23201e] border border-[#352f2c] text-sm text-[#f5f2eb] placeholder-[#9e948c] focus:outline-none focus:border-[#dfcfb3]/70"
          />
        </div>
      </div>

      {scope === 'club' ? (
        <>
          {/* Recent reviews (real, newest first) */}
          {!q && recentReviews.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">{t('libRecentReviews')}</h2>
              <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-1">
                {recentReviews.map(r => (
                  <button
                    key={r.id + r.readerId}
                    onClick={() => setOpenKey(bookKey(r.title, r.author))}
                    className="snap-start shrink-0 w-[85%] max-w-[340px] sm:w-80 text-left flex gap-3 p-3 rounded-2xl bg-[#23201e] border border-[#352f2c] hover:border-[#4d443f] transition-colors"
                  >
                    <BookCover book={{ ...r, coverUrl: books.find(b => b.key === bookKey(r.title, r.author))?.coverUrl }} small className="w-12 shrink-0 self-start" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-[#f5f2eb] truncate">{r.title}</span>
                      <span className="flex items-center gap-1.5 mt-0.5">
                        <AvatarWithFallback src={r.readerAvatar} name={r.readerName} className="w-4 h-4" textClassName="text-[7px]" />
                        <span className="text-[11px] text-[#9e948c] truncate">{r.readerName}</span>
                        <Stars value={r.userRating} size="w-2.5 h-2.5" />
                      </span>
                      <span className="mt-1.5 block text-[12px] text-[#b8afa3] leading-relaxed line-clamp-3">«{r.review}»</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Catalogue: empty club (nothing added yet) is not the same as "nothing found" */}
          {books.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-3" data-lib-empty-club>
              <BookOpen className="w-9 h-9 mx-auto text-[#9e948c] opacity-60" aria-hidden="true" />
              <p className="text-[14px] font-semibold text-[#f5f2eb]">{t('libEmptyClubTitle')}</p>
              <p className="text-[13px] text-[#9e948c] max-w-sm mx-auto">{t('libEmptyClubText')}</p>
              <button onClick={() => openAdd()} className="btn-primary"><Plus className="w-4 h-4" />{t('actionAddBook')}</button>
            </div>
          ) : sorted.length === 0 ? (
            <p className="p-8 text-center rounded-2xl bg-[#23201e] border border-[#352f2c] text-[13px] text-[#9e948c]">{t('libEmptySearch')}</p>
          ) : (
            <section className="space-y-3">
              {!q && <h2 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">{t('libScopeClub')}</h2>}
              <div className={grid} data-books-grid>
                {sorted.map(b => renderCard(b))}
              </div>
            </section>
          )}
        </>
      ) : myBooks.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-3">
          <BookOpen className="w-9 h-9 mx-auto text-[#9e948c] opacity-50" />
          <p className="text-[13px] text-[#9e948c] max-w-sm mx-auto">{q ? t('libEmptySearch') : t('libEmptyMine')}</p>
          {!q && <button onClick={() => openAdd()} className="btn-primary"><Plus className="w-4 h-4" />{t('actionAddBook')}</button>}
        </div>
      ) : (
        <div className="space-y-7">
          {[{ title: t('libMyReading'), list: myReading }, { title: t('libMyRead'), list: myDone }].filter(g => g.list.length).map(g => (
            <section key={g.title} className="space-y-3">
              <h2 className="flex items-baseline gap-2 font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
                {g.title}<span className="text-xs font-mono-numbers font-normal text-[#9e948c]">{g.list.length}</span>
              </h2>
              <div className={grid} data-books-grid>
                {g.list.map(b => renderCard(b, true))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Book detail */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-fade-in overscroll-contain"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          onClick={e => e.target === e.currentTarget && setOpenKey(null)}
        >
          {/* useDialog: focus inside, Tab stays inside, Escape closes, focus returns to the card */}
          <div
            ref={detailRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-detail-title"
            tabIndex={-1}
            data-book-dialog
            className="relative w-full max-w-xl max-h-full sm:max-h-[90dvh] flex flex-col overflow-hidden bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <button onClick={() => setOpenKey(null)} aria-label={t('actionClose')} className="absolute top-3 right-3 z-10 btn-icon text-[#9e948c]">
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
              <div className="flex gap-4 pr-10">
                <BookCover book={open} natural className="w-20 min-[360px]:w-24 sm:w-28 shrink-0 self-start" />
                <div className="min-w-0 space-y-1.5">
                  {open.genre && <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#c8b393]">{genreLabel(open.genre, t)}</span>}
                  <h2 id="book-detail-title" className="font-display text-base min-[360px]:text-lg sm:text-xl font-bold leading-snug text-[#f5f2eb] break-words [overflow-wrap:anywhere]">{open.title}</h2>
                  <p className="text-sm text-[#b0a79d] break-words [overflow-wrap:anywhere]">{open.author}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#9e948c]">
                    {open.avg !== null ? (
                      <span className="inline-flex items-center gap-1"><Stars value={open.avg} /><span className="font-mono-numbers text-[#e6dfd3]">{open.avg.toFixed(1)}</span><span>({open.ratings})</span></span>
                    ) : <span>{t('libNoRating')}</span>}
                  </div>
                  <div className="text-[12px] text-[#9e948c]">
                    {t('libReadersCount').replace('{n}', String(open.entries.length))}
                  </div>
                  <button
                    type="button"
                    onClick={() => discuss(open)}
                    className="mt-1 inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg bg-[#1c1918] border border-[#3b3430] hover:border-[#5a4f48] text-[12px] font-semibold text-[#dfcfb3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60"
                    data-book-discuss
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    {t('libDiscuss')}
                  </button>
                </div>
              </div>

              {open.readingNow.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('libReadingNowList')}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {open.readingNow.map(r => (
                      <button key={r.readerId} onClick={() => { const m = memberOf(r.readerId); if (m) { setOpenKey(null); setSelectedUserModal(m); } }}
                              className="flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 min-h-10 rounded-full bg-[#1c1918] border border-[#302a28] hover:border-[#4d443f]">
                        <AvatarWithFallback src={r.readerAvatar} name={r.readerName} className="w-7 h-7" textClassName="text-[10px]" />
                        <span className="text-[12px] text-[#d6cebf] max-w-[9rem] truncate">{r.readerName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">
                    {t('libReviewsTitle')} <span className="font-mono-numbers">{open.reviews.length}</span>
                  </h3>
                  {open.reviews.length > 1 && (
                    <div className="flex items-center bg-[#1c1918] rounded-lg p-0.5 border border-[#302a28]">
                      {(['newest', 'top'] as const).map(rs => (
                        <button key={rs} onClick={() => setReviewSort(rs)} aria-pressed={reviewSort === rs}
                                className={`min-h-9 px-2.5 rounded-md text-[11px] ${reviewSort === rs ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#9e948c]'}`}>
                          {rs === 'newest' ? t('libReviewNewest') : t('libReviewTop')}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {open.reviews.length === 0 ? (
                  <p className="text-[13px] text-[#9e948c]">{t('libNoReviews')}</p>
                ) : (
                  <div className="space-y-2.5">
                    {[...open.reviews]
                      .sort((a, b) => (reviewSort === 'top' ? b.userRating - a.userRating : 0) || b.dateFinished.localeCompare(a.dateFinished))
                      .map(r => (
                        <article key={r.readerId} className="p-3.5 rounded-xl bg-[#1c1918] border border-[#302a28] space-y-2">
                          <div className="flex items-center gap-2.5">
                            <button onClick={() => { const m = memberOf(r.readerId); if (m) { setOpenKey(null); setSelectedUserModal(m); } }} className="shrink-0 rounded-full" aria-label={r.readerName}>
                              <AvatarWithFallback src={r.readerAvatar} name={r.readerName} className="w-8 h-8 ring-1 ring-[#dfcfb3]/40" textClassName="text-[11px]" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <span className="block text-[13px] font-semibold text-[#f5f2eb] truncate">{r.readerName}</span>
                              <span className="block text-[11px] text-[#9e948c]">
                                {r.status === 'reading' ? t('libReadingNow') : `${t('libFinishedOn')} ${formatShortDate(r.dateFinished, t)}`}
                              </span>
                            </div>
                            {r.status === 'completed' && <Stars value={r.userRating} />}
                          </div>
                          <p className="text-[13px] text-[#d6cebf] leading-relaxed whitespace-pre-line break-words">{r.review}</p>
                        </article>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions: always visible */}
            <div className="shrink-0 flex items-center gap-2 px-5 sm:px-6 py-3 border-t border-[#302a28] bg-[#201d1c]">
              {open.mine ? (
                <>
                  <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium min-w-0 ${open.mine.status === 'reading' ? 'text-amber-200' : 'text-emerald-300'}`}>
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span className="truncate">{open.mine.status === 'reading' ? t('libMyStatusReading') : t('libMyStatusDone')}</span>
                  </span>
                  <button onClick={() => openEdit(open.mine!)} className="btn-primary ml-auto shrink-0">{t('libEdit')}</button>
                </>
              ) : (
                <>
                  <button onClick={() => openAdd({ title: open.title, author: open.author, genre: open.genre, coverUrl: open.coverUrl, status: 'reading' })} className="btn-secondary flex-1 min-w-0 px-2 min-[360px]:px-3 text-[13px] min-[360px]:text-sm">
                    <BookOpen className="w-4 h-4 shrink-0 hidden min-[420px]:block" /><span className="truncate">{t('libMarkReading')}</span>
                  </button>
                  <button onClick={() => openAdd({ title: open.title, author: open.author, genre: open.genre, coverUrl: open.coverUrl, status: 'completed' })} className="btn-primary flex-1 min-w-0 px-2 min-[360px]:px-3 text-[13px] min-[360px]:text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0 hidden min-[420px]:block" /><span className="truncate">{t('libMarkRead')}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / edit form */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-fade-in overscroll-contain"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <form
            ref={formRef}
            onSubmit={handleAddBook}
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-form-title"
            tabIndex={-1}
            data-book-form
            className="relative w-full max-w-md max-h-full sm:max-h-[90dvh] flex flex-col overflow-hidden bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <button type="button" onClick={closeForm} aria-label={t('actionClose')} className="absolute top-3 right-3 z-10 btn-icon text-[#9e948c]">
              <X className="w-4 h-4" />
            </button>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 text-xs">
              <div className="pr-10">
                <h3 id="book-form-title" className="font-display text-base min-[360px]:text-lg font-bold text-[#f5f2eb]">{editing ? t('libEditBook') : t('actionAddBook')}</h3>
                <p className="mt-1 text-[12px] text-[#a39b94] leading-relaxed">{t('libAddIntro')}</p>
              </div>

              <div>
                <label htmlFor="book-title" className="font-medium text-[#d6cebf] block mb-1">{t('libFormTitle')} *</label>
                <input id="book-title" type="text" required maxLength={300} value={bookTitle} readOnly={lockTitle} onChange={e => setBookTitle(e.target.value)}
                       placeholder={t('libFormTitlePlaceholder')}
                       className={`w-full min-h-10 px-3 rounded-xl bg-[#1a1716] border border-[#3b3430] text-sm text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3] ${lockTitle ? 'opacity-70' : ''}`} />
              </div>
              <div>
                <label htmlFor="book-author" className="font-medium text-[#d6cebf] block mb-1">{t('libFormAuthor')} *</label>
                <input id="book-author" type="text" required maxLength={200} value={bookAuthor} readOnly={lockTitle} onChange={e => setBookAuthor(e.target.value)}
                       placeholder={t('libFormAuthorPlaceholder')}
                       className={`w-full min-h-10 px-3 rounded-xl bg-[#1a1716] border border-[#3b3430] text-sm text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3] ${lockTitle ? 'opacity-70' : ''}`} />
              </div>

              {/* Already in the club? Choosing it adds this member to the same book instead of a near-duplicate */}
              {similar.length > 0 && (
                <div className="rounded-xl border border-[#4a413b] bg-[#1c1918] p-3 space-y-2" data-book-similar>
                  <p className="text-[12px] text-[#d6cebf]">{exactMatch ? t('libSimilarExact') : t('libSimilarTitle')}</p>
                  <ul className="space-y-1.5">
                    {similar.map(b => (
                      <li key={b.key} className="flex items-center gap-2 min-w-0">
                        <BookCover book={b} small className="w-8 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold text-[#f5f2eb] truncate">{b.title}</span>
                          <span className="block text-[11px] text-[#9e948c] truncate">{b.author}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setBookTitle(b.title); setBookAuthor(b.author); setBookGenre(b.genre || bookGenre);
                            setEditingCoverUrl(b.coverUrl); setLockTitle(true);
                            if (b.mine) openEdit(b.mine);
                          }}
                          className="shrink-0 btn-secondary min-h-10 px-2.5 text-[11px]"
                          data-book-similar-pick
                        >
                          {b.mine ? t('libSimilarMine') : t('libSimilarPick')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <span className="font-medium text-[#d6cebf] block mb-1">{t('libStatusLabel')}</span>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#1a1716] border border-[#3b3430]" role="group" aria-label={t('libStatusLabel')}>
                  {(['reading', 'completed'] as const).map(st => (
                    <button key={st} type="button" onClick={() => setBookStatus(st)} aria-pressed={bookStatus === st}
                            disabled={st === 'reading' && finishedAlready}
                            data-status-option={st}
                            className={`min-h-10 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${bookStatus === st ? 'bg-[#dfcfb3] text-[#1e1b1a]' : 'text-[#9e948c] hover:text-[#f5f2eb]'}`}>
                      {st === 'reading' ? t('libStatusReading') : t('libStatusDone')}
                    </button>
                  ))}
                </div>
                {/* S-3a (owner decision 25.11.2026): a finished book stays finished (the server refuses it too). */}
                {finishedAlready && <p className="mt-1 text-[11px] text-[#9e948c]" data-finished-locked>{t('libFinishedLocked')}</p>}
              </div>

              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="book-genre" className="font-medium text-[#d6cebf] block mb-1">{t('libFormGenre')}</label>
                  <select id="book-genre" value={bookGenre} onChange={e => setBookGenre(e.target.value)}
                          className="w-full min-h-10 px-2 rounded-xl bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]">
                    {BOOK_GENRES.map(([g, k]) => <option key={g} value={g}>{t(k)}</option>)}
                  </select>
                </div>
                {bookStatus === 'completed' && (
                <div>
                  <span id="book-rating-label" className="font-medium text-[#d6cebf] block mb-1">{t('libFormRating')}</span>
                  <div className="flex items-center gap-0.5 min-h-10" role="radiogroup" aria-labelledby="book-rating-label">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onClick={() => setBookRating(star)} role="radio" aria-checked={bookRating === star} aria-label={`${star}/5`}
                              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#2b2725]">
                        <Star className={`w-5 h-5 ${star <= bookRating ? 'text-amber-400 fill-current' : 'text-[#4d443f]'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                )}
              </div>

              {!isDemoData && (
                <div>
                  <span className="font-medium text-[#d6cebf] block mb-1">{t('libFormCover')}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-12 aspect-[2/3] rounded-md shrink-0 overflow-hidden bg-[#1a1716] border border-[#3b3430] flex items-center justify-center text-[#9e948c]">
                      {coverPreview || editingCoverUrl ? <img src={coverPreview ?? editingCoverUrl} alt="" className="w-full h-full object-cover" /> : '📖'}
                    </div>
                    {editingCoverUrl ? (
                      <span className="text-[11px] text-[#9e948c]">{t('libCoverExists')}</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="btn-secondary min-h-10 px-3 text-xs cursor-pointer w-fit focus-within:ring-2 focus-within:ring-[#dfcfb3]">
                          {coverFile ? t('libCoverChange') : t('libCoverAdd')}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => setCoverFile(e.target.files?.[0] ?? null)} />
                        </label>
                        <span className="text-[11px] text-[#9e948c]">{t('libCoverHint')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="book-review" className="font-medium text-[#d6cebf] block mb-1">{t('libFormReview')}</label>
                <textarea id="book-review" rows={5} maxLength={5000} aria-describedby="book-credit-hint" value={bookReview} onChange={e => setBookReview(e.target.value)} placeholder={t('libFormReviewPlaceholder')}
                          className="w-full p-3 rounded-xl bg-[#1a1716] border border-[#3b3430] text-sm leading-relaxed text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]" />
                {/* Book credit rule: finished + review of 100+ chars, one book per week (unchanged) */}
                <div className="mt-1.5 space-y-1">
                  <div className="h-1 rounded-full bg-[#141211] overflow-hidden">
                    <div className={`h-full rounded-full ${reviewChars >= MIN_REVIEW_CHARS ? 'bg-emerald-500' : 'bg-[#c8b393]'}`}
                         style={{ width: `${Math.min(100, Math.round((reviewChars / MIN_REVIEW_CHARS) * 100))}%` }} />
                  </div>
                  <div className="flex items-start justify-between gap-3 text-[11px]">
                    <span id="book-credit-hint" className={creditHint.ok ? 'text-emerald-400' : 'text-[#9e948c]'}>{creditHint.text}</span>
                    <span className={`font-mono shrink-0 ${reviewChars >= MIN_REVIEW_CHARS ? 'text-emerald-400' : 'text-[#9e948c]'}`}>{reviewChars}/{MIN_REVIEW_CHARS}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-[#302a28] bg-[#201d1c] space-y-2 safe-area-pb">
              {formError && (
                <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-book-form-error>
                  {formError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                {/* Only a "reading" entry can be taken off the shelf: a finished one may have been rewarded */}
                {editing && editingEntry?.status === 'reading' && (
                  <button type="button" onClick={() => { setRemoveError(''); setConfirmRemove(true); }} disabled={formBusy}
                          className="mr-auto min-h-10 px-2 rounded-lg text-xs text-red-300 hover:text-red-200 disabled:opacity-50" data-book-remove>
                    {t('libRemove')}
                  </button>
                )}
                <button type="button" onClick={closeForm} disabled={formBusy} className="btn-ghost">{t('actionClose')}</button>
                <button type="submit" disabled={formBusy} className="btn-primary disabled:opacity-60">
                  {formBusy ? t('libSaving') : t('actionSave')}{!formBusy && creditHint.ok && <span className="hidden min-[360px]:inline">&nbsp;(+50 XP, +30 🪙)</span>}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={t('libRemoveQ')}
        text={t('libRemoveText').replace('{title}', editingEntry?.title ?? '')}
        confirmLabel={t('libRemove')}
        busyLabel={t('frmDeleting')}
        cancelLabel={t('frmCancel')}
        busy={removeBusy}
        error={removeError}
        onConfirm={doRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
};
