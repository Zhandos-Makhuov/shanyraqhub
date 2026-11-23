import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TIERS } from '../data/gamification';
import { AvatarWithFallback } from './ProfileParts';
import {
  Trophy,
  Crown,
  BookOpen,
  CalendarCheck,
  Coins,
  Sparkles,
  ArrowUp,
  Search,
} from 'lucide-react';

export const LeaderboardView: React.FC = () => {
  const { allUsers, currentUser, setSelectedUserModal, language, t, ln } = useApp();

  const [sortKey, setSortKey] = useState<'xp' | 'books' | 'events' | 'coins'>('xp');
  const [searchMember, setSearchMember] = useState('');

  // "Books" = finished books (a "reading" entry is not a read book).
  const booksRead = (u: { readBooks: { status: string }[] }) => u.readBooks.filter(b => b.status === 'completed').length;
  const sortedUsers = [...allUsers].sort((a, b) => {
    if (sortKey === 'books') {
      return booksRead(b) - booksRead(a);
    }
    if (sortKey === 'events') {
      return (
        b.attendedEvents.filter(e => e.status === 'attended').length -
        a.attendedEvents.filter(e => e.status === 'attended').length
      );
    }
    if (sortKey === 'coins') {
      return b.coins - a.coins;
    }
    return b.xp - a.xp;
  });

  // Search keeps each member's real place (a found member is not "#1" just because the list got shorter).
  const rankOf = new Map(sortedUsers.map((u, i) => [u.id, i + 1]));
  const q = searchMember.trim().toLocaleLowerCase();
  const filteredUsers = sortedUsers.filter(u => !q || u.name.toLocaleLowerCase().includes(q) || (u.handle ?? '').toLocaleLowerCase().includes(q));

  const myRankIndex = sortedUsers.findIndex(u => u.id === currentUser.id);
  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 1;
  const nextUserAhead = myRankIndex > 0 ? sortedUsers[myRankIndex - 1] : null;

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 w-full max-w-full">
      {/* Top Header */}
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#f5f2eb]">
          {t('leaderboardTitle')}
        </h1>
        <p className="text-xs text-[#9e948c] mt-1">
          {t('leaderboardSubtitle')}
        </p>
      </div>

      {/* Current User Rank Strip */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#2a2420] via-[#231f1d] to-[#1a1716] border border-[#dfcfb3]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#dfcfb3] text-[#1e1b1a] flex items-center justify-center font-display font-bold text-xs sm:text-sm shadow shrink-0">
            #{myRank}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-bold text-[#f5f2eb]">{t('lbYourPosition')}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#dfcfb3]/20 text-[#dfcfb3] font-semibold">
                {ln(TIERS[currentUser.tier])}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[#a39b94] truncate">
              {currentUser.xp} XP · {currentUser.coins} {t('lbCoins')} · {booksRead(currentUser)} {t('lbBooks')}
            </p>
          </div>
        </div>

        {nextUserAhead && (
          <div className="text-xs text-[#dfcfb3] flex items-center gap-1.5 bg-[#191615] px-3 py-1.5 rounded-lg border border-[#3b3430] shrink-0 self-start sm:self-auto">
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-xs">
              {t('lbTo')} #{myRank - 1} ({nextUserAhead.name}): <strong className="font-mono-numbers">{nextUserAhead.xp - currentUser.xp} XP</strong>
            </span>
          </div>
        )}
      </div>

      {/* Top 3 Podium Visual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 pt-1 sm:pt-4">
        {/* 2nd Place */}
        {sortedUsers[1] && (
          <button
            type="button"
            onClick={() => setSelectedUserModal(sortedUsers[1])}
            aria-label={`#${2} ${sortedUsers[1].name}`}
            className="rounded-2xl p-4 sm:p-5 bg-[#23201e] border border-stone-600/50 flex flex-col items-center text-center cursor-pointer hover:border-stone-400 transition-all md:order-1 order-2"
          >
            <div className="relative mb-2.5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden ring-4 ring-stone-400/80 p-0.5">
                <AvatarWithFallback src={sortedUsers[1].avatar} name={sortedUsers[1].name} className="w-full h-full" textClassName="text-lg" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-stone-300 text-stone-900 font-bold text-xs flex items-center justify-center shadow">
                2
              </div>
            </div>
            <span className="font-display text-sm font-bold text-[#f5f2eb]">
              {sortedUsers[1].name}
            </span>
            <span className="text-[10px] text-stone-300 font-medium mt-0.5">
              {ln(TIERS[sortedUsers[1].tier])}
            </span>
            <div className="flex items-center gap-2 sm:gap-3 mt-2.5 pt-2.5 border-t border-[#302a28] text-xs">
              <span className="font-mono-numbers font-bold text-[#dfcfb3]">{sortedUsers[1].xp} XP</span>
              <span className="text-[#9e948c]">·</span>
              <span className="text-[#a39b94]">{booksRead(sortedUsers[1])} {t('lbBooks')}</span>
            </div>
          </button>
        )}

        {/* 1st Place Champion */}
        {sortedUsers[0] && (
          <button
            type="button"
            onClick={() => setSelectedUserModal(sortedUsers[0])}
            aria-label={`#${1} ${sortedUsers[0].name}`}
            className="rounded-2xl p-5 sm:p-6 bg-gradient-to-b from-[#2e2621] via-[#24201e] to-[#1c1917] border-2 border-[#dfcfb3] flex flex-col items-center text-center cursor-pointer shadow-[0_0_30px_rgba(223,207,179,0.2)] md:order-2 order-1 transform md:-translate-y-2 transition-all"
          >
            <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-[#f5d77f] animate-bounce mb-1" />
            <div className="relative mb-2.5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden ring-4 ring-[#dfcfb3] p-1 shadow-lg">
                <AvatarWithFallback src={sortedUsers[0].avatar} name={sortedUsers[0].name} className="w-full h-full" textClassName="text-lg" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#dfcfb3] text-[#1e1b1a] font-bold text-xs flex items-center justify-center shadow-lg">
                1
              </div>
            </div>
            <span className="font-display text-base font-bold text-[#f5f2eb]">
              {sortedUsers[0].name}
            </span>
            <span className="text-xs text-[#dfcfb3] font-semibold mt-0.5">
              {ln(TIERS[sortedUsers[0].tier])} 👑
            </span>
            <div className="flex items-center gap-2 sm:gap-3 mt-2.5 pt-2.5 border-t border-[#3a332f] text-xs">
              <span className="font-mono-numbers font-bold text-[#f5d77f] text-sm">{sortedUsers[0].xp} XP</span>
              <span className="text-[#9e948c]">·</span>
              <span className="text-[#a39b94]">{booksRead(sortedUsers[0])} {t('lbBooks')}</span>
              <span className="text-[#9e948c]">·</span>
              <span className="text-[#f5d77f]">{sortedUsers[0].coins} 🪙</span>
            </div>
          </button>
        )}

        {/* 3rd Place */}
        {sortedUsers[2] && (
          <button
            type="button"
            onClick={() => setSelectedUserModal(sortedUsers[2])}
            aria-label={`#${3} ${sortedUsers[2].name}`}
            className="rounded-2xl p-4 sm:p-5 bg-[#23201e] border border-amber-800/50 flex flex-col items-center text-center cursor-pointer hover:border-amber-700 transition-all md:order-3 order-3"
          >
            <div className="relative mb-2.5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden ring-4 ring-amber-700/80 p-0.5">
                <AvatarWithFallback src={sortedUsers[2].avatar} name={sortedUsers[2].name} className="w-full h-full" textClassName="text-lg" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-amber-700 text-white font-bold text-xs flex items-center justify-center shadow">
                3
              </div>
            </div>
            <span className="font-display text-sm font-bold text-[#f5f2eb]">
              {sortedUsers[2].name}
            </span>
            <span className="text-[10px] text-amber-500 font-medium mt-0.5">
              {ln(TIERS[sortedUsers[2].tier])}
            </span>
            <div className="flex items-center gap-2 sm:gap-3 mt-2.5 pt-2.5 border-t border-[#302a28] text-xs">
              <span className="font-mono-numbers font-bold text-[#dfcfb3]">{sortedUsers[2].xp} XP</span>
              <span className="text-[#9e948c]">·</span>
              <span className="text-[#a39b94]">{booksRead(sortedUsers[2])} {t('lbBooks')}</span>
            </div>
          </button>
        )}
      </div>

      {/* Filter and Sorting Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 bg-[#23201e] border border-[#352f2c] rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          <button
            type="button"
            aria-pressed={sortKey === 'xp'}
            onClick={() => setSortKey('xp')}
            className={`px-3 min-h-9 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === 'xp'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('lbByXp')}
          </button>
          <button
            type="button"
            aria-pressed={sortKey === 'books'}
            onClick={() => setSortKey('books')}
            className={`px-3 min-h-9 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === 'books'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('lbByBooks')}
          </button>
          <button
            type="button"
            aria-pressed={sortKey === 'events'}
            onClick={() => setSortKey('events')}
            className={`px-3 min-h-9 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === 'events'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('lbByVisits')}
          </button>
          <button
            type="button"
            aria-pressed={sortKey === 'coins'}
            onClick={() => setSortKey('coins')}
            className={`px-3 min-h-9 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              sortKey === 'coins'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            {t('lbByCoins')} 🪙
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9e948c]" />
          <input
            type="search"
            aria-label={t('lbSearch')}
            placeholder={t('lbSearch')}
            value={searchMember}
            onChange={e => setSearchMember(e.target.value)}
            className="w-full min-h-10 pl-8 pr-3 py-1.5 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
          />
        </div>
      </div>

      {/* Leaderboard Cards on Mobile (< sm) */}
      <div className="sm:hidden space-y-2.5">
        {filteredUsers.map(user => {
          const rank = rankOf.get(user.id) ?? 0;
          const isMe = user.id === currentUser.id;
          const tierInfo = TIERS[user.tier];
          const attendedCount = user.attendedEvents.filter(e => e.status === 'attended').length;

          return (
            <button
              type="button"
              key={user.id}
              onClick={() => setSelectedUserModal(user)}
              data-member-row={user.id}
              className={`block w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60 ${
                isMe
                  ? 'bg-[#dfcfb3]/10 border-[#dfcfb3]/50'
                  : 'bg-[#23201e] border-[#352f2c] hover:border-[#4d443f]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-display font-bold text-xs w-7 shrink-0 text-[#dfcfb3]">
                    {rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`}
                  </span>
                  <AvatarWithFallback src={user.avatar} name={user.name} className="w-8 h-8 rounded-full object-cover ring-1 ring-[#dfcfb3]/40 shrink-0" textClassName="text-[10px]" />
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-[#f5f2eb] truncate block">
                      {user.name} {isMe && <span className="text-[10px] text-[#dfcfb3] font-normal">({t('lbYou')})</span>}
                    </span>
                    <span className={`text-[10px] font-semibold ${tierInfo.textColor}`}>
                      {ln(tierInfo)}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-xs text-[#f5f2eb] block">
                    {user.xp} XP
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    {user.coins} 🪙
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-[#302a28] flex items-center justify-between text-[11px] text-[#9e948c]">
                <span>{t('lbBooksRead').replace('{n}', String(booksRead(user)))}</span>
                <span>{t('lbEventsAttended').replace('{n}', String(attendedCount))}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Leaderboard Table on Tablet & Desktop (>= sm) */}
      <div className="hidden sm:block rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1a1716] text-[#9e948c] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
              <tr>
                <th className="px-4 py-3">{t('rank')}</th>
                <th className="px-4 py-3">{t('member')}</th>
                <th className="px-4 py-3">{t('lbRankTier')}</th>
                <th className="px-4 py-3">{t('booksCount')}</th>
                <th className="px-4 py-3">{t('eventsCount')}</th>
                <th className="px-4 py-3">{t('shanyraqCoins')}</th>
                <th className="px-4 py-3 text-right">{t('lbXpPoints')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d2725]">
              {filteredUsers.map(user => {
                const rank = rankOf.get(user.id) ?? 0;
                const isMe = user.id === currentUser.id;
                const tierInfo = TIERS[user.tier];
                const attendedCount = user.attendedEvents.filter(e => e.status === 'attended').length;

                return (
                  <tr
                    key={user.id}
                    onClick={() => setSelectedUserModal(user)}
                    className={`cursor-pointer transition-colors ${
                      isMe
                        ? 'bg-[#dfcfb3]/10 hover:bg-[#dfcfb3]/15'
                        : 'hover:bg-[#282321]'
                    }`}
                  >
                    <td className="px-4 py-3.5 font-display font-bold">
                      {rank === 1 ? '🥇 #1' : rank === 2 ? '🥈 #2' : rank === 3 ? '🥉 #3' : `#${rank}`}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <AvatarWithFallback src={user.avatar} name={user.name} className="w-8 h-8 rounded-full object-cover ring-1 ring-[#dfcfb3]/50 shrink-0" textClassName="text-[10px]" />
                        <div className="min-w-0">
                          <button type="button" onClick={e => { e.stopPropagation(); setSelectedUserModal(user); }} data-member-row={user.id}
                                  className="font-bold text-[#f5f2eb] flex items-center gap-1.5 truncate text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60">
                            {user.name}
                            {isMe && (
                              <span className="text-[10px] text-[#dfcfb3] font-normal">({t('lbYou')})</span>
                            )}
                          </button>
                          <span className="text-[10px] text-[#b0a79d] block truncate">
                            {user.handle}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`font-semibold ${tierInfo.textColor}`}>
                        {language === 'kz' ? tierInfo.nameKz : language === 'en' ? tierInfo.nameEn : tierInfo.nameRu}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[#d6cebf]">
                      {booksRead(user)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[#d6cebf]">
                      {attendedCount}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-amber-400 font-semibold">
                      {user.coins} 🪙
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-[#f5f2eb]">
                      {user.xp} XP
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
