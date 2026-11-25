import React, { useEffect, useState } from 'react';
import { ACHIEVEMENT_INTENT_EVENT, takeAchievementIntent } from '../utils/navIntent';
import { useBackLayer } from '../utils/backNav';
import { useApp } from '../context/AppContext';
import { ALL_ACHIEVEMENTS, isManualAchievement } from '../data/achievements';
import { formatShortDate } from '../utils/eventTime';
import { Achievement, UserProfile as User } from '../types';
import {
  Activity,
  Award,
  BookHeart,
  Handshake,
  Puzzle,
  BookMarked,
  BookOpen,
  Brain,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle,
  ClipboardCheck,
  Coins,
  Compass,
  Flame,
  Footprints,
  Heart,
  HeartHandshake,
  Hourglass,
  Landmark,
  Languages,
  Library,
  Medal,
  MessageSquarePlus,
  MessageSquareText,
  MessagesSquare,
  Mic,
  Palette,
  PenLine,
  PenTool,
  Presentation,
  ShieldCheck,
  Star,
  Sparkles,
  Sunrise,
  ThumbsUp,
  Trophy,
  Lock,
  Users,
  X,
} from 'lucide-react';

/** Icon names used in data/achievements.ts. Unknown names fall back to Award. */
import { ACHIEVEMENT_ICONS } from './achievementIcons';

const getIcon = (iconName: string) => ACHIEVEMENT_ICONS[iconName] || Award;

type StatusFilter = 'all' | 'earned' | 'locked';
type AchState = 'earned' | 'progress' | 'manual' | 'revoked';

interface AchRow {
  ach: Achievement;
  state: AchState;
  /** Earned: the unlock date (YYYY-MM-DD) when known. */
  earnedAt?: string;
  /** Automatic and not yet earned: the member's real metric value, capped at the target. */
  value: number;
  target: number;
  /** Members who have it (same data as the old "unlocked by" row). */
  holders: User[];
}

/**
 * Achievements: overview of the member's progress, category + status filters, compact cards,
 * a detail sheet. Everything is read from existing data — the rules, rewards and unlocking
 * (server in live, AppContext in demo) are not touched here.
 */
