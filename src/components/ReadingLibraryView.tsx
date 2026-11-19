import React, { useState } from 'react';
import { MIN_REVIEW_CHARS, isWeekFreeForCredit, reviewLength } from '../utils/bookCredit';
import { toLocalDay } from '../utils/streak';
import { useApp } from '../context/AppContext';
import {
  BookOpen,
  Plus,
  Search,
  Star,
  CheckCircle,
  Clock,
  User,
  X,
  Library,
} from 'lucide-react';
import { ReadBook } from '../types';

export const ReadingLibraryView: React.FC = () => {
  const { allReadBooks, allUsers, currentUser, addReadBook, setSelectedUserModal, t } = useApp();

  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'reading'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add book form state
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookGenre, setBookGenre] = useState('Классика / Философия');
  const [bookRating, setBookRating] = useState(5);
  const [bookReview, setBookReview] = useState('');
  const [bookStatus, setBookStatus] = useState<'completed' | 'reading'>('completed');

  // Live hint: will this book count for the reward and book achievements?
  const reviewChars = reviewLength(bookReview);
  const creditHint = (() => {
    if (bookStatus !== 'completed') {
      return { ok: false, text: 'В награды и достижения засчитываются только прочитанные книги с рецензией.' };
    }
    if (reviewChars < MIN_REVIEW_CHARS) {
      return {
        ok: false,
        text: `Ещё ${MIN_REVIEW_CHARS - reviewChars} симв. своими словами — и книга засчитается (+50 XP, +30 коинов, прогресс достижений).`,
      };
    }
    if (!isWeekFreeForCredit(currentUser.readBooks, toLocalDay())) {
      return { ok: false, text: 'На этой неделе книга уже засчитана (одна в неделю). Эта сохранится в библиотеке без награды.' };
    }
    return { ok: true, text: '✓ Книга засчитается: +50 XP, +30 коинов и прогресс книжных достижений.' };
  })();

  const genres = [
    'Классика / Философия',
    'Исторический эпос',
    'Когнитивная психология',
    'Саморазвитие и привычки',
    'Бизнес и лидерство',
    'Художественная проза',
    'Научпоп и космология',
  ];

  const filteredBooks = allReadBooks.filter(item => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchAuthor = item.author.toLowerCase().includes(q);
      const matchReader = item.readerName.toLowerCase().includes(q);
      const matchGenre = item.genre.toLowerCase().includes(q);
      if (!matchTitle && !matchAuthor && !matchReader && !matchGenre) return false;
    }
    return true;
  });

  const handleAddBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle.trim() || !bookAuthor.trim()) return;

    const coverColors = ['#967d58', '#4a433f', '#bfa882', '#475569', '#059669', '#1e1b4b', '#b91c1c'];
    const randomCoverColor = coverColors[Math.floor(Math.random() * coverColors.length)];

    addReadBook({
      title: bookTitle.trim(),
      author: bookAuthor.trim(),
      genre: bookGenre,
      userRating: bookRating,
      review: bookReview.trim() || undefined,
      dateFinished: toLocalDay(),
      coverColor: randomCoverColor,
      status: bookStatus,
    });

    setShowAddModal(false);
    setBookTitle('');
    setBookAuthor('');
    setBookReview('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
            {t('libraryTitle')}
          </h1>
          <p className="text-xs text-[#9e948c]">
            {t('librarySubtitle')}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('actionAddBook')}</span>
        </button>
      </div>

      {/* Stats Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#8c8279] block">{t('totalBooksRead')}</span>
            <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
              {allReadBooks.filter(b => b.status === 'completed').length}
            </span>
          </div>
          <Library className="w-8 h-8 text-[#dfcfb3]/40" />
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#8c8279] block">{t('activeReaders')}</span>
            <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
              {new Set(allReadBooks.map(b => b.readerId)).size}
            </span>
          </div>
          <BookOpen className="w-8 h-8 text-[#dfcfb3]/40" />
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] flex items-center justify-between">
          <div>
            <span className="text-xs text-[#8c8279] block">{t('averageRating')}</span>
            <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f]">
              4.9 <span className="text-xs text-[#8c8279] font-normal">/ 5.0 ★</span>
            </span>
          </div>
          <Star className="w-8 h-8 text-amber-400/40" />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[#23201e] border border-[#352f2c] rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            Все записи ({allReadBooks.length})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              statusFilter === 'completed'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('readingStatusCompleted')}
          </button>
          <button
            onClick={() => setStatusFilter('reading')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              statusFilter === 'reading'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('readingStatusReading')}
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8c8279]" />
          <input
            type="text"
            placeholder="Поиск по названию, автору или читателю..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3] w-full sm:w-72"
          />
        </div>
      </div>

      {/* Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBooks.map(item => {
          const readerUser = allUsers.find(u => u.id === item.readerId);

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-[#23201e] border border-[#352f2c] hover:border-[#4d443f] p-5 flex flex-col justify-between transition-all shadow-md group"
            >
              <div className="space-y-3">
                {/* Book Header with faux spine visual */}
                <div className="flex items-start gap-3">
                  <div
                    className="w-12 h-16 rounded-md shrink-0 flex flex-col justify-between p-1.5 shadow-md border border-black/20"
                    style={{ backgroundColor: item.coverColor || '#967d58' }}
                  >
                    <div className="w-full h-1 bg-white/20 rounded" />
                    <span className="text-[8px] text-white/90 font-bold uppercase truncate">
                      {item.author.split(' ')[0]}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] text-[#dfcfb3] font-medium truncate">
                        {item.genre}
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-current" />
                        {item.userRating}/5
                      </span>
                    </div>

                    <h3 className="font-display text-sm font-bold text-[#f5f2eb] leading-snug truncate mt-0.5">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#8c8279] truncate">
                      {item.author}
                    </p>
                  </div>
                </div>

                {/* Personal Review Quote */}
                {item.review && (
                  <div className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28] text-xs text-[#b8afa3] italic leading-relaxed">
                    «{item.review}»
                  </div>
                )}
              </div>

              {/* Reader attribution footer */}
              <div className="mt-4 pt-3 border-t border-[#302a28] flex items-center justify-between text-xs">
                <div
                  onClick={() => readerUser && setSelectedUserModal(readerUser)}
                  className="flex items-center gap-2 cursor-pointer group-hover:text-[#dfcfb3] transition-colors"
                >
                  <img
                    src={item.readerAvatar}
                    alt={item.readerName}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-[#dfcfb3]/50"
                  />
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-[#f5f2eb] truncate max-w-[130px]">
                      {item.readerName}
                    </span>
                    <span className="text-[9px] text-[#8c8279]">
                      {item.status === 'reading' ? 'Читает сейчас' : `Прочитано ${item.dateFinished}`}
                    </span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] bg-[#272321] text-[#9e948c] border border-[#38312d]">
                  {item.status === 'reading' ? 'В процессе' : 'Завершено'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Read Book Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-6 space-y-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-display text-lg font-bold text-[#f5f2eb]">
              {t('actionAddBook')}
            </h3>
            <p className="text-xs text-[#a39b94]">
              Поделитесь прочитанной книгой с сообществом Shanyraq. За прочитанную книгу с рецензией от 100 символов — +50 XP и +30 коинов (одна книга в неделю).
            </p>

            <form onSubmit={handleAddBook} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Название книги *
                </label>
                <input
                  type="text"
                  required
                  value={bookTitle}
                  onChange={e => setBookTitle(e.target.value)}
                  placeholder="Например: Абай жолы"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Автор книги *
                </label>
                <input
                  type="text"
                  required
                  value={bookAuthor}
                  onChange={e => setBookAuthor(e.target.value)}
                  placeholder="Например: Мухтар Ауэзов"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Жанр</label>
                  <select
                    value={bookGenre}
                    onChange={e => setBookGenre(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {genres.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Статус</label>
                  <select
                    value={bookStatus}
                    onChange={e => setBookStatus(e.target.value as 'completed' | 'reading')}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    <option value="completed">Прочитано</option>
                    <option value="reading">Читаю сейчас</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Оценка ({bookRating} из 5):
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setBookRating(star)}
                      className={`flex-1 py-1 rounded text-xs font-bold ${
                        bookRating === star ? 'bg-[#dfcfb3] text-[#1e1b1a]' : 'bg-[#1a1716] text-[#8c8279]'
                      }`}
                    >
                      {star}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Ваша рецензия и главные мысли:
                </label>
                <textarea
                  rows={3}
                  value={bookReview}
                  onChange={e => setBookReview(e.target.value)}
                  placeholder="О чем заставила задуматься книга? Какие инсайты вынесли?"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
                {/* Book credit rule: finished + review of 100+ chars, one book per week */}
                <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
                  <span className={creditHint.ok ? 'text-emerald-400' : 'text-[#9e948c]'}>{creditHint.text}</span>
                  <span className={`font-mono shrink-0 ${reviewChars >= MIN_REVIEW_CHARS ? 'text-emerald-400' : 'text-[#736a62]'}`}>
                    {reviewChars}/{MIN_REVIEW_CHARS}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#302a28]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-[#8c8279] hover:text-[#f5f2eb]"
                >
                  {t('actionClose')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                >
                  {t('actionSave')}{creditHint.ok ? ' (+50 XP, +30 🪙)' : ''}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
