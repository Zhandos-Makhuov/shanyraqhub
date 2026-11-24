import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile, UserRole } from '../types';
import { canAssignRole, hasRole } from '../utils/permissions';
import { computeCommunityStats, computeDirectionReach } from '../utils/communityStats';
import { hasQualifyingReview } from '../utils/bookCredit';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';
import { TIERS } from '../data/gamification';
import { AvatarWithFallback } from './ProfileParts';
import { ConfirmDialog } from './ForumPostTools';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'organizer', label: 'Organizer' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];
import { COMMUNITY_DIRECTIONS, activeDirections } from '../data/directions';
import { formatTelegramMarkdown, formatWhatsAppMessage } from '../utils/notifications';
import { MembershipApplications } from './MembershipApplications';
import { DirectionsManager } from './DirectionsManager';
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
    ln,
    lf,
  } = useApp();

  // A role select is editable only if at least one other role may be assigned.
  const canManageRolesOf = (user: UserProfile) =>
    ROLE_OPTIONS.some(opt => opt.value !== user.role && canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value));

  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'broadcast' | 'audit'>('analytics');
  const roleLabel = (r: UserRole) => t(`role_${r}`);

  // Results of admin actions are shown here (not in a browser alert); errors from the server still come as before.
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Role changes, coin adjustments and revocations need a confirmation: a select changed by mistake must not change rights.
  type Pending =
    | { kind: 'role'; user: UserProfile; role: UserRole }
    | { kind: 'coins'; user: UserProfile; amount: number; reason: string }
    | { kind: 'revoke'; user: UserProfile; achId: string; achTitle: string; reason: string };
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const runPending = async () => {
    if (!pending || pendingBusy) return;
    setPendingBusy(true);
    let ok = false;
    if (pending.kind === 'role') ok = await updateUserRole(pending.user.id, pending.role);
    if (pending.kind === 'coins') ok = !!(await adjustUserCoins(pending.user.id, pending.amount, pending.reason));
    if (pending.kind === 'revoke') ok = !!(await revokeAchievement(pending.user.id, pending.achId, pending.reason));
    setPendingBusy(false);
    const done = pending;
    setPending(null);
    if (!ok) return;
    if (done.kind === 'role') setNotice(t('admRoleChanged').replace('{name}', done.user.name).replace('{role}', roleLabel(done.role)));
    if (done.kind === 'coins') { setNotice(t('admCoinsAdjusted').replace('{n}', `${done.amount > 0 ? '+' : ''}${done.amount}`) + ` — ${done.user.name}`); setAdjustReason(''); }
    if (done.kind === 'revoke') { setNotice(t('admRevokedDone').replace('{ach}', done.achTitle).replace('{name}', done.user.name)); setRevokeReason(''); }
  };

  // Members list: search by name / handle and filter by role (many members).
  const [userQuery, setUserQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const uq = userQuery.trim().toLocaleLowerCase();
  const listedUsers = allUsers.filter(u => (roleFilter === 'all' || u.role === roleFilter)
    && (!uq || u.name.toLocaleLowerCase().includes(uq) || (u.handle ?? '').toLocaleLowerCase().includes(uq)));

  // Broadcast state
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastChannel, setBroadcastChannel] = useState<('push' | 'telegram' | 'whatsapp')[]>(['push', 'telegram']);
  const [broadcastTarget, setBroadcastTarget] = useState<string>('all');
  const [broadcastSentMsg, setBroadcastSentMsg] = useState('');

  // Coin adjustment state
  const [adjustTargetUserId, setAdjustTargetUserId] = useState(allUsers[0]?.id || '');
  const [adjustAmount, setAdjustAmount] = useState(50);
  const [adjustReason, setAdjustReason] = useState('');

  // Real numbers only (see utils/communityStats.ts).
  const stats = computeCommunityStats(allUsers, events);
  const directionReach = computeDirectionReach(allUsers, activeDirections().map(d => d.id));
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

    setBroadcastSentMsg(t('admBroadcastSent').replace('{title}', broadcastTitle));
    setBroadcastTitle('');
    setBroadcastContent('');
    setTimeout(() => setBroadcastSentMsg(''), 5000);
  };

  // Manual achievements (speech, race, quiz...) confirmed by a moderator.
  const manualAchievements = ALL_ACHIEVEMENTS.filter(isManualAchievement);
  const canAwardAchievements = hasRole(currentUser.role, 'moderator');
  const awardCandidates = allUsers.filter(u => u.id !== currentUser.id || currentUser.role === 'super_admin');
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

  const handleRevokeAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRevokeId) return;
    const ach = revokeUserAchievements.find(a => a.id === selectedRevokeId);
    const user = allUsers.find(u => u.id === revokeUserId);
    if (!user) return;
    setPending({ kind: 'revoke', user, achId: selectedRevokeId, achTitle: lf(ach, 'title'), reason: revokeReason });
  };

  const handleAwardAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await awardAchievement(awardUserId, awardAchievementId, awardNote))) return;
    const ach = manualAchievements.find(a => a.id === awardAchievementId);
    const user = allUsers.find(u => u.id === awardUserId);
    setAwardNote('');
    setNotice(t('admAwarded').replace('{ach}', lf(ach, 'title')).replace('{name}', user?.name ?? ''));
  };

  const handleCoinAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    const user = allUsers.find(u => u.id === adjustTargetUserId);
    if (!user || !Number(adjustAmount) || !adjustReason.trim()) return;
    setPending({ kind: 'coins', user, amount: Number(adjustAmount), reason: adjustReason.trim() });
  };

  const pendingText = !pending ? '' : pending.kind === 'role'
    ? t('admRoleConfirmText').replace('{name}', pending.user.name).replace('{from}', roleLabel(pending.user.role)).replace('{to}', roleLabel(pending.role))
    : pending.kind === 'coins'
      ? t('admCoinsConfirmText').replace('{name}', pending.user.name).replace('{n}', `${pending.amount > 0 ? '+' : ''}${pending.amount}`).replace('{reason}', pending.reason)
      : t('admRevokeConfirm').replace('{ach}', pending.achTitle).replace('{name}', pending.user.name);

  return (
    <div className="space-y-6 pb-12">
      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'role' ? t('admRoleConfirmQ') : pending?.kind === 'coins' ? t('admCoinsConfirmQ') : t('admRevokeConfirmQ')}
        text={pendingText}
        confirmLabel={t('admConfirmApply')}
        busyLabel={t('evWorking')}
        cancelLabel={t('frmCancel')}
        busy={pendingBusy}
        onConfirm={() => void runPending()}
        onCancel={() => setPending(null)}
      />
      {notice && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-xl border bg-emerald-950/30 border-emerald-900/60 text-[13px] text-emerald-200" data-admin-notice>
          <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
        </div>
      )}
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#29221e] to-[#1c1917] border border-[#3f3834]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#dfcfb3]">
            <ShieldCheck className="w-4 h-4" />
            <span>{t('admKicker')}</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
            {t('admTitle')}
          </h1>
          <p className="text-xs text-[#a39b94]">
            {t('admSubtitle')}
          </p>
        </div>

        <span className="text-xs px-3 py-1.5 rounded-lg bg-[#191615] border border-[#3d3632] text-[#dfcfb3] font-mono">
          {t('admRights')}: {currentUser.role.toUpperCase()}
        </span>
      </div>

      {/* Live: direction applications (moderators see all, leads see their direction) */}
      <MembershipApplications showWhenEmpty />
      {canRevokeAchievements && <DirectionsManager />}

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
          data-admin-tab="users"
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
              <span className="text-xs text-[#9e948c] block">{t('admTotalMembers')}</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb] mt-1 block">
                {stats.members}
              </span>
              <span className={`text-[11px] mt-1 block ${stats.newMembersLast30Days > 0 ? 'text-emerald-400' : 'text-[#9e948c]'}`}>
                {stats.newMembersLast30Days > 0 ? t('admNew30').replace('{n}', String(stats.newMembersLast30Days)) : t('admNoNew30')}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#9e948c] block">{t('admMeetupsHeld')}</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#dfcfb3] mt-1 block">
                {stats.eventsHeld}
              </span>
              <span className="text-[11px] text-[#9e948c] mt-1 block">{t('admInCalendar')}: {events.length}</span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#9e948c] block">{t('admTotalVisits')}</span>
              <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f] mt-1 block">
                {stats.verifiedVisits}
              </span>
              <span className="text-[11px] text-[#9e948c] mt-1 block">
                {stats.attendanceRate !== null ? t('admTurnout').replace('{n}', String(stats.attendanceRate)) : t('attNoEntries')}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
              <span className="text-xs text-[#9e948c] block">{t('admBooksReviewed')}</span>
              <span className="text-2xl font-bold font-mono-numbers text-cyan-300 mt-1 block">
                {stats.reviewedBooks}
              </span>
              <span className="text-[11px] text-[#9e948c] mt-1 block">
                {avgBookRating !== null ? `${t('admAvgRating')}: ${avgBookRating.toFixed(1)}★` : t('admNoRatings')}
              </span>
            </div>
          </div>

          {/* Popularity by Direction Bar Graph */}
          <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
              {t('admDirectionActivity')}
            </h3>

            <div className="space-y-3">
              {activeDirections().map(dir => {
                const pct = directionReach[dir.id] ?? 0;
                return (
                  <div key={dir.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#d6cebf]">{ln(dir)}</span>
                      <span className="font-mono text-[#dfcfb3]" title={t('admDirectionPctTitle')}>{pct}% {t('frmMembers')}</span>
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
                {t('admRolesTitle')}
              </h3>
              <span className="text-xs text-[#9e948c]" aria-live="polite">
                {t('admTotalMembers')}: {listedUsers.length === allUsers.length ? allUsers.length : `${listedUsers.length} / ${allUsers.length}`}
              </span>
            </div>
            <div className="p-3 border-b border-[#302a28] flex flex-col min-[420px]:flex-row gap-2" data-admin-user-filters>
              <input
                type="search"
                value={userQuery}
                onChange={e => setUserQuery(e.target.value)}
                aria-label={t('admSearchMembers')}
                placeholder={t('admSearchMembers')}
                className="flex-1 min-w-0 min-h-10 px-3 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#9e948c] focus:outline-none focus:border-[#dfcfb3]"
              />
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as 'all' | UserRole)}
                aria-label={t('admFilterRole')}
                className="min-h-10 px-2 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb]"
              >
                <option value="all">{t('admAllRoles')}</option>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{roleLabel(o.value)}</option>)}
              </select>
            </div>
            {listedUsers.length === 0 && <p className="p-6 text-center text-xs text-[#9e948c]" data-admin-users-empty>{t('admNoMembersFound')}</p>}

            {/* Mobile Cards List (< sm) */}
            <div className="sm:hidden divide-y divide-[#2d2725]">
              {listedUsers.map(user => (
                <div key={`mobile-user-${user.id}`} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <AvatarWithFallback src={user.avatar} name={user.name} className="w-9 h-9 ring-1 ring-[#dfcfb3]/40" textClassName="text-[10px]" />
                      <div>
                        <span className="font-bold text-xs text-[#f5f2eb] block">{user.name}</span>
                        <span className="text-[10px] text-[#9e948c] font-mono">{user.handle}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-semibold text-[#dfcfb3] block">
                        {ln(TIERS[user.tier])}
                      </span>
                      <span className="text-[11px] font-mono text-amber-400">
                        {user.coins} 🪙
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-[#9e948c]">{t('admAssignRole')}:</span>
                    <select
                      value={user.role}
                      disabled={!canManageRolesOf(user)}
                      onChange={e => setPending({ kind: 'role', user, role: e.target.value as UserRole })}
                      aria-label={`${t('admAssignRole')}: ${user.name}`}
                      className="px-2 py-1 rounded bg-[#191615] border border-[#3b3430] text-xs text-[#dfcfb3] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option
                          key={opt.value}
                          value={opt.value}
                          disabled={opt.value !== user.role && !canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value)}
                        >
                          {roleLabel(opt.value)}
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
                <thead className="bg-[#1a1716] text-[#9e948c] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
                  <tr>
                    <th className="px-4 py-3">{t('attMember')}</th>
                    <th className="px-4 py-3">{t('admTier')}</th>
                    <th className="px-4 py-3">{t('prfCoins')}</th>
                    <th className="px-4 py-3">{t('admCurrentRole')}</th>
                    <th className="px-4 py-3 text-right">{t('admAssignRole')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d2725]">
                  {listedUsers.map(user => (
                    <tr key={user.id} className="hover:bg-[#282321] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AvatarWithFallback src={user.avatar} name={user.name} className="w-7 h-7 ring-1 ring-[#dfcfb3]/40" textClassName="text-[10px]" />
                          <div>
                            <span className="font-bold text-[#f5f2eb] block">{user.name}</span>
                            <span className="text-[10px] text-[#9e948c] font-mono">{user.handle}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#dfcfb3]">
                        {ln(TIERS[user.tier])}
                      </td>
                      <td className="px-4 py-3 font-mono text-amber-400">
                        {user.coins} 🪙
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-[#191615] text-[#d6cebf] border border-[#3b3430]">
                          {roleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <select
                          value={user.role}
                          disabled={!canManageRolesOf(user)}
                          onChange={e => setPending({ kind: 'role', user, role: e.target.value as UserRole })}
                      aria-label={`${t('admAssignRole')}: ${user.name}`}
                          className="p-1 rounded bg-[#191615] border border-[#3b3430] text-[11px] text-[#dfcfb3] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {ROLE_OPTIONS.map(opt => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              disabled={opt.value !== user.role && !canAssignRole(currentUser.role, currentUser.id, user.id, user.role, opt.value)}
                            >
                              {roleLabel(opt.value)}
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
              <span>{t('admCoinAdjustTitle')}</span>
            </h3>

            <form onSubmit={handleCoinAdjust} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label htmlFor="adm-field-1" className="text-[#9e948c] block mb-1">{t('attMember')}</label>
                <select
                  id="adm-field-1"
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
                <label htmlFor="adm-field-2" className="text-[#9e948c] block mb-1">{t('admCoinAmount')}</label>
                <input
                  id="adm-field-2"
                  type="number"
                  required
                  value={adjustAmount}
                  onChange={e => setAdjustAmount(Number(e.target.value))}
                  className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label htmlFor="adm-field-3" className="text-[#9e948c] block mb-1">{t('admReason')}</label>
                <input
                  id="adm-field-3"
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
                  {t('admApply')}
                </button>
              </div>
            </form>
          </div>

          {/* Achievement Revoke Box (admin+) */}
          {canRevokeAchievements && (
            <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
              <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>{t('admRevokeTitle')}</span>
              </h3>
              <p className="text-[11px] text-[#9e948c]">
                {t('admRevokeText')}
              </p>

              <form onSubmit={handleRevokeAchievement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label htmlFor="adm-field-4" className="text-[#9e948c] block mb-1">{t('attMember')}</label>
                  <select
                    id="adm-field-4"
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
                  <label htmlFor="adm-field-5" className="text-[#9e948c] block mb-1">{t('admAchievement')}</label>
                  <select
                    id="adm-field-5"
                    value={selectedRevokeId}
                    onChange={e => setRevokeAchievementId(e.target.value)}
                    disabled={revokeUserAchievements.length === 0}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] disabled:opacity-50"
                  >
                    {revokeUserAchievements.length === 0 ? (
                      <option value="">{t('admNoAchievements')}</option>
                    ) : (
                      revokeUserAchievements.map(a => (
                        <option key={a.id} value={a.id}>{lf(a, 'title')}</option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="adm-field-6" className="text-[#9e948c] block mb-1">{t('admReasonRequired')}</label>
                  <input
                    id="adm-field-6"
                    type="text"
                    required
                    value={revokeReason}
                    placeholder={t('admRevokePlaceholder')}
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
                    {t('admRevokeTitle')}
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
                <span>{t('admAwardTitle')}</span>
              </h3>
              <p className="text-[11px] text-[#9e948c]">
                {t('admAwardText')}
              </p>

              <form onSubmit={handleAwardAchievement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label htmlFor="adm-field-7" className="text-[#9e948c] block mb-1">{t('attMember')}</label>
                  <select
                    id="adm-field-7"
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
                  <label htmlFor="adm-field-8" className="text-[#9e948c] block mb-1">{t('admAchievement')}</label>
                  <select
                    id="adm-field-8"
                    value={awardAchievementId}
                    onChange={e => setAwardAchievementId(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {manualAchievements.map(a => {
                      const owned = allUsers.find(u => u.id === awardUserId)?.achievements.some(x => x.id === a.id);
                      return (
                        <option key={a.id} value={a.id} disabled={owned}>
                          {lf(a, 'title')}{owned ? ` — ${t('admAlreadyHas')}` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label htmlFor="adm-field-9" className="text-[#9e948c] block mb-1">{t('admProof')}</label>
                  <input
                    id="adm-field-9"
                    type="text"
                    value={awardNote}
                    placeholder={t('admProofPlaceholder')}
                    onChange={e => setAwardNote(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>

                <div className="self-end">
                  <button
                    type="submit"
                    className="w-full p-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-colors"
                  >
                    {t('admAwardButton')}
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
              {t('admBroadcastTitle')}
            </h3>

            <form onSubmit={handleBroadcastSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="adm-bc-title" className="font-medium text-[#d6cebf] block mb-1">
                  {t('admBroadcastHeading')} *
                </label>
                <input
                  id="adm-bc-title"
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={e => setBroadcastTitle(e.target.value)}
                  placeholder={t('admBroadcastHeadingPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div>
                <label htmlFor="adm-bc-text" className="font-medium text-[#d6cebf] block mb-1">
                  {t('admBroadcastText')} *
                </label>
                <textarea
                  id="adm-bc-text"
                  rows={4}
                  required
                  value={broadcastContent}
                  onChange={e => setBroadcastContent(e.target.value)}
                  placeholder={t('admBroadcastTextPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adm-field-10" className="font-medium text-[#d6cebf] block mb-1">{t('admAudience')}</label>
                  <select
                    id="adm-field-10"
                    value={broadcastTarget}
                    onChange={e => setBroadcastTarget(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#191615] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    <option value="all">{t('admAllMembers')} ({allUsers.length})</option>
                    {activeDirections().map(d => (
                      <option key={d.id} value={d.id}>{ln(d)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('admChannels')}</label>
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
                <span>{t('admSendBroadcast')} ({broadcastChannel.join(', ')})</span>
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
            <span className="text-[10px] uppercase font-bold text-[#9e948c] tracking-wider block">
              {t('admTgPreview')}
            </span>

            <div className="p-4 rounded-xl bg-[#242b33] border border-[#3a4450] text-xs text-white space-y-2 font-sans shadow-lg">
              <div className="font-bold text-[#64b5f6] flex items-center gap-1">
                <span>🏛 SHANYRAQ HUB COMMUNITY</span>
              </div>
              <h4 className="font-bold text-sm">
                {broadcastTitle || t('admPreviewHeading')}
              </h4>
              <p className="text-stone-300 leading-relaxed text-xs">
                {broadcastContent || t('admPreviewText')}
              </p>
              <div className="pt-2 border-t border-stone-600/40 text-[10px] text-stone-400 italic">
                {t('admPreviewFooter')}
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
              {t('admAuditTitle')}
            </h3>
          </div>

          <div className="divide-y divide-[#2d2725]">
            {auditLogs.map(log => (
              <div key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#f5f2eb]">{log.adminId ? log.adminName : t('admAuditSystem')}</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#191615] text-[#dfcfb3] border border-[#352f2c]">
                      {log.action}
                    </span>
                    <span className="text-[#a39b94] font-medium">{log.target}</span>
                  </div>
                  <p className="text-[11px] text-[#9e948c]">{log.details}</p>
                </div>
                <span className="text-[10px] text-[#9e948c] font-mono whitespace-nowrap">
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