export const AchievementsView: React.FC = () => {
  const { allUsers, currentUser, t, lf, setSelectedUserModal, getAchievementProgress } = useApp();
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  // An achievement notification opens that achievement's window (residual findings 26.11).
  const [openId, setOpenId] = useState<string | null>(() => takeAchievementIntent());
  useEffect(() => {
    const onIntent = () => {
      const id = takeAchievementIntent();
      if (id) setOpenId(id);
    };
    window.addEventListener(ACHIEVEMENT_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(ACHIEVEMENT_INTENT_EVENT, onIntent);
  }, []);

  const members = allUsers.length;
  const mine = new Map(currentUser.achievements.map(a => [a.id, a]));
  const revoked = new Set(currentUser.revokedAchievementIds ?? []);

  const rows: AchRow[] = ALL_ACHIEVEMENTS.map(ach => {
    const own = mine.get(ach.id) ?? currentUser.achievements.find(a => a.titleRu === ach.titleRu);
    const target = Math.max(1, ach.rule?.threshold ?? ach.requiredCount ?? 1);
    const holders = allUsers.filter(u => u.achievements.some(a => a.id === ach.id || a.titleRu === ach.titleRu));
    if (own) return { ach, state: 'earned', earnedAt: own.unlockedAt, value: target, target, holders };
    if (revoked.has(ach.id)) return { ach, state: 'revoked', value: 0, target, holders };
    if (isManualAchievement(ach)) return { ach, state: 'manual', value: 0, target, holders };
    const value = Math.min(getAchievementProgress(currentUser.id, ach.id), target);
    return { ach, state: 'progress', value, target, holders };
  });

  const categories = [
    { id: 'all', label: t('achCatAll') },
    { id: 'books', label: t('achCatBooks') },
    { id: 'community', label: t('achCatCommunity') },
    { id: 'english', label: t('achCatEnglish') },
    { id: 'sport', label: t('achCatSport') },
    { id: 'general', label: t('achCatGeneral') },
    { id: 'challenges', label: t('achCatChallenges') },
  ].filter(c => c.id === 'all' || rows.some(r => r.ach.category === c.id)); // only categories that have achievements

  const inCategory = rows.filter(r => category === 'all' || r.ach.category === category);
  const earnedRows = rows.filter(r => r.state === 'earned');
  const shown = inCategory
    .filter(r => status === 'all' || (status === 'earned' ? r.state === 'earned' : r.state !== 'earned'))
    // Not-yet-earned: the closest goals first.
    .sort((a, b) => (status === 'locked' ? b.value / b.target - a.value / a.target : 0));

  const total = rows.length;
  const percent = total ? Math.round((earnedRows.length / total) * 100) : 0;
  const latest = earnedRows
    .filter(r => r.earnedAt)
    .sort((a, b) => (b.earnedAt! > a.earnedAt! ? 1 : b.earnedAt! < a.earnedAt! ? -1 : 0))[0];
  const open = rows.find(r => r.ach.id === openId) ?? null;

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 w-full max-w-full">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#f5f2eb]">{t('achievementsTitle')}</h1>
        <p className="text-[13px] text-[#9e948c] mt-0.5">{t('achievementsSubtitle')}</p>
      </div>

      {/* Overview: earned / total, completion, latest */}
      <section className="rounded-2xl bg-gradient-to-br from-[#26211f] to-[#1d1a19] border border-[#3d3632] p-4 sm:p-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-lg sm:text-xl font-bold text-[#f5f2eb]">
              {t('achOverviewEarned').replace('{n}', String(earnedRows.length)).replace('{total}', String(total))}
            </span>
            <span className="font-mono-numbers text-sm font-semibold text-[#dfcfb3]">{percent}%</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[#141211] border border-[#3b3430] overflow-hidden" role="progressbar" aria-label={t('achOverviewEarned').replace('{n}', String(earnedRows.length)).replace('{total}', String(total))} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-[#dfcfb3] transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {latest ? (
          <button
            onClick={() => setOpenId(latest.ach.id)}
            className="flex items-center gap-3 p-2.5 pr-3.5 rounded-xl bg-[#1c1918] border border-[#352f2c] hover:border-[#4d443f] text-left transition-colors min-w-0 sm:max-w-xs"
          >
            <AchIcon row={latest} size="sm" />
            <span className="min-w-0">
              <span className="block text-[11px] text-[#9e948c]">{t('achLatest')} · {formatShortDate(latest.earnedAt, t)}</span>
              <span className="block text-[13px] font-semibold text-[#f5f2eb] truncate">{lf(latest.ach, 'title')}</span>
            </span>
          </button>
        ) : (
          earnedRows.length === 0 && <p className="text-[13px] text-[#9e948c]">{t('achNoneYet')}</p>
        )}
      </section>

      {/* Filters: status (segmented) + categories (scrolling chips) */}
      <div className="space-y-2.5">
        <div className="flex items-center bg-[#23201e] rounded-xl p-1 border border-[#352f2c] w-full sm:w-auto sm:inline-flex" role="group">
          {(['all', 'earned', 'locked'] as const).map(s => {
            const count = s === 'all' ? inCategory.length : inCategory.filter(r => (s === 'earned') === (r.state === 'earned')).length;
            return (
              <button
                key={s}
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`flex-1 sm:flex-none min-h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  status === s ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#9e948c] hover:text-[#d6cebf]'
                }`}
              >
                {t(s === 'all' ? 'achFilterAll' : s === 'earned' ? 'achFilterEarned' : 'achFilterLocked')}
                <span className="ml-1 font-mono-numbers text-[11px] opacity-90">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="-mx-3 sm:mx-0 px-3 sm:px-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {categories.map(c => {
            const inCat = rows.filter(r => c.id === 'all' || r.ach.category === c.id);
            const earned = inCat.filter(r => r.state === 'earned').length;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                aria-pressed={category === c.id}
                className={`chip shrink-0 gap-1.5 ${category === c.id ? 'chip-active' : ''}`}
              >
                {c.label}
                <span className="font-mono-numbers text-[11px] opacity-90">{earned}/{inCat.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      {shown.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-[#23201e] border border-[#352f2c]">
          <Award className="w-9 h-9 mx-auto text-[#9e948c] opacity-50" />
          <p className="mt-2 text-[13px] text-[#9e948c] max-w-sm mx-auto">
            {status === 'earned' ? t('achEmptyEarned') : t('achEmptyLocked')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map(row => (
            <AchCard key={row.ach.id} row={row} members={members} onOpen={() => setOpenId(row.ach.id)} />
          ))}
        </div>
      )}

      {open && (
        <AchDetail
          row={open}
          members={members}
          onClose={() => setOpenId(null)}
          onMember={u => { setOpenId(null); setSelectedUserModal(u); }}
        />
      )}
    </div>
  );
};

/** Icon tile: gold for earned, muted for not yet earned; a small mark for special (moderator) ones. */
const AchIcon: React.FC<{ row: AchRow; size?: 'sm' | 'md' | 'lg' }> = ({ row, size = 'md' }) => {
  const Icon = getIcon(row.ach.icon);
  const earned = row.state === 'earned';
  const special = isManualAchievement(row.ach);
  const box = size === 'lg' ? 'w-20 h-20 rounded-2xl' : size === 'sm' ? 'w-10 h-10 rounded-xl' : 'w-12 h-12 rounded-xl';
  const ico = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <span
      className={`relative ${box} shrink-0 flex items-center justify-center border ${
        earned
          ? special
            ? 'bg-amber-400/10 border-amber-300/70 text-amber-200'
            : 'bg-[#dfcfb3]/15 border-[#dfcfb3]/80 text-[#ecd9bf]'
          : 'bg-[#1a1716] border-[#3b3430] text-[#6f665f]'
      }`}
    >
      <Icon className={ico} />
      {!earned && (
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#23201e] border border-[#3b3430] flex items-center justify-center">
          <Lock className="w-2.5 h-2.5 text-[#9e948c]" />
        </span>
      )}
    </span>
  );
};

const Rewards: React.FC<{ ach: Achievement }> = ({ ach }) => (
  <span className="inline-flex items-center gap-2 text-[11px] font-mono-numbers whitespace-nowrap">
    <span className="inline-flex items-center gap-0.5 text-[#dfcfb3]"><Sparkles className="w-3 h-3" />+{ach.xpReward} XP</span>
    <span className="inline-flex items-center gap-0.5 text-[#f5d77f]"><Coins className="w-3 h-3 text-amber-400" />+{ach.coinReward}</span>
  </span>
);

const ProgressBar: React.FC<{ value: number; target: number }> = ({ value, target }) => (
  <span className="flex items-center gap-2">
    <span className="flex-1 h-1.5 rounded-full bg-[#141211] overflow-hidden">
      <span className="block h-full rounded-full bg-[#c8b393]" style={{ width: `${Math.round((value / target) * 100)}%` }} />
    </span>
    <span className="text-[11px] font-mono-numbers text-[#9e948c]">{value}/{target}</span>
  </span>
);

const AchCard: React.FC<{ row: AchRow; members: number; onOpen: () => void }> = ({ row, members, onOpen }) => {
  const { t, lf } = useApp();
  const earned = row.state === 'earned';
  const special = isManualAchievement(row.ach);
  return (
    <button
      onClick={onOpen}
      className={`group text-left w-full rounded-2xl p-4 border flex flex-col gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60 ${
        earned
          ? 'bg-gradient-to-b from-[#2a2420] to-[#211e1c] border-[#dfcfb3]/35 hover:border-[#dfcfb3]/60'
          : 'bg-[#211e1c] border-[#352f2c] hover:border-[#4d443f]'
      }`}
    >
      <span className="flex items-start gap-3 min-w-0">
        <AchIcon row={row} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={`font-display text-[15px] font-bold leading-snug ${earned ? 'text-[#f5f2eb]' : 'text-[#d6cebf]'}`}>
              {lf(row.ach, 'title')}
            </span>
            {special && (
              <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-amber-400/10 text-amber-200 border border-amber-300/30">
                {t('achSpecial')}
              </span>
            )}
          </span>
          <span className="mt-1 block text-[12.5px] text-[#9e948c] leading-relaxed line-clamp-2">{lf(row.ach, 'description')}</span>
        </span>
      </span>

      <span className="mt-auto block space-y-2">
        {row.state === 'progress' && <ProgressBar value={row.value} target={row.target} />}
        <span className="flex items-center justify-between gap-2 text-[11px]">
          {earned ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium min-w-0">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{row.earnedAt ? t('achEarnedOn').replace('{date}', formatShortDate(row.earnedAt, t)) : t('achUnlocked')}</span>
            </span>
          ) : row.state === 'manual' ? (
            <span className="inline-flex items-center gap-1 text-[#9e948c] min-w-0"><ShieldCheck className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{t('achByModerator')}</span></span>
          ) : row.state === 'revoked' ? (
            <span className="text-[#9e948c] truncate">{t('achRevoked')}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[#9e948c] min-w-0"><Users className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{t('achEarnedByCount').replace('{n}', String(row.holders.length)).replace('{m}', String(members))}</span></span>
          )}
          <Rewards ach={row.ach} />
        </span>
      </span>
    </button>
  );
};

const AchDetail: React.FC<{ row: AchRow; members: number; onClose: () => void; onMember: (u: User) => void }> = ({ row, members, onClose, onMember }) => {
  const { t, lf } = useApp();
  const earned = row.state === 'earned';
  const special = isManualAchievement(row.ach);
  useBackLayer(true, onClose); // Phase 6 (N-4): Back closes it
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      onClick={e => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md max-h-full sm:max-h-[90dvh] flex flex-col overflow-hidden bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl">
        <button onClick={onClose} aria-label={t('actionClose')} className="absolute top-3 right-3 z-10 btn-icon text-[#9e948c]">
          <X className="w-4 h-4" />
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3 pt-2">
            <AchIcon row={row} size="lg" />
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#f5f2eb] leading-snug px-6">{lf(row.ach, 'title')}</h2>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${earned ? 'bg-emerald-900/60 text-emerald-200' : 'bg-[#1a1716] text-[#9e948c] border border-[#3b3430]'}`}>
                  {earned ? t('achUnlocked') : row.state === 'revoked' ? t('achRevoked') : t('achFilterLocked')}
                </span>
                {special && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-400/10 text-amber-200 border border-amber-300/30">{t('achSpecial')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('achHowToEarn')}</h3>
            <p className="text-sm text-[#d6cebf] leading-relaxed">{lf(row.ach, 'description')}</p>
            {special && <p className="text-[12px] text-[#9e948c]">{t('achSpecialHint')}</p>}
          </div>

          {row.state === 'progress' && (
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('achProgress')}</h3>
              <ProgressBar value={row.value} target={row.target} />
            </div>
          )}

          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28]">
              <span className="block text-[11px] text-[#9e948c]">{t('achReward')}</span>
              <span className="mt-1 block"><Rewards ach={row.ach} /></span>
            </div>
            <div className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28]">
              <span className="block text-[11px] text-[#9e948c]">{earned ? t('achFilterEarned') : t('achCatCommunity')}</span>
              <span className="mt-1 block text-[13px] font-medium text-[#e6dfd3]">
                {earned && row.earnedAt ? formatShortDate(row.earnedAt, t) : t('achEarnedByCount').replace('{n}', String(row.holders.length)).replace('{m}', String(members))}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('unlockedBy')}</h3>
            {row.holders.length === 0 ? (
              <p className="text-[13px] text-[#9e948c]">{t('achNobodyYet')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {row.holders.slice(0, 12).map(u => (
                  <button key={u.id} onClick={() => onMember(u)} title={u.name} className="flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full bg-[#1c1918] border border-[#302a28] hover:border-[#4d443f] min-h-8">
                    <img src={u.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                    <span className="text-[12px] text-[#d6cebf] max-w-[9rem] truncate">{u.name}</span>
                  </button>
                ))}
                {row.holders.length > 12 && <span className="self-center text-[11px] text-[#9e948c] font-mono-numbers">+{row.holders.length - 12}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
