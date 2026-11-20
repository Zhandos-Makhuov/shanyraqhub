import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SHOP_ITEMS, TIERS } from '../data/gamification';
import { ItemCategory, TierLevel } from '../types';
import {
  Sparkles,
  Coins,
  Crown,
  Shield,
  Zap,
  Gem,
  Award,
  Check,
  ShoppingBag,
  History,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';

export const AvatarShopView: React.FC = () => {
  const {
    currentUser,
    buyShopItem,
    equipShopItem,
    unequipShopItem,
    coinTransactions,
    language,
    t,
  } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'shop' | 'tiers' | 'history'>('shop');

  const userTier = TIERS[currentUser.tier];
  const itemName = (i: { nameRu: string; nameKz: string; nameEn: string }) => (language === 'kz' ? i.nameKz : language === 'en' ? i.nameEn : i.nameRu);
  const myTransactions = coinTransactions.filter(tx => tx.userId === currentUser.id);

  // Equipped item lookups
  const equippedSkin = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedAvatarSkin);
  const equippedFrame = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedFrame);
  const equippedAura = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedAura);
  const equippedArtifact = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedArtifact);

  const filteredItems = SHOP_ITEMS.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    return true;
  });

  const getRarityBadge = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return 'bg-amber-950/80 text-amber-300 border-amber-600/60 font-bold';
      case 'epic':
        return 'bg-purple-950/80 text-purple-300 border-purple-600/60';
      case 'rare':
        return 'bg-sky-950/80 text-sky-300 border-sky-600/60';
      default:
        return 'bg-stone-800 text-stone-300 border-stone-600';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Balance */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#29221e] via-[#221e1c] to-[#1a1716] border border-[#dfcfb3]/30 shadow-xl">
        <div className="space-y-1">
          <span className="text-xs uppercase tracking-widest text-[#dfcfb3] font-semibold">
            {t('avatarStudio')} & {t('virtualShop')}
          </span>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
            {t('shopHeaderKicker')}
          </h1>
          <p className="text-xs text-[#a39b94]">
            {t('shopHeaderText')}
          </p>
        </div>

        {/* Balance Card */}
        <div className="flex items-center gap-4 bg-[#191615] px-5 py-3 rounded-xl border border-[#3b3430] shrink-0">
          <div className="w-12 h-12 rounded-xl bg-amber-950/50 border border-amber-600/50 flex items-center justify-center text-amber-400">
            <Coins className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[11px] text-[#8c8279] block">{t('shopBalance')}</span>
            <span className="text-2xl font-bold font-mono-numbers text-amber-400">
              {currentUser.coins} 🪙
            </span>
          </div>
        </div>
      </div>

      {/* Avatar Live Preview Showcase */}
      <div className="p-6 rounded-2xl bg-[#23201e] border border-[#352f2c] flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {/* Character Frame with Aura */}
          <div className="relative">
            {equippedAura && (
              <div
                className={`absolute inset-0 rounded-full blur-xl pointer-events-none ${
                  equippedAura.id === 'item-aura-tengri-glow'
                    ? 'bg-amber-400/40'
                    : 'bg-sky-400/30'
                }`}
              />
            )}
            <div
              className={`relative w-24 h-24 rounded-full overflow-hidden p-1 transition-all ${
                equippedFrame?.borderStyle || 'ring-2 ring-[#dfcfb3]/40'
              }`}
            >
              <img
                src={equippedSkin?.previewUrl || currentUser.avatar}
                alt=""
                className="w-full h-full object-cover rounded-full"
              />
            </div>

            {equippedArtifact && (
              <div
                className="absolute -bottom-2 -right-1 px-2 py-0.5 rounded-full bg-[#1e1b1a] border border-[#dfcfb3] text-[9px] font-bold text-[#f5d77f] shadow"
                title={itemName(equippedArtifact)}
              >
                {equippedArtifact.badgeTitle || t('shopArtifact')}
              </div>
            )}
          </div>

          {/* User equipped details */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold text-[#f5f2eb]">
                {currentUser.name}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded bg-[#1c1918] ${userTier.textColor}`}>
                {language === 'kz' ? userTier.nameKz : language === 'en' ? userTier.nameEn : userTier.nameRu}
              </span>
            </div>
            <p className="text-xs text-[#a39b94]">
              {equippedSkin ? itemName(equippedSkin) : t('shopDefaultSkin')} · {equippedFrame ? itemName(equippedFrame) : t('shopDefaultFrame')}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentUser.inventory.equippedAvatarSkin && (
                <button
                  onClick={() => unequipShopItem('avatar')}
                  className="px-2 py-0.5 rounded text-[10px] bg-[#2d2825] hover:bg-[#38312d] text-[#b0a79d]"
                >
                  {t('shopUnequipSkin')}
                </button>
              )}
              {currentUser.inventory.equippedFrame && (
                <button
                  onClick={() => unequipShopItem('frame')}
                  className="px-2 py-0.5 rounded text-[10px] bg-[#2d2825] hover:bg-[#38312d] text-[#b0a79d]"
                >
                  {t('shopUnequipFrame')}
                </button>
              )}
              {currentUser.inventory.equippedAura && (
                <button
                  onClick={() => unequipShopItem('aura')}
                  className="px-2 py-0.5 rounded text-[10px] bg-[#2d2825] hover:bg-[#38312d] text-[#b0a79d]"
                >
                  {t('shopUnequipAura')}
                </button>
              )}
              {currentUser.inventory.equippedArtifact && (
                <button
                  onClick={() => unequipShopItem('artifact')}
                  className="px-2 py-0.5 rounded text-[10px] bg-[#2d2825] hover:bg-[#38312d] text-[#b0a79d]"
                >
                  {t('shopUnequipArtifact')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* How to earn coins brief */}
        <div className="text-xs text-[#9e948c] space-y-1 bg-[#1a1716] p-3 rounded-xl border border-[#302a28] max-w-sm">
          <span className="font-semibold text-[#dfcfb3] block">{t('shopHowToEarn')}:</span>
          <div>• {t('shopEarnEvent')}: <strong className="text-amber-400 font-mono">+40-60 🪙</strong></div>
          <div>• {t('shopEarnBook')}: <strong className="text-amber-400 font-mono">+30 🪙</strong></div>
          <div>• {t('shopEarnForum')}: <strong className="text-amber-400 font-mono">+15 🪙</strong></div>
        </div>
      </div>

      {/* Tabs Switcher: Shop vs Tiers vs History */}
      <div className="flex items-center gap-2 border-b border-[#302a28] pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('shop')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'shop'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb] hover:bg-[#23201e]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>{t('shopTabCatalog')}</span>
        </button>

        <button
          onClick={() => setActiveTab('tiers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'tiers'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb] hover:bg-[#23201e]'
          }`}
        >
          <Crown className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('shopTabTiers')}</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'history'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb] hover:bg-[#23201e]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>{t('shopTabHistory')}</span>
        </button>
      </div>

      {/* TAB 1: SHOP ITEMS */}
      {activeTab === 'shop' && (
        <div className="space-y-4">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
            {[
              { id: 'all', label: t('shopCatAll') },
              { id: 'avatar', label: t('shopCatAvatar') },
              { id: 'frame', label: t('shopCatFrame') },
              { id: 'artifact', label: t('shopCatArtifact') },
              { id: 'aura', label: t('shopCatAura') },
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                    : 'bg-[#23201e] text-[#9e948c] hover:text-[#f5f2eb] border border-[#352f2c]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Items Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map(item => {
              const isOwned = currentUser.inventory.ownedItemIds.includes(item.id);
              const isEquipped =
                currentUser.inventory.equippedAvatarSkin === item.id ||
                currentUser.inventory.equippedFrame === item.id ||
                currentUser.inventory.equippedAura === item.id ||
                currentUser.inventory.equippedArtifact === item.id;

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl bg-[#23201e] border p-4 flex flex-col justify-between transition-all ${
                    isEquipped
                      ? 'border-[#dfcfb3] shadow-[0_0_20px_rgba(223,207,179,0.2)]'
                      : 'border-[#352f2c] hover:border-[#4d443f]'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Item Top: Rarity badge & category */}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`px-2 py-0.5 rounded-full border uppercase ${getRarityBadge(item.rarity)}`}>
                        {t(`shopRarity_${item.rarity}`)}
                      </span>
                      <span className="text-[#8c8279] uppercase">
                        {t(`shopCategory_${item.category}`)}
                      </span>
                    </div>

                    {/* Preview Art */}
                    <div className="h-28 rounded-xl bg-[#191615] border border-[#302a28] flex items-center justify-center p-3 relative overflow-hidden">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={itemName(item)}
                          className="w-16 h-16 rounded-full object-cover ring-2 ring-[#dfcfb3]/40"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-[#272321] border border-[#dfcfb3]/40 flex items-center justify-center text-[#dfcfb3]">
                          <Sparkles className="w-6 h-6" />
                        </div>
                      )}
                    </div>

                    {/* Titles */}
                    <div>
                      <h4 className="font-display text-sm font-bold text-[#f5f2eb]">
                        {itemName(item)}
                      </h4>
                      <p className="text-xs text-[#a39b94] mt-1 leading-relaxed line-clamp-2">
                        {language === 'kz' ? item.descriptionKz : language === 'en' ? item.descriptionEn : item.descriptionRu}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Price */}
                  <div className="mt-4 pt-3 border-t border-[#302a28] flex items-center justify-between">
                    <div className="flex items-center gap-1 font-mono-numbers font-bold text-amber-400 text-xs">
                      <Coins className="w-3.5 h-3.5" />
                      <span>{item.priceCoins} 🪙</span>
                    </div>

                    {isOwned ? (
                      isEquipped ? (
                        <button
                          onClick={() => unequipShopItem(item.category)}
                          className="px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] text-xs font-semibold text-[#dfcfb3] border border-[#483f3a]"
                        >
                          {t('actionUnequip')}
                        </button>
                      ) : (
                        <button
                          onClick={() => equipShopItem(item.id, item.category)}
                          className="px-3 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                        >
                          {t('actionEquip')}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => buyShopItem(item.id)}
                        disabled={currentUser.coins < item.priceCoins}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-xs font-bold text-[#1e1b1a] transition-all"
                      >
                        {t('actionBuy')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: TIERS HIERARCHY */}
      {activeTab === 'tiers' && (
        <div className="space-y-4">
          <p className="text-xs text-[#a39b94]">
            {t('shopTiersIntro')}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.keys(TIERS) as TierLevel[]).map(tierKey => {
              const tier = TIERS[tierKey];
              const isCurrent = currentUser.tier === tierKey;

              return (
                <div
                  key={tierKey}
                  className={`rounded-2xl p-5 border relative overflow-hidden flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-gradient-to-br from-[#2e2621] to-[#1c1918] border-[#dfcfb3] shadow-lg'
                      : 'bg-[#23201e] border-[#352f2c]'
                  }`}
                >
                  {isCurrent && (
                    <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded bg-[#dfcfb3] text-[#1e1b1a]">
                      {t('shopYourTier')}
                    </span>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                        style={{ backgroundColor: `${tier.color}25`, color: tier.color }}
                      >
                        {tierKey === 'tengri' ? '👑' : tierKey === 'titanium' ? '🛡️' : tierKey === 'platinum' ? '💍' : tierKey === 'gold' ? '🥇' : tierKey === 'silver' ? '🥈' : '🥉'}
                      </div>
                      <div>
                        <h4 className={`font-display text-sm font-bold ${tier.textColor}`}>
                          {language === 'kz' ? tier.nameKz : language === 'en' ? tier.nameEn : tier.nameRu}
                        </h4>
                        <span className="text-[11px] text-[#8c8279] font-mono">
                          {t('shopRequires')}: {tier.minXp}+ XP
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28] text-xs text-[#d6cebf] leading-relaxed">
                      <span className="text-[#8c8279] text-[10px] uppercase block mb-1 font-semibold">
                        {t('shopTierPerk')}:
                      </span>
                      {language === 'kz' ? tier.privilegeKz : language === 'en' ? tier.privilegeEn : tier.privilegeRu}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#302a28] flex items-center justify-between text-xs">
                    <span className="text-[#8c8279]">{t('shopMemberXp')}:</span>
                    <span className="font-mono-numbers font-bold text-[#f5f2eb]">
                      {tier.minXp} XP
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TRANSACTION HISTORY */}
      {activeTab === 'history' && (
        <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
          <div className="p-4 border-b border-[#302a28] flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
              {t('shopHistoryTitle')}
            </h3>
            <span className="text-xs text-amber-400 font-mono font-bold">
              {t('shopCurrentBalance')}: {currentUser.coins} 🪙
            </span>
          </div>

          <div className="divide-y divide-[#2d2725]">
            {myTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8c8279]">
                {t('shopHistoryEmpty')}
              </div>
            ) : (
              myTransactions.map(tx => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        tx.type === 'earn'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {tx.type === 'earn' ? (
                        <ArrowDownRight className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-[#f5f2eb] block">
                        {language === 'kz' ? tx.reasonKz : language === 'en' ? tx.reasonEn : tx.reasonRu}
                      </span>
                      <span className="text-[10px] text-[#8c8279] font-mono">
                        {tx.createdAt}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`font-mono font-bold text-sm ${
                      tx.type === 'earn' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {tx.type === 'earn' ? `+${tx.amount}` : `-${tx.amount}`} 🪙
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
