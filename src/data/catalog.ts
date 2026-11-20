/**
 * Reference data from the database (stage 6.2, live mode only — owner decision).
 *
 * In live mode the database is the single source of numbers, names, prices and pictures for
 * tiers, the shop and achievements: a new shop item or a new price appears without rebuilding
 * the site. The code keeps only the LOOK (tier colours/badges) and the achievement metric rules.
 *
 * The lists the screens import (TIERS, SHOP_ITEMS, ALL_ACHIEVEMENTS) are updated IN PLACE once,
 * right after sign-in and before the app renders, so every screen keeps working unchanged.
 * Demo mode never calls this and keeps the lists from the code.
 */
import { ALL_ACHIEVEMENTS } from './achievements';
import { SHOP_ITEMS, TIERS } from './gamification';
import type { Achievement, AchievementRule, ItemCategory, ItemRarity, ShopItem, TierLevel } from '../types';

export interface TierRow {
  tier: string;
  min_xp: number;
  sort_order: number;
  name_ru: string;
  name_kz: string;
  name_en: string;
  coin_multiplier: number | string;
}

export interface ShopItemRow {
  id: string;
  name_ru: string;
  name_kz: string;
  name_en: string;
  description_ru: string;
  description_kz: string;
  description_en: string;
  category: ItemCategory;
  rarity: ItemRarity;
  price_coins: number;
  preview_url: string | null;
  style: { borderStyle?: string; glowStyle?: string; badgeTitle?: string } | null;
  is_active: boolean;
}

export interface AchievementRow {
  id: string;
  title_ru: string;
  title_kz: string;
  title_en: string;
  description_ru: string;
  description_kz: string;
  description_en: string;
  icon: string;
  category: Achievement['category'];
  rule: AchievementRule;
  xp_reward: number;
  coin_reward: number;
  is_active: boolean;
}

export interface CatalogRows {
  tiers: TierRow[];
  shopItems: ShopItemRow[];
  achievements: AchievementRow[];
}

/** What the database had that the code cannot show yet (e.g. a new tier needs colours and a badge). */
export interface CatalogReport {
  unknownTiers: string[];
}


/** The database has no display order: keep the code's order, new items from the database go last. */
const inCodeOrder = <T extends { id: string }>(items: T[], codeIds: string[]): T[] => {
  const pos = (id: string) => {
    const i = codeIds.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...items].sort((a, b) => pos(a.id) - pos(b.id));
};

export const shopItemFromRow = (r: ShopItemRow): ShopItem => ({
  id: r.id,
  nameRu: r.name_ru,
  nameKz: r.name_kz,
  nameEn: r.name_en,
  descriptionRu: r.description_ru,
  descriptionKz: r.description_kz,
  descriptionEn: r.description_en,
  category: r.category,
  rarity: r.rarity,
  priceCoins: r.price_coins,
  previewUrl: r.preview_url || '', // no picture: the shop shows the member's own photo with the item applied
  borderStyle: r.style?.borderStyle,
  glowStyle: r.style?.glowStyle,
  badgeTitle: r.style?.badgeTitle,
});

export const achievementFromRow = (r: AchievementRow): Achievement => ({
  id: r.id,
  titleRu: r.title_ru,
  titleKz: r.title_kz,
  titleEn: r.title_en,
  descriptionRu: r.description_ru,
  descriptionKz: r.description_kz,
  descriptionEn: r.description_en,
  icon: r.icon,
  category: r.category,
  isUnlocked: false,
  requiredCount: r.rule?.threshold,
  xpReward: r.xp_reward,
  coinReward: r.coin_reward,
  rule: r.rule,
});

/** Replaces the code's lists with the database's (in place). Call once, before the app renders. */
export const applyCatalog = (rows: CatalogRows): CatalogReport => {
  const unknownTiers: string[] = [];

  // Tiers: thresholds, names and coin bonus from the DB; colours and badges stay in the code.
  for (const row of rows.tiers) {
    const info = TIERS[row.tier as TierLevel];
    if (!info) {
      unknownTiers.push(row.tier);
      continue;
    }
    info.minXp = row.min_xp;
    info.nameRu = row.name_ru;
    info.nameKz = row.name_kz;
    info.nameEn = row.name_en;
    info.attendanceCoinBonusPercent = Math.round((Number(row.coin_multiplier) - 1) * 100);
  }

  // Shop: only active items.
  const items = inCodeOrder(rows.shopItems.filter(r => r.is_active).map(shopItemFromRow), SHOP_ITEMS.map(i => i.id));
  if (items.length > 0 || rows.shopItems.length > 0) SHOP_ITEMS.splice(0, SHOP_ITEMS.length, ...items);

  // Achievements: only active ones (a deactivated achievement is hidden, already earned ones stay in history).
  const achievements = inCodeOrder(rows.achievements.filter(r => r.is_active).map(achievementFromRow), ALL_ACHIEVEMENTS.map(a => a.id));
  if (achievements.length > 0 || rows.achievements.length > 0) ALL_ACHIEVEMENTS.splice(0, ALL_ACHIEVEMENTS.length, ...achievements);

  if (unknownTiers.length) console.warn('[catalog] tiers in the database without a look in the code:', unknownTiers);
  return { unknownTiers };
};
