import React, { useEffect, useState } from 'react';
import { Award, Coins, Send, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SHOP_ITEMS } from '../data/gamification';
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import { formatClubDate } from '../utils/eventTime';
import { recentAchievements, tierProgress } from '../utils/profileProgress';
import { ACHIEVEMENT_ICONS } from './achievementIcons';
import { PeerReview, ShopItem, UserProfile, UserRole } from '../types';

/** "Алихан Берік" → "АБ"; one word → its first letter. */
export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase() || '?';

/** Round photo; if it is missing or fails to load — the member's initials in the same circle. */
export const AvatarWithFallback: React.FC<{ src?: string; name: string; className?: string; textClassName?: string }> = ({
  src,
  name,
  className = 'w-10 h-10',
  textClassName = 'text-sm',
}) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={name}
        data-avatar-fallback
        className={`${className} shrink-0 rounded-full bg-gradient-to-br from-[#3a322d] to-[#26211f] text-[#ecd9bf] font-semibold flex items-center justify-center select-none overflow-hidden ${textClassName}`}
      >
        {initialsOf(name)}
      </span>
    );
  }
  return <img src={src} alt={name} onError={() => setFailed(true)} className={`${className} shrink-0 rounded-full object-cover`} />;
};

/** Colour of an aura's glow, read from the item's own style (rgba in glowStyle); sky blue if none. */
const auraColor = (aura: ShopItem): string => {
  const m = aura.glowStyle?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, 0.4)` : 'rgba(56, 189, 248, 0.3)';
};

/** Short badge of a talisman/skin in the member's language; falls back to the stored title, then the item name. */
export const useBadgeLabel = () => {
  const { t, ln } = useApp();
  return (item: ShopItem): string => {
    const key = `badge_${item.id}`;
    const v = t(key);
    return v !== key ? v : item.badgeTitle || ln(item);
  };
};

/** Avatar with everything the member has equipped: aura, frame, skin and talisman badge. */
export const EquippedAvatar: React.FC<{ user: UserProfile; size: 'md' | 'lg' }> = ({ user, size }) => {
  const { ln } = useApp();
  const badgeLabel = useBadgeLabel();
  const frame = SHOP_ITEMS.find(i => i.id === user.inventory.equippedFrame);
  const skin = SHOP_ITEMS.find(i => i.id === user.inventory.equippedAvatarSkin);
  const artifact = SHOP_ITEMS.find(i => i.id === user.inventory.equippedArtifact);
  const aura = SHOP_ITEMS.find(i => i.id === user.inventory.equippedAura);
  const lg = size === 'lg';
  return (
    <div className="relative shrink-0">
      {aura && (
        <div
          className="absolute inset-0 rounded-full blur-xl pointer-events-none"
          style={{ backgroundColor: auraColor(aura) }}
          title={ln(aura)}
        />
      )}
      <div
        className={`relative rounded-full overflow-hidden ${lg ? 'w-24 h-24 p-1' : 'w-16 h-16 p-0.5'} ${
          frame?.borderStyle || (lg ? 'ring-4 ring-[#dfcfb3]/50' : 'ring-2 ring-[#dfcfb3]/40')
        }`}
        title={frame ? ln(frame) : undefined}
      >
        <AvatarWithFallback
          src={skin?.previewUrl || user.avatar}
          name={user.name}
          className="w-full h-full"
          textClassName={lg ? 'text-2xl' : 'text-lg'}
        />
      </div>
      {artifact && (
        <span
          title={ln(artifact)}
          className={`absolute whitespace-nowrap rounded-full bg-[#1e1b1a] border border-[#dfcfb3] font-bold text-[#f5d77f] shadow ${
            lg ? '-bottom-2 -right-1 px-2 py-0.5 text-[9px]' : '-bottom-1 -right-1 px-1.5 text-[8px]'
          }`}
        >
          {badgeLabel(artifact)}
        </span>
      )}
    </div>
  );
};

/** Translated role; nothing for an ordinary member. */
export const ProfileRoleBadge: React.FC<{ role: UserRole; compact?: boolean }> = ({ role, compact }) => {
  const { t } = useApp();
  if (role === 'member') return null;
  return (
    <span
      data-role-badge={role}
      className={`inline-flex items-center rounded-full border border-[#4a3f36] bg-[#2a2320] text-[#e3cfa9] font-semibold whitespace-nowrap ${
        compact ? 'px-1.5 py-px text-[10px]' : 'px-2.5 py-0.5 text-[11px]'
      }`}
    >
      {t(`role_${role}`)}
    </span>
  );
};

/** Name of a club direction in the member's language (never its internal id, unless the direction is unknown). */
export const useDirectionName = () => {
  const { lf, ln } = useApp();
  return (id: string): string => {
    const dir = COMMUNITY_DIRECTIONS.find(d => d.id === id);
    return lf(dir, 'shortName') || ln(dir) || id;
  };
};

/** One review about a member: author (photo, name, role), stars, text, date and aspect. */
export const ReviewCard: React.FC<{ review: PeerReview; compact?: boolean }> = ({ review, compact }) => {
  const { t } = useApp();
  return (
    <div className={`rounded-xl bg-[#1c1918] border border-[#302a28] text-xs ${compact ? 'p-2.5 space-y-1' : 'p-4 space-y-2'}`} data-review-card>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <AvatarWithFallback src={review.authorAvatar} name={review.authorName} className="w-6 h-6" textClassName="text-[10px]" />
          <span className="font-bold text-[#f5f2eb] break-words min-w-0">{review.authorName}</span>
          <ProfileRoleBadge role={review.authorRole} compact />
        </div>
        <span className="shrink-0 flex items-center gap-1 text-amber-400 font-mono" aria-label={`${review.rating}/5`}>
          <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          {review.rating}/5
        </span>
      </div>
      <p className={`text-[#d6cebf] leading-relaxed break-words ${compact ? 'text-[11px]' : 'text-xs'}`}>«{review.comment}»</p>
      <span className="text-[11px] text-[#9e948c] block">
        {formatClubDate(review.createdAt, t)} · {t('prfAspect')}: {t(`aspect_${review.aspect}`)}
      </span>
    </div>
  );
};

