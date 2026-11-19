import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile, UserRole } from '../types';
import { canAssignRole, hasRole } from '../utils/permissions';
import { computeCommunityStats, computeDirectionReach } from '../utils/communityStats';
import { hasQualifyingReview } from '../utils/bookCredit';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'organizer', label: 'Organizer' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import { formatTelegramMarkdown, formatWhatsAppMessage } from '../utils/notifications';
import {
  ShieldCheck,
  Award,
  Users,
  Send,
  Coins,
  BarChart3,
  FileText,
  CheckCircle,
  Clock,
  Sparkles,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  const {
    currentUser,
    allUsers,
    events,
    allReadBooks,
    updateUserRole,
    adjustUserCoins,
    awardAchievement,
    revokeAchievement,
    dispatchBroadcast,
    auditLogs,
    t,
  } = useApp();

  // A role select is editable only if at least one other role may be assigned.
  const canManageRolesOf = (user: UserProfile) =>
    ROLE_OPTIONS.some(opt => opt.value !== user.role && canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value));

  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'broadcast' | 'audit'>('analytics');

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastChannel, setBroadcastChannel] = useState<('push' | 'telegram' | 'whatsapp')[]>(['push', 'telegram']);
  const [broadcastTarget, setBroadcastTarget] = useState<string>('all');
  const [broadcastSentMsg, setBroadcastSentMsg] = useState('');

  // Coin adjustment state
  const [adjustTargetUserId, setAdjustTargetUserId] = useState(allUsers[0]?.id || '');
  const [adjustAmount, setAdjustAmount] = useState(50);
  const [adjustReason, setAdjustReason] = useState('Особый вклад в развитие книжного клуба');

  // Real numbers only (see utils/communityStats.ts).
  const stats = computeCommunityStats(allUsers, events);
  const directionReach = computeDirectionReach(allUsers, COMMUNITY_DIRECTIONS.map(d => d.id));
  const ratedBooks = allReadBooks.filter(hasQualifyingReview);
  const avgBookRating = ratedBooks.length > 0 ? ratedBooks.reduce((s, b) => s + b.userRating, 0) / ratedBooks.length : null;


  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastContent.trim()) return;

    dispatchBroadcast(
      broadcastTitle.trim(),
      broadcastContent.trim(),
      broadcastChannel,
      broadcastTarget
    );

    setBroadcastSentMsg(`Рассылка «${broadcastTitle}» успешно отправлена через ${broadcastChannel.join(', ')}!`);
    setBroadcastTitle('');
    setBroadcastContent('');
    setTimeout(() => setBroadcastSentMsg(''), 5000);
  };

  // Manual achievements (speech, race, quiz...) confirmed by a moderator.
  const manualAchievements = ALL_ACHIEVEMENTS.filter(isManualAchievement);
  const canAwardAchievements = hasRole(currentUser.role, 'moderator');
  const awardCandidates = allUsers.filter(u => u.id !== currentUser.id);
  const [awardUserId, setAwardUserId] = useState(awardCandidates[0]?.id || '');
  const [awardAchievementId, setAwardAchievementId] = useState(manualAchievements[0]?.id || '');
  const [awardNote, setAwardNote] = useState('');

  // Revoking (abuse or mistake) is admin-only.
  const canRevokeAchievements = hasRole(currentUser.role, 'admin');
  const [revokeUserId, setRevokeUserId] = useState(awardCandidates[0]?.id || '');
  const revokeUserAchievements = allUsers.find(u => u.id === revokeUserId)?.achievements || [];
  const [revokeAchievementId, setRevokeAchievementId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const selectedRevokeId = revokeUserAchievements.some(a => a.id === revokeAchievementId)
    ? revokeAchievementId
    : revokeUserAchievements[0]?.id || '';

  const handleRevokeAchievement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRevokeId) return;
    const ach = revokeUserAchievements.find(a => a.id === selectedRevokeId);
    const user = allUsers.find(u => u.id === revokeUserId);
    if (!window.confirm(`Отозвать «${ach?.titleRu}» у ${user?.name}? Награда за него будет списана.`)) return;
    if (!revokeAchievement(revokeUserId, selectedRevokeId, revokeReason)) return;
    setRevokeReason('');
  };

  const handleAwardAchievement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardAchievement(awardUserId, awardAchievementId, awardNote)) return;
    const ach = manualAchievements.find(a => a.id === awardAchievementId);
    const user = allUsers.find(u => u.id === awardUserId);
    setAwardNote('');
    alert(`Достижение «${ach?.titleRu}» выдано: ${user?.name}.`);
  };

  const handleCoinAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUserCoins(adjustTargetUserId, Number(adjustAmount), adjustReason.trim())) return;
    alert(`Баланс монет пользователя обновлен на ${adjustAmount > 0 ? '+' : ''}${adjustAmount} коинов.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#29221e] to-[#1c1917] border border-[#3f3834]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#dfcfb3]">
            <ShieldCheck className="w-4 h-4" />
            <span>Административный пульт Shanyraq Hub</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
            Управление сообществом и аналитика
          </h1>
          <p className="text-xs text-[#a39b94]">
            Модерация ролей, мгновенные рассылки Telegram / WhatsApp и статистика посещаемости
          </p>
        </div>

        <span className="text-xs px-3 py-1.5 rounded-lg bg-[#191615] border border-[#3d3632] text-[#dfcfb3] font-mono">
          Права: {currentUser.role.toUpperCase()}
        </span>
      </div>

      {/* Admin Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-[#302a28] pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'analytics'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{t('adminAnalytics')}</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'users'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{t('adminUsers')}</span>
        </button>

        <button
          onClick={() => setActiveTab('broadcast')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'broadcast'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          <span>{t('adminBroadcast')}</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            activeTab === 'audit'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{t('adminAudit')}</span>
        </button>
      </div>

      {/* TAB 1: ANALYTICS & REPORTS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#8c8279] block">Всего участников</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb] mt-1 block">
                {stats.members}
              </span>
              <span className={`text-[11px] mt-1 block ${stats.newMembersLast30Days > 0 ? 'text-emerald-400' : 'text-[#8c8279]'}`}>
                {stats.newMembersLast30Days > 0 ? `+${stats.newMembersLast30Days} за 30 дней` : 'новых за 30 дней нет'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#8c8279] block">Проведено встреч</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#dfcfb3] mt-1 block">
                {stats.eventsHeld}
              </span>
              <span className="text-[11px] text-[#8c8279] mt-1 block">всего в календаре: {events.length}</span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#8c8279] block">Всего посещений</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f] mt-1 block">
                {stats.verifiedVisits}
              </span>
              <span className="text-[11px] text-[#8c8279] mt-1 block">
                {stats.attendanceRate !== null ? `явка: ${stats.attendanceRate}% от записей` : 'записей пока нет'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#8c8279] block">Книг отрецензировано</span>
              <span className="text-2xl font-bold font-mono-numbers text-cyan-300 mt-1 block">
                {stats.reviewedBooks}
              </span>
              <span className="text-[11px] text-[#8c8279] mt-1 block">
                {avgBookRating !== null ? `средняя оценка: ${avgBookRating.toFixed(1)}★` : 'оценок пока нет'}
              </span>
            </div>
          </div>

          {/* Popularity by Direction Bar Graph */}
          <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
              Активность участников по направлениям сообщества
            </h3>

            <div className="space-y-3">
              {COMMUNITY_DIRECTIONS.map(dir => {
                const pct = directionReach[dir.id] ?? 0;
                return (
                  <div key={dir.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#d6cebf]">{dir.nameRu}</span>
                      <span className="font-mono text-[#dfcfb3]" title="Доля участников, посетивших хотя бы одну встречу направления">{pct}% участников</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#181514] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#967d58] to-[#dfcfb3] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER & ROLE MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Role Management Table */}
          <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
            <div className="p-4 border-b border-[#302a28] flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
                Управление ролями и правами участников
              </h3>
              <span className="text-xs text-[#8c8279]">
                Всего участников в базе: {allUsers.length}
              </span>
            </div>

            {/* Mobile Cards List (< sm) */}
            <div className="sm:hidden divide-y divide-[#2d2725]">
              {allUsers.map(user => (
                <div key={`mobile-user-${user.id}`} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={user.avatar}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover ring-1 ring-[#dfcfb3]/40"
                      />
                      <div>
                        <span className="font-bold text-xs text-[#f5f2eb] block">{user.name}</span>
                        <span className="text-[10px] text-[#8c8279] font-mono">{user.handle}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-semibold text-[#dfcfb3] block">
                        {user.tier.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-mono text-amber-400">
                        {user.coins} 🪙
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[#8c8279]">Назначить роль:</span>
                    <select
                      value={user.role}
                      disabled={!canManageRolesOf(user)}
                      onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                      className="px-2 py-1 rounded bg-[#191615] border border-[#3b3430] text-xs text-[#dfcfb3] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={opt.value !== user.role && !canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value)}
                        >
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#1a1716] text-[#8c8279] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
                  <tr>
                    <th className="px-4 py-3">Пользователь</th>
                    <th className="px-4 py-3">Ранг</th>
                    <th className="px-4 py-3">Коины</th>
                    <th className="px-4 py-3">Текущая роль</th>
                    <th className="px-4 py-3 text-right">Назначить роль</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d2725]">
                  {allUsers.map(user => (
                    <tr key={user.id} className="hover:bg-[#282321] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={user.avatar}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-[#dfcfb3]/40"
                          />
                          <div>
                            <span className="font-bold text-[#f5f2eb] block">{user.name}</span>
                            <span className="text-[10px] text-[#8c8279] font-mono">{user.handle}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#dfcfb3]">
                        {user.tier.toUpperCase()}
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-400">
                        {user.coins} 🪙
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono bg-[#191615] text-[#d6cebf] border border-[#3b3430]">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={user.role}
                          disabled={!canManageRolesOf(user)}
                          onChange={e => updateUserRole(user.id, e.target.value as UserRole)}
                          className="p-1 rounded bg-[#191615] border border-[#3b3430] text-[11px] text-[#dfcfb3] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              disabled={opt.value !== user.role && !canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value)}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manual Coin Adjustment Box */}
          <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Ручная корректировка баланса Shanyraq Coins</span>
            </h3>

            <form onSubmit={handleCoinAdjust} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-[#8c8279] block mb-1">Пользователь</label>
                <select
                  value={adjustTargetUserId}
                  onChange={e => setAdjustTargetUserId(e.target.value)}
                  className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                >
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.coins} 🪙)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[#8c8279] block mb-1">Сумма коинов (+ или -)</label>
                <input
                  type="number"
                  required
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label className="text-[#8c8279] block mb-1">Основание / Причина</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div className="self-end">
                <button
                  type="submit"
                  className="w-full p-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-colors"
                >
                  Применить начисление
                </button>
              </div>
            </form>
          </div>

          {/* Achievement Revoke Box (admin+) */}
          {canRevokeAchievements && (
            <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
              <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Отозвать достижение</span>
              </h3>
              <p className="text-[11px] text-[#8c8279]">
                Только при обмане или ошибочной выдаче. XP и коины за достижение списываются (баланс не уходит в минус),
                участник получает уведомление, отзыв записывается в журнал аудита. Само достижение больше не откроется автоматически.
              </p>

              <form onSubmit={handleRevokeAchievement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-[#8c8279] block mb-1">Участник</label>
                  <select
                    value={revokeUserId}
                    onChange={e => setRevokeUserId(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {awardCandidates.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.achievements.length})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[#8c8279] block mb-1">Достижение</label>
                  <select
                    value={selectedRevokeId}
                    onChange={e => setRevokeAchievementId(e.target.value)}
                    disabled={revokeUserAchievements.length === 0}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] disabled:opacity-50"
                  >
                    {revokeUserAchievements.length === 0 ? (
                      <option value="">Нет достижений</option>
                    ) : (
                      revokeUserAchievements.map(a => (
                        <option key={a.id} value={a.id}>{a.titleRu}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[#8c8279] block mb-1">Причина (обязательно)</label>
                  <input
                    type="text"
                    required
                    value={revokeReason}
                    placeholder="Напр.: рецензии скопированы из интернета"
                    onChange={e => setRevokeReason(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>

                <div className="self-end">
                  <button
                    type="submit"
                    disabled={!selectedRevokeId}
                    className="w-full p-2 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] border border-amber-800/70 text-xs font-semibold text-amber-300 transition-colors disabled:opacity-50"
                  >
                    Отозвать достижение
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Manual Achievement Award Box (moderator+) */}
          {canAwardAchievements && (
            <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
              <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
                <Award className="w-4 h-4 text-[#dfcfb3]" />
                <span>Выдать достижение за подтверждённое событие</span>
              </h3>
              <p className="text-[11px] text-[#8c8279]">
                Для наград, которые нельзя посчитать автоматически: выступление, забег, призовое место, марафон чтения.
                Каждая выдача записывается в журнал аудита.
              </p>

              <form onSubmit={handleAwardAchievement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-[#8c8279] block mb-1">Участник</label>
                  <select
                    value={awardUserId}
                    onChange={e => setAwardUserId(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {awardCandidates.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[#8c8279] block mb-1">Достижение</label>
                  <select
                    value={awardAchievementId}
                    onChange={e => setAwardAchievementId(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {manualAchievements.map(a => {
                      const owned = allUsers.find(u => u.id === awardUserId)?.achievements.some(x => x.id === a.id);
                      return (
                        <option key={a.id} value={a.id} disabled={owned}>
                          {a.titleRu}{owned ? ' — уже есть' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="text-[#8c8279] block mb-1">Подтверждение (необязательно)</label>
                  <input
                    type="text"
                    value={awardNote}
                    placeholder="Напр.: забег 16.11, 10 км"
                    onChange={e => setAwardNote(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>

                <div className="self-end">
                  <button
                    type="submit"
                    className="w-full p-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-colors"
                  >
                    Выдать достижение
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BROADCAST DISPATCHER */}
      {activeTab === 'broadcast' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
              Создать мгновенное оповещение участников
            </h3>

            <form onSubmit={handleBroadcastSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Заголовок рассылки *
                </label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  placeholder="Например: Срочный перенос времени Speaking Club"
                  className="w-full p-2.5 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Текст сообщения *
                </label>
                <textarea
                  rows={4}
                  required
                  value={broadcastContent}
                  onChange={e => setBroadcastContent(e.target.value)}
                  placeholder="Текст уведомления для push-сообщения и Telegram-бота..."
                  className="w-full p-2.5 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Аудитория</label>
                  <select
                    value={broadcastTarget}
                    onChange={e => setBroadcastTarget(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    <option value="all">Все участники ({allUsers.length})</option>
                    {COMMUNITY_DIRECTIONS.map(d => (
                      <option key={d.id} value={d.id}>{d.nameRu}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Каналы доставки</label>
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[#d6cebf]">
                      <input
                        type="checkbox"
                        checked={broadcastChannel.includes('push')}
                        onChange={e => {
                          if (e.target.checked) setBroadcastChannel([...broadcastChannel, 'push']);
                          else setBroadcastChannel(broadcastChannel.filter(c => c !== 'push'));
                        }}
                      />
                      <span>Web Push</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[#d6cebf]">
                      <input
                        type="checkbox"
                        checked={broadcastChannel.includes('telegram')}
                        onChange={e => {
                          if (e.target.checked) setBroadcastChannel([...broadcastChannel, 'telegram']);
                          else setBroadcastChannel(broadcastChannel.filter(c => c !== 'telegram'));
                        }}
                      />
                      <span>Telegram</span>
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Разослать участникам ({broadcastChannel.join(', ')})</span>
              </button>
            </form>

            {broadcastSentMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{broadcastSentMsg}</span>
              </div>
            )}
          </div>

          {/* Live Preview for Telegram / WhatsApp */}
          <div className="lg:col-span-5 p-6 rounded-2xl bg-[#1a1716] border border-[#352f2c] space-y-4">
            <span className="text-[10px] uppercase font-bold text-[#8c8279] tracking-wider block">
              Превью в Telegram Bot @ShanyraqHubBot
            </span>

            <div className="p-4 rounded-xl bg-[#242b33] border border-[#3a4450] text-xs text-white space-y-2 font-sans shadow-lg">
              <div className="font-bold text-[#64b5f6] flex items-center gap-1">
                <span>🏛 SHANYRAQ HUB COMMUNITY</span>
              </div>
              <h4 className="font-bold text-sm">
                {broadcastTitle || 'Заголовок оповещения...'}
              </h4>
              <p className="text-stone-300 leading-relaxed text-xs">
                {broadcastContent || 'Текст уведомления будет отображен здесь...'}
              </p>
              <div className="pt-2 border-t border-stone-600/40 text-[10px] text-stone-400 italic">
                Отправлено через официальный бот Shanyraq Hub
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
          <div className="p-4 border-b border-[#302a28]">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
              Журнал административных действий и аудита безопасности
            </h3>
          </div>

          <div className="divide-y divide-[#2d2725]">
            {auditLogs.map(log => (
              <div key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#f5f2eb]">{log.adminName}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#191615] text-[#dfcfb3] border border-[#352f2c]">
                      {log.action}
                    </span>
                    <span className="text-[#a39b94] font-medium">{log.target}</span>
                  </div>
                  <p className="text-[11px] text-[#8c8279]">{log.details}</p>
                </div>
                <span className="text-[10px] text-[#736a62] font-mono whitespace-nowrap">
                  {log.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
