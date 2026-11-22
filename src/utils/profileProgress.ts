import { TIERS } from '../data/gamification';
import { Achievement, TierInfo, TierLevel, UserProfile } from '../types';

export interface TierProgress {
  current: TierInfo;
  /** The next tier by XP threshold, or null on the top tier. */
  next: TierInfo | null;
  /** 0–100, whole percent of the way from the current tier's threshold to the next one (100 on the top tier). */
  percent: number;
  /** XP still needed for the next tier (0 on the top tier). */
  toNext: number;
}

/**
 * Progress to the next tier, read only from the existing TIERS thresholds (in live they come from the database).
 * Nothing about tiers or XP is changed here — the member's tier itself is still decided by tierForXp.
 */
export const tierProgress = (xp: number, tier: TierLevel): TierProgress => {
  const current = TIERS[tier] || TIERS.bronze;
  const safeXp = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const next =
    Object.values(TIERS)
      .filter(t => t.minXp > current.minXp)
      .sort((a, b) => a.minXp - b.minXp)[0] ?? null;
  if (!next) return { current, next: null, percent: 100, toNext: 0 };
  const span = next.minXp - current.minXp;
  const raw = span > 0 ? ((safeXp - current.minXp) / span) * 100 : 100;
  return {
    current,
    next,
    percent: Math.min(100, Math.max(0, Math.floor(raw))),
    toNext: Math.max(0, next.minXp - safeXp),
  };
};

/**
 * The member's latest earned achievements, newest first (by date, then by the order they were earned).
 * Revoked achievements are never shown as earned.
 */
export const recentAchievements = (user: Pick<UserProfile, 'achievements' | 'revokedAchievementIds'>, count = 3): Achievement[] => {
  const revoked = new Set(user.revokedAchievementIds ?? []);
  return user.achievements
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !revoked.has(a.id))
    .sort((x, y) => (y.a.unlockedAt ?? '').localeCompare(x.a.unlockedAt ?? '') || y.i - x.i)
    .slice(0, count)
    .map(({ a }) => a);
};

/** Earned achievements that are still in force (not revoked). */
export const activeAchievementCount = (user: Pick<UserProfile, 'achievements' | 'revokedAchievementIds'>): number => {
  const revoked = new Set(user.revokedAchievementIds ?? []);
  return user.achievements.filter(a => !revoked.has(a.id)).length;
};
