import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SHOP_ITEMS } from '../data/gamification';
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import { formatClubDate } from '../utils/eventTime';
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
      <span className="text-[11px] text-[#8c8279] block">
        {formatClubDate(review.createdAt, t)} · {t('prfAspect')}: {t(`aspect_${review.aspect}`)}
      </span>
    </div>
  );
};
