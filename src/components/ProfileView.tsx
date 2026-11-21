import { genreLabel } from '../data/bookGenres';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TIERS, SHOP_ITEMS } from '../data/gamification';
import { COMMUNITY_DIRECTIONS, activeDirections } from '../data/directions';
import {
  User,
  Edit3,
  BookOpen,
  Calendar,
  Award,
  Star,
  Coins,
  Sparkles,
  MapPin,
  Send,
  CheckCircle,
  MessageSquare,
  X,
} from 'lucide-react';
import { DirectionId } from '../types';
import { isDemoData } from '../config/runtime';
import { MembershipApplications } from './MembershipApplications';

export const ProfileView: React.FC = () => {
  const { currentUser, updateProfile, uploadAvatar, setActiveTab, language, t, ln, lf } = useApp();
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<'books' | 'events' | 'achievements' | 'reviews'>('books');
  const [showEditModal, setShowEditModal] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState(currentUser.name);
  const [editBio, setEditBio] = useState(currentUser.bio);
  const [editCity, setEditCity] = useState(currentUser.city);
  const [editTelegram, setEditTelegram] = useState(currentUser.telegram || '');
  const [editPhone, setEditPhone] = useState(currentUser.phone || '');
  // Live: directions with a pending application count as chosen (unselecting withdraws/leaves).
  const [editDirections, setEditDirections] = useState<DirectionId[]>([
    ...currentUser.directions,
    ...(currentUser.pendingDirections ?? []),
  ]);

  const userTier = TIERS[currentUser.tier];
  const equippedFrame = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedFrame);
  const equippedSkin = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedAvatarSkin);
  const equippedArtifact = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedArtifact);
  const equippedAura = SHOP_ITEMS.find(i => i.id === currentUser.inventory.equippedAura);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name: editName.trim(),
      bio: editBio.trim(),
      city: editCity.trim(),
      telegram: editTelegram.trim(),
      phone: editPhone.trim(),
      directions: editDirections,
    });
    setShowEditModal(false);
  };

  const toggleDirection = (dirId: DirectionId) => {
    if (editDirections.includes(dirId)) {
      setEditDirections(editDirections.filter(d => d !== dirId));
    } else {
      setEditDirections([...editDirections, dirId]);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Live: a direction lead who is not staff decides on applications here */}
      <MembershipApplications />
      {/* Profile Overview Card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-[#27211e] via-[#211e1c] to-[#191615] border border-[#3f3834] p-6 lg:p-8 shadow-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            {/* Avatar with equipped cosmetics */}
            <div className="relative">
              {equippedAura && (
                <div className={`absolute inset-0 rounded-full blur-xl pointer-events-none ${equippedAura.id === 'item-aura-tengri-glow' ? 'bg-amber-400/40' : 'bg-sky-400/30'}`} />
              )}
              <div
                className={`relative w-24 h-24 rounded-full overflow-hidden p-1 ${
                  equippedFrame?.borderStyle || 'ring-4 ring-[#dfcfb3]/50'
                }`}
              >
                <img
                  src={equippedSkin?.previewUrl || currentUser.avatar}
                  alt={currentUser.name}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>

              {equippedArtifact && (
                <div className="absolute -bottom-2 -right-1 px-2 py-0.5 rounded-full bg-[#1e1b1a] border border-[#dfcfb3] text-[9px] font-bold text-[#f5d77f] shadow">
                  {equippedArtifact.badgeTitle}
                </div>
              )}
            </div>

            {/* Info Block */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
                  {currentUser.name}
                </h1>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#1c1918] border border-[#3b3430] ${userTier.textColor}`}>
                  {ln(userTier)}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded uppercase bg-[#2e2825] text-[#b0a79d] font-mono">
                  {currentUser.role}
                </span>
              </div>

              <p className="text-xs text-[#a39b94] max-w-xl leading-relaxed">
                {currentUser.bio}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-[#8c8279] pt-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#dfcfb3]" />
                  {currentUser.city}
                </span>
                <span>·</span>
                <span className="font-mono text-[#dfcfb3]">{currentUser.handle}</span>
                {currentUser.telegram && (
                  <>
                    <span>·</span>
                    <span className="text-[#a39b94] font-mono">{currentUser.telegram}</span>
                  </>
                )}
                <span>·</span>
                <span>{t('joinedSince')} {currentUser.joinedDate}</span>
              </div>

              {/* Directions tags */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-2">
                {currentUser.directions.map(dirId => {
                  const dir = COMMUNITY_DIRECTIONS.find(d => d.id === dirId);
                  return (
                    <span
                      key={dirId}
                      className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#2a2422] text-[#d6cebf] border border-[#38312d]"
                    >
                      {lf(dir, 'shortName') || dirId}
                    </span>
                  );
                })}
                {(currentUser.pendingDirections ?? []).map(dirId => (
                  <span
                    key={`pending-${dirId}`}
                    className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#1a1716] text-[#8c8279] border border-dashed border-[#4a413b]"
                  >
                    {lf(COMMUNITY_DIRECTIONS.find(d => d.id === dirId), 'shortName') || dirId} · {t('liveMembershipPending')}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Stats & Edit Button */}
          <div className="flex flex-col items-center sm:items-end gap-3 shrink-0">
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 rounded-lg bg-[#2c2624] hover:bg-[#38302d] border border-[#443c37] text-xs font-semibold text-[#f5f2eb] flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#dfcfb3]" />
              <span>{t('editProfile')}</span>
            </button>

            <div className="flex items-center gap-2 bg-[#191615] px-4 py-2.5 rounded-xl border border-[#38312d]">
              <div className="text-right">
                <span className="text-[10px] text-[#8c8279] block">{t('prfCoins')}</span>
                <span className="font-mono-numbers font-bold text-amber-400 text-sm">
                  {currentUser.coins} 🪙
                </span>
              </div>
              <div className="w-px h-6 bg-[#302a28]" />
              <div className="text-right">
                <span className="text-[10px] text-[#8c8279] block">{t('prfXp')}</span>
                <span className="font-mono-numbers font-bold text-[#dfcfb3] text-sm">
                  {currentUser.xp} XP
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#302a28] pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubTab('books')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeSubTab === 'books'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{t('myReadBooks')} ({currentUser.readBooks.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('events')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeSubTab === 'events'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>{t('myEventsHistory')} ({currentUser.attendedEvents.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('achievements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeSubTab === 'achievements'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>{t('myAchievements')} ({currentUser.achievements.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reviews')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
            activeSubTab === 'reviews'
              ? 'bg-[#dfcfb3] text-[#1e1b1a]'
              : 'text-[#9e948c] hover:text-[#f5f2eb]'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          <span>{t('prfReviewsAboutMe')} ({currentUser.peerReviews.length})</span>
        </button>
      </div>

      {/* SUB-TAB 1: READ BOOKS */}
      {activeSubTab === 'books' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#f5f2eb]">
              {t('prfBooksList')}
            </h3>
            <button
              onClick={() => setActiveTab('library')}
              className="text-xs text-[#dfcfb3] hover:underline"
            >
              + {t('prfAddBook')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentUser.readBooks.map(book => (
              <div
                key={book.id}
                className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] space-y-2 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-[#f5f2eb]">{book.title}</h4>
                    <span className="text-[11px] text-[#8c8279]">{book.author}</span>
                  </div>
                  <span className="text-amber-400 font-bold">{book.userRating}★</span>
                </div>
                {book.review && (
                  <p className="text-[11px] text-[#a39b94] italic leading-relaxed pt-1">
                    «{book.review}»
                  </p>
                )}
                <div className="pt-2 border-t border-[#302a28] flex items-center justify-between text-[10px] text-[#736a62]">
                  <span>{genreLabel(book.genre, t)}</span>
                  <span>{book.dateFinished}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ATTENDED EVENTS */}
      {activeSubTab === 'events' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#f5f2eb]">
            {t('prfActivityHistory')}
          </h3>

          <div className="divide-y divide-[#2d2725] rounded-xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
            {currentUser.attendedEvents.map((rec, i) => (
              <div key={i} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[#f5f2eb] block">{rec.title}</span>
                  <span className="text-[11px] text-[#8c8279] font-mono">{rec.date} · {rec.direction}</span>
                </div>
                <div>
                  {rec.status === 'attended' ? (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                      {t('prfAttended')}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#2a2422] text-[#dfcfb3] border border-[#443b36]">
                      {t('prfSignedUp')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ACHIEVEMENTS */}
      {activeSubTab === 'achievements' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentUser.achievements.map(ach => (
            <div
              key={ach.id}
              className="p-4 rounded-xl bg-[#23201e] border border-[#dfcfb3]/40 space-y-2 text-xs"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#dfcfb3]/20 border border-[#dfcfb3] text-[#dfcfb3] flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="font-bold text-[#f5f2eb]">{lf(ach, 'title')}</h4>
                  <span className="text-[10px] text-[#dfcfb3]">{t('prfRewardReceived')}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#a39b94]">{lf(ach, 'description')}</p>
            </div>
          ))}
        </div>
      )}

      {/* SUB-TAB 4: PEER REVIEWS */}
      {activeSubTab === 'reviews' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#f5f2eb]">
            {t('prfReviewsFromCommunity')}
          </h3>

          <div className="space-y-3">
            {currentUser.peerReviews.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8c8279] rounded-xl bg-[#23201e]">
                {t('prfNoReviews')}
              </div>
            ) : (
              currentUser.peerReviews.map(rev => (
                <div
                  key={rev.id}
                  className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={rev.authorAvatar}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <span className="font-bold text-[#f5f2eb]">{rev.authorName}</span>
                      <span className="text-[10px] text-[#dfcfb3]">
                        {rev.authorRole.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400 font-mono">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{rev.rating}/5</span>
                    </div>
                  </div>
                  <p className="text-xs text-[#d6cebf] leading-relaxed">
                    «{rev.comment}»
                  </p>
                  <span className="text-[10px] text-[#736a62] font-mono block">
                    {rev.createdAt} · {t('prfAspect')}: {t(`aspect_${rev.aspect}`)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-6 space-y-4">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-display text-lg font-bold text-[#f5f2eb]">
              {t('editProfile')}
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">{t('prfFormName')}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">{t('prfFormBio')}</label>
                <textarea
                  rows={3}
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('prfFormCity')}</label>
                  <input
                    type="text"
                    value={editCity}
                    onChange={e => setEditCity(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Telegram (@username)</label>
                  <input
                    type="text"
                    value={editTelegram}
                    onChange={e => setEditTelegram(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
              </div>

              {uploadAvatar && (
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1.5">{t('liveAvatarLabel')}</label>
                  <div className="flex items-center gap-3">
                    <img src={currentUser.avatar} alt="" className="w-12 h-12 rounded-full object-cover ring-1 ring-[#dfcfb3]/40" />
                    <label className="px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] border border-[#483f3a] text-xs text-[#dfcfb3] cursor-pointer">
                      {avatarBusy ? t('liveAvatarUploading') : t('liveAvatarUpload')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={avatarBusy}
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setAvatarBusy(true);
                          await uploadAvatar(file);
                          setAvatarBusy(false);
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1.5">
                  {t('prfFormDirections')}:
                </label>
                {!isDemoData && <p className="text-[11px] text-[#8c8279] mb-2">{t('liveMembershipHint')}</p>}
                <div className="flex flex-wrap gap-2">
                  {activeDirections().map(dir => (
                    <button
                      key={dir.id}
                      type="button"
                      onClick={() => toggleDirection(dir.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        editDirections.includes(dir.id)
                          ? 'bg-[#dfcfb3] text-[#1e1b1a] border-[#dfcfb3]'
                          : 'bg-[#1a1716] text-[#8c8279] border-[#3b3430]'
                      }`}
                    >
                      {ln(dir)}
                      {currentUser.pendingDirections?.includes(dir.id) && ` · ${t('liveMembershipPending')}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#302a28]">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 text-[#8c8279] hover:text-[#f5f2eb]"
                >
                  {t('actionClose')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                >
                  {t('actionSave')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