/**
 * A Telegram username as Telegram allows it (5–32 letters, digits, "_"; with or without "@").
 * Only such a value becomes a t.me link; anything else is shown as plain text, never turned into a URL.
 */
export const telegramUsername = (value: string | undefined): string | null => {
  const m = (value ?? '').trim().match(/^@?([A-Za-z][A-Za-z0-9_]{4,31})$/);
  return m ? m[1] : null;
};

/** Telegram contact: Telegram icon and colour (different from the club handle), label for screen readers, wraps on narrow screens. */
export const TelegramContact: React.FC<{ value?: string; className?: string }> = ({ value, className = '' }) => {
  const { t } = useApp();
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const username = telegramUsername(raw);
  const text = username ? `@${username}` : raw;
  const inner = (
    <>
      <Send className="w-3.5 h-3.5 text-[#6fb3e0] shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('prfTelegramLabel')}: </span>
      <span className="font-mono text-[#a7c9e0] break-all">{text}</span>
    </>
  );
  return username ? (
    <a
      href={`https://t.me/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t('prfTelegramLabel')}
      data-contact="telegram"
      className={`flex items-center gap-1 min-w-0 hover:underline decoration-[#6fb3e0]/60 ${className}`}
    >
      {inner}
    </a>
  ) : (
    <span title={t('prfTelegramLabel')} data-contact="telegram" className={`flex items-center gap-1 min-w-0 ${className}`}>
      {inner}
    </span>
  );
};

/**
 * Level progress: current tier, XP, a bar to the next tier and how much XP is left.
 * Coins are shown only when `showCoins` (own profile) — other members never see someone's balance here.
 */
export const TierProgressPanel: React.FC<{ user: UserProfile; showCoins?: boolean; idPrefix: string }> = ({ user, showCoins, idPrefix }) => {
  const { t, ln } = useApp();
  const p = tierProgress(user.xp, user.tier);
  const titleId = `${idPrefix}-progress-title`;
  return (
    <div role="group" aria-labelledby={titleId} data-tier-progress className="rounded-xl bg-[#191615] border border-[#38312d] p-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('prfLevelProgress')}</p>
        {showCoins && (
          <span className="inline-flex items-center gap-1 text-xs font-mono-numbers font-bold text-amber-400" data-own-coins title={t('prfCoins')}>
            <Coins className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="sr-only">{t('prfCoins')}: </span>
            {user.coins}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
        <span className={`text-sm font-semibold ${p.current.textColor}`} data-tier-name>{ln(p.current)}</span>
        <span className="font-mono-numbers text-xs text-[#dfcfb3]" data-tier-xp>
          {user.xp}
          {p.next ? ` / ${p.next.minXp}` : ''} XP
        </span>
      </div>
      <div
        className="mt-2 w-full h-2 rounded-full bg-[#141211] border border-[#3b3430] overflow-hidden"
        role="progressbar"
        aria-label={t('prfProgressAria')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.percent}
        aria-valuetext={`${p.percent}%`}
        data-tier-bar={p.percent}
      >
        <div className="h-full rounded-full bg-[#dfcfb3] transition-[width] duration-500" style={{ width: `${p.percent}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-[#a39b94]" data-tier-next>
        {p.next
          ? t('homeXpToNext').replace('{n}', String(p.toNext)).replace('{tier}', ln(p.next))
          : t(showCoins ? 'dashMaxTier' : 'prfMaxTierMember')}
      </p>
    </div>
  );
};

/**
 * Up to 3 latest earned achievements (newest first; revoked ones never shown), with icon, title and date.
 * `action` is the existing way to see all of them (a link to the Achievements screen, or "show all" in the member window).
 */
export const RecentAchievements: React.FC<{
  user: UserProfile;
  isOwn: boolean;
  idPrefix: string;
  action?: React.ReactNode;
}> = ({ user, isOwn, idPrefix, action }) => {
  const { t, lf } = useApp();
  const recent = recentAchievements(user, 3);
  const titleId = `${idPrefix}-recent-title`;
  return (
    <div role="group" aria-labelledby={titleId} data-recent-achievements className="rounded-xl bg-[#191615] border border-[#38312d] p-4 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <p id={titleId} className="text-[11px] font-semibold uppercase tracking-wide text-[#9e948c]">{t('prfRecentAchievements')}</p>
        {action}
      </div>
      {recent.length === 0 ? (
        <p className="mt-2 text-[12px] text-[#9e948c]" data-recent-empty>
          {t(isOwn ? 'achEmptyEarned' : 'prfNoAchievementsMember')}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {recent.map(ach => (
            <li key={ach.id} className="flex items-center gap-2.5 min-w-0" data-recent-item={ach.id}>
              <span className="w-8 h-8 shrink-0 rounded-lg bg-[#dfcfb3]/15 border border-[#dfcfb3]/60 text-[#ecd9bf] flex items-center justify-center" aria-hidden="true">
                {React.createElement(ACHIEVEMENT_ICONS[ach.icon] || Award, { className: 'w-4 h-4' })}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#f5f2eb] leading-snug break-words">{lf(ach, 'title')}</span>
                {ach.unlockedAt && (
                  <span className="block text-[11px] text-[#c8b393]">{t('achEarnedOn').replace('{date}', formatClubDate(ach.unlockedAt, t))}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
