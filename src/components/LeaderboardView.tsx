import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TIERS } from '../data/gamification';
import {
  Trophy,
  Medal,
  Crown,
  BookOpen,
  CalendarCheck,
  Coins,
  Sparkles,
  ArrowUp,
  Search,
} from 'lucide-react';

export const LeaderboardView: React.FC = () => {
  const { allUsers, currentUser, setSelectedUserModal, language, t } = useApp();

  const [timeFilter, setTimeFilter] = useState<'all' | 'month'>('all');
  const [sortKey, setSortKey] = useState<'xp' | 'books' | 'events' | 'coins'>('xp');
  const [searchMember, setSearchMember] = useState('');

  const sortedUsers = [...allUsers].sort((a, b) => {
    if (sortKey === 'books') {
      return b.readBooks.length - a.readBooks.length;
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

  const filteredUsers = sortedUsers.filter(u => {
    if (!searchMember.trim()) return true;
    return u.name.toLowerCase().includes(searchMember.toLowerCase());
  });

  const myRankIndex = sortedUsers.findIndex(u => u.id === currentUser.id);
  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 1;
  const nextUserAhead = myRankIndex > 0 ? sortedUsers[myRankIndex - 1] : null;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
          {t('leaderboardTitle')}
        </h1>
        <p className="text-xs text-[#9e948c] mt-1">
          {t('leaderboardSubtitle')}
        </p>
      </div>

      {/* Current User Rank Strip */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#2a2420] via-[#231f1d] to-[#1a1716] border border-[#dfcfb3]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#dfcfb3] text-[#1e1b1a] flex items-center justify-center font-display font-bold text-sm shadow">
            #{myRank}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#f5f2eb]">Ваша текущая позиция в рейтинге</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#dfcfb3]/20 text-[#dfcfb3] font-semibold">
                {TIERS[currentUser.tier]?.nameRu}
              </span>
            </div>
            <p className="text-xs text-[#a39b94]">
              {currentUser.xp} XP · {currentUser.coins} коинов · {currentUser.readBooks.length} прочитанных книг
            </p>
          </div>
        </div>

        {nextUserAhead && (
          <div className="text-xs text-[#dfcfb3] flex items-center gap-1.5 bg-[#191615] px-3 py-1.5 rounded-lg border border-[#3b3430]">
            <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              До #{myRank - 1} ({nextUserAhead.name}): <strong className="font-mono-numbers">{nextUserAhead.xp - currentUser.xp} XP</strong>
            </span>
          </div>
        )}
      </div>

      {/* Top 3 Podium Visual */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        {/* 2nd Place */}
        {sortedUsers[1] && (
          <div
            onClick={() => setSelectedUserModal(sortedUsers[1])}
            className="rounded-2xl p-5 bg-[#23201e] border border-stone-600/50 flex flex-col items-center text-center cursor-pointer hover:border-stone-400 transition-all md:order-1 order-2"
          >
            <div className="relative mb-3">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-stone-400/80 p-0.5">
                <img
                  src={sortedUsers[1].avatar}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-stone-300 text-stone-900 font-bold text-xs flex items-center justify-center shadow">
                2
              </div>
            </div>
            <span className="font-display text-sm font-bold text-[#f5f2eb]">
              {sortedUsers[1].name}
            </span>
            <span className="text-[10px] text-stone-300 font-medium mt-0.5">
              {TIERS[sortedUsers[1].tier]?.nameRu}
            </span>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#302a28] text-xs">
              <span className="font-mono-numbers font-bold text-[#dfcfb3]">{sortedUsers[1].xp} XP</span>
              <span className="text-[#8c8279]">·</span>
              <span className="text-[#a39b94]">{sortedUsers[1].readBooks.length} книг</span>
            </div>
          </div>
        )}

        {/* 1st Place Champion */}
        {sortedUsers[0] && (
          <div
            onClick={() => setSelectedUserModal(sortedUsers[0])}
            className="rounded-2xl p-6 bg-gradient-to-b from-[#2e2621] via-[#24201e] to-[#1c1917] border-2 border-[#dfcfb3] flex flex-col items-center text-center cursor-pointer shadow-[0_0_30px_rgba(223,207,179,0.2)] md:order-2 order-1 transform md:-translate-y-2 transition-all"
          >
            <Crown className="w-7 h-7 text-[#f5d77f] animate-bounce mb-1" />
            <div className="relative mb-3">
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-[#dfcfb3] p-1 shadow-lg">
                <img
                  src={sortedUsers[0].avatar}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="absolute -bottom-2 -right-1 w-7 h-7 rounded-full bg-[#dfcfb3] text-[#1e1b1a] font-bold text-xs flex items-center justify-center shadow-lg">
                1
              </div>
            </div>
            <span className="font-display text-base font-bold text-[#f5f2eb]">
              {sortedUsers[0].name}
            </span>
            <span className="text-xs text-[#dfcfb3] font-semibold mt-0.5">
              {TIERS[sortedUsers[0].tier]?.nameRu} 👑
            </span>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#3a332f] text-xs">
              <span className="font-mono-numbers font-bold text-[#f5d77f] text-sm">{sortedUsers[0].xp} XP</span>
              <span className="text-[#8c8279]">·</span>
              <span className="text-[#a39b94]">{sortedUsers[0].readBooks.length} книг</span>
              <span className="text-[#8c8279]">·</span>
              <span className="text-[#f5d77f]">{sortedUsers[0].coins} 🪙</span>
            </div>
          </div>
        )}

        {/* 3rd Place */}
        {sortedUsers[2] && (
          <div
            onClick={() => setSelectedUserModal(sortedUsers[2])}
            className="rounded-2xl p-5 bg-[#23201e] border border-amber-800/50 flex flex-col items-center text-center cursor-pointer hover:border-amber-700 transition-all md:order-3 order-3"
          >
            <div className="relative mb-3">
              <div className="w-16 h-16 rounded-full overflow-hidden ring-4 ring-amber-700/80 p-0.5">
                <img
                  src={sortedUsers[2].avatar}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <div className="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-amber-700 text-white font-bold text-xs flex items-center justify-center shadow">
                3
              </div>
            </div>
            <span className="font-display text-sm font-bold text-[#f5f2eb]">
              {sortedUsers[2].name}
            </span>
            <span className="text-[10px] text-amber-500 font-medium mt-0.5">
              {TIERS[sortedUsers[2].tier]?.nameRu}
            </span>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#302a28] text-xs">
              <span className="font-mono-numbers font-bold text-[#dfcfb3]">{sortedUsers[2].xp} XP</span>
              <span className="text-[#8c8279]">·</span>
              <span className="text-[#a39b94]">{sortedUsers[2].readBooks.length} книг</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Sorting Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-[#23201e] border border-[#352f2c] rounded-xl">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSortKey('xp')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'xp'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            По опыту (XP)
          </button>
          <button
            onClick={() => setSortKey('books')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'books'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            По книгам
          </button>
          <button
            onClick={() => setSortKey('events')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'events'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            По визитам
          </button>
          <button
            onClick={() => setSortKey('coins')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortKey === 'coins'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb]'
            }`}
          >
            По коинам 🪙
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8c8279]" />
          <input
            type="text"
            placeholder="Найти участника..."
            value={searchMember}
            onChange={e => setSearchMember(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3] w-full sm:w-48"
          />
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#1a1716] text-[#8c8279] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
            <tr>
              <th className="px-4 py-3">{t('rank')}</th>
              <th className="px-4 py-3">{t('member')}</th>
              <th className="px-4 py-3">Ранг & Уровень</th>
              <th className="px-4 py-3">{t('booksCount')}</th>
              <th className="px-4 py-3">{t('eventsCount')}</th>
              <th className="px-4 py-3">{t('shanyraqCoins')}</th>
              <th className="px-4 py-3 text-right">Очки Опыта (XP)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d2725]">
            {filteredUsers.map((user, idx) => {
              const rank = idx + 1;
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
                      <img
                        src={user.avatar}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover ring-1 ring-[#dfcfb3]/50"
                      />
                      <div>
                        <span className="font-bold text-[#f5f2eb] flex items-center gap-1.5">
                          {user.name}
                          {isMe && (
                            <span className="text-[10px] text-[#dfcfb3] font-normal">(Вы)</span>
                          )}
                        </span>
                        <span className="text-[10px] text-[#8c8279] block">
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
                    {user.readBooks.length}
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
  );
};
