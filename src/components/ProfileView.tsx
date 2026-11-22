import { genreLabel } from '../data/bookGenres';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ACHIEVEMENT_ICONS } from './AchievementsView';
import { formatClubDate } from '../utils/eventTime';
import { TIERS } from '../data/gamification';
import { activeDirections } from '../data/directions';
import {
  Edit3,
  BookOpen,
  Calendar,
  Award,
  Star,
  MapPin,
  Send,
  UserRound,
  X,
} from 'lucide-react';
import { DirectionId } from '../types';
import { isDemoData } from '../config/runtime';
import { MembershipApplications } from './MembershipApplications';
import { AvatarWithFallback, EquippedAvatar, ProfileRoleBadge, ReviewCard, useDirectionName } from './ProfileParts';
import { useDialog } from '../hooks/useDialog';

type SubTab = 'books' | 'events' | 'achievements' | 'reviews';

/** "@name" for a Telegram username typed with or without the "@". */
const asTelegram = (v: string) => (v.startsWith('@') ? v : `@${v}`);

export const ProfileView: React.FC = () => {
  const { currentUser, updateProfile, uploadAvatar, setActiveTab, t, ln, lf } = useApp();
  const directionName = useDirectionName();
  const [avatarBusy, setAvatarBusy] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('books');
  const [showEditModal, setShowEditModal] = useState(false);

  // Edit form state — filled from the latest currentUser every time the form opens (openEdit).
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [editDirections, setEditDirections] = useState<DirectionId[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const openEdit = () => {
    setEditName(currentUser.name);
    setEditBio(currentUser.bio);
    setEditCity(currentUser.city);
    setEditTelegram(currentUser.telegram || '');
    // Live: directions with a pending application count as chosen (unselecting withdraws/leaves).
    setEditDirections([...currentUser.directions, ...(currentUser.pendingDirections ?? [])]);
    setSaveError('');
    setShowEditModal(true);
  };
  const closeEdit = () => {
    if (!saving) setShowEditModal(false);
  };
  const editRef = useDialog<HTMLDivElement>(showEditModal, closeEdit);

  const userTier = TIERS[currentUser.tier];

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    setSaveError('');
    // The phone is not part of this form (owner decision), so it is not sent and stays as it is.
    const r = await updateProfile({
      name: editName.trim(),
      bio: editBio.trim(),
      city: editCity.trim(),
      telegram: editTelegram.trim(),
      directions: editDirections,
    });
    setSaving(false);
    if (r.ok) setShowEditModal(false);
    else setSaveError(t(r.error || 'authErrorGeneric'));
  };

  const toggleDirection = (dirId: DirectionId) => {
    if (editDirections.includes(dirId)) {
      setEditDirections(editDirections.filter(d => d !== dirId));
    } else {
      setEditDirections([...editDirections, dirId]);
    }
  };

  // Sub-tabs scroll sideways on narrow screens: fades at the edges show there is more,
  // and the chosen tab is scrolled fully into view.
  const tabsRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  const updateFade = () => {
    const el = tabsRef.current;
    if (!el) return;
    setFade({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  };
  useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, []);
  const selectTab = (tab: SubTab, btn: HTMLButtonElement) => {
    setActiveSubTab(tab);
    const el = tabsRef.current;
    if (!el) return;
    const pad = 28;
    if (btn.offsetLeft - pad < el.scrollLeft) el.scrollTo({ left: Math.max(0, btn.offsetLeft - pad), behavior: 'smooth' });
    else if (btn.offsetLeft + btn.offsetWidth + pad > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: btn.offsetLeft + btn.offsetWidth + pad - el.clientWidth, behavior: 'smooth' });
  };
  const tabs: { id: SubTab; icon: React.ElementType; label: string; count: number }[] = [
    { id: 'books', icon: BookOpen, label: t('myReadBooks'), count: currentUser.readBooks.length },
    { id: 'events', icon: Calendar, label: t('myEventsHistory'), count: currentUser.attendedEvents.length },
    { id: 'achievements', icon: Award, label: t('myAchievements'), count: currentUser.achievements.length },
    { id: 'reviews', icon: Star, label: t('prfReviewsAboutMe'), count: currentUser.peerReviews.length },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Live: a direction lead who is not staff decides on applications here */}
      <MembershipApplications />
      {/* Profile Overview Card */}
      <div className="relative rounded-2xl bg-gradient-to-br from-[#27211e] via-[#211e1c] to-[#191615] border border-[#3f3834] p-6 lg:p-8 shadow-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left min-w-0">
            {/* Avatar with equipped cosmetics */}
            <EquippedAvatar user={currentUser} size="lg" />

            {/* Info Block */}
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h1 className="font-display text-2xl font-bold text-[#f5f2eb] break-words [overflow-wrap:anywhere] min-w-0">
                  {currentUser.name}
                </h1>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#1c1918] border border-[#3b3430] ${userTier.textColor}`}>
                  {ln(userTier)}
                </span>
                <ProfileRoleBadge role={currentUser.role} />
              </div>

              <p className="text-xs text-[#a39b94] max-w-xl leading-relaxed break-words">
                {currentUser.bio}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1.5 text-xs text-[#8c8279] pt-1">
                {currentUser.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#dfcfb3]" aria-hidden="true" />
                    {currentUser.city}
                  </span>
                )}
                <span className="flex items-center gap-1 min-w-0" title={t('prfHandleLabel')} data-contact="handle">
                  <UserRound className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('prfHandleLabel')}: </span>
                  <span className="font-mono text-[#dfcfb3] break-all">{currentUser.handle}</span>
                </span>
                {currentUser.telegram && (
                  <span className="flex items-center gap-1 min-w-0" title={t('prfTelegramLabel')} data-contact="telegram">
                    <Send className="w-3.5 h-3.5 text-[#6fb3e0] shrink-0" aria-hidden="true" />
                    <span className="sr-only">{t('prfTelegramLabel')}: </span>
                    <span className="font-mono text-[#a7c9e0] break-all">{asTelegram(currentUser.telegram)}</span>
                  </span>
                )}
                <span>{t('joinedSince')} {formatClubDate(currentUser.joinedDate, t)}</span>
              </div>

              {/* Directions tags */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 pt-2">
                {currentUser.directions.map(dirId => (
                  <span
                    key={dirId}
                    className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#2a2422] text-[#d6cebf] border border-[#38312d]"
                  >
                    {directionName(dirId)}
                  </span>
                ))}
                {(currentUser.pendingDirections ?? []).map(dirId => (
                  <span
                    key={`pending-${dirId}`}
                    className="text-[11px] px-2.5 py-0.5 rounded-md bg-[#1a1716] text-[#8c8279] border border-dashed border-[#4a413b]"
                  >
                    {directionName(dirId)} · {t('liveMembershipPending')}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Stats & Edit Button */}
          <div className="flex flex-col items-center sm:items-end gap-3 shrink-0">
            <button
              onClick={openEdit}
              className="px-4 py-2 min-h-10 rounded-lg bg-[#2c2624] hover:bg-[#38302d] border border-[#443c37] text-xs font-semibold text-[#f5f2eb] flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#dfcfb3]" aria-hidden="true" />
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

      {/* Sub-Navigation Tabs: sideways scroll on phones, with edge fades */}
      <div className="relative border-b border-[#302a28]">
        <div
          ref={tabsRef}
          onScroll={updateFade}
          role="tablist"
          aria-label={t('prfTabsLabel')}
          data-profile-tabs
          className="relative flex items-center gap-2 pb-2 overflow-x-auto scrollbar-none"
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeSubTab === tab.id}
              onClick={e => selectTab(tab.id, e.currentTarget)}
              className={`flex items-center gap-2 px-4 py-2 min-h-10 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                activeSubTab === tab.id
                  ? 'bg-[#dfcfb3] text-[#1e1b1a]'
                  : 'text-[#9e948c] hover:text-[#f5f2eb]'
              }`}
            >
              {React.createElement(tab.icon, { className: 'w-3.5 h-3.5', 'aria-hidden': true })}
              <span>{tab.label} ({tab.count})</span>
            </button>
          ))}
        </div>
        {fade.left && (
          <div aria-hidden="true" data-tabs-fade="left" className="pointer-events-none absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-[#191615] to-transparent" />
        )}
        {fade.right && (
          <div aria-hidden="true" data-tabs-fade="right" className="pointer-events-none absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-[#191615] via-[#191615]/80 to-transparent" />
        )}
      </div>

      {/* SUB-TAB 1: READ BOOKS */}
      {activeSubTab === 'books' && (
        <div className="space-y-4" role="tabpanel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#f5f2eb]">
              {t('prfBooksList')}
            </h3>
            <button
              onClick={() => setActiveTab('library')}
              className="text-xs text-[#dfcfb3] hover:underline min-h-9 shrink-0"
            >
              + {t('prfAddBook')}
            </button>
          </div>

          {currentUser.readBooks.length === 0 ? (
            <p className="p-6 text-center rounded-xl bg-[#23201e] border border-[#352f2c] text-[13px] text-[#9e948c]">{t('prfNoBooks')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentUser.readBooks.map(book => {
                const completed = book.status === 'completed';
                return (
                  <div
                    key={book.id}
                    data-profile-book={book.status}
                    className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c] space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#f5f2eb] break-words">{book.title}</h4>
                        <span className="text-[11px] text-[#8c8279] break-words">{book.author}</span>
                      </div>
                      {completed && book.userRating > 0 ? (
                        <span className="text-amber-400 font-bold shrink-0" data-book-rating>{book.userRating}★</span>
                      ) : !completed ? (
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2a2422] text-[#dfcfb3] border border-[#443b36]">
                          {t('libMarkReading')}
                        </span>
                      ) : null}
                    </div>
                    {book.review && (
                      <p className="text-[11px] text-[#a39b94] italic leading-relaxed pt-1 break-words">
                        «{book.review}»
                      </p>
                    )}
                    <div className="pt-2 border-t border-[#302a28] flex items-center justify-between gap-2 text-[11px] text-[#8c8279]">
                      <span>{genreLabel(book.genre, t)}</span>
                      {completed && book.dateFinished && <span>{formatClubDate(book.dateFinished, t)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: ATTENDED EVENTS */}
      {activeSubTab === 'events' && (
        <div className="space-y-4" role="tabpanel">
          <h3 className="text-sm font-bold text-[#f5f2eb]">
            {t('prfActivityHistory')}
          </h3>

          {currentUser.attendedEvents.length === 0 ? (
            <p className="p-6 text-center rounded-xl bg-[#23201e] border border-[#352f2c] text-[13px] text-[#9e948c]">{t('prfNoEvents')}</p>
          ) : (
            <div className="divide-y divide-[#2d2725] rounded-xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
              {currentUser.attendedEvents.map((rec, i) => (
                <div key={`${rec.eventId}-${i}`} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <span className="font-bold text-[#f5f2eb] block break-words">{rec.title}</span>
                    <span className="text-[11px] text-[#8c8279]" data-event-meta>
                      {formatClubDate(rec.date, t)} · {directionName(rec.direction)}
                    </span>
                  </div>
                  <div className="shrink-0">
                    {rec.status === 'attended' ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                        {t('prfAttended')}
                      </span>
                    ) : rec.status === 'cancelled' ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#1c1918] text-[#8c8279] border border-[#38312d]">
                        {t('attCancelled')}
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
          )}
        </div>
      )}

      {/* SUB-TAB 3: ACHIEVEMENTS */}
      {activeSubTab === 'achievements' && (
        <div className="space-y-3" role="tabpanel">
          {currentUser.achievements.length === 0 ? (
            <p className="p-6 text-center rounded-xl bg-[#23201e] border border-[#352f2c] text-[13px] text-[#9e948c]">{t('achEmptyEarned')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {currentUser.achievements.map(ach => (
                <div key={ach.id} className="flex items-start gap-3 p-4 rounded-xl bg-[#23201e] border border-[#dfcfb3]/35">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-[#dfcfb3]/15 border border-[#dfcfb3]/80 text-[#ecd9bf] flex items-center justify-center">
                    {React.createElement(ACHIEVEMENT_ICONS[ach.icon] || Award, { className: 'w-5 h-5' })}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#f5f2eb] leading-snug">{lf(ach, 'title')}</h4>
                    <p className="mt-0.5 text-[12px] text-[#a39b94] line-clamp-2">{lf(ach, 'description')}</p>
                    <span className="mt-1 block text-[11px] text-[#c8b393]">
                      {ach.unlockedAt ? t('achEarnedOn').replace('{date}', formatClubDate(ach.unlockedAt, t)) : t('prfRewardReceived')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setActiveTab('achievements')} className="inline-flex items-center gap-1 min-h-9 text-[13px] font-medium text-[#dfcfb3] hover:text-[#ecd9bf]">
            {t('achOpenAll')} →
          </button>
        </div>
      )}

      {/* SUB-TAB 4: PEER REVIEWS */}
      {activeSubTab === 'reviews' && (
        <div className="space-y-4" role="tabpanel">
          <h3 className="text-sm font-bold text-[#f5f2eb]">
            {t('prfReviewsFromCommunity')}
          </h3>

          <div className="space-y-3">
            {currentUser.peerReviews.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#8c8279] rounded-xl bg-[#23201e]">
                {t('prfNoReviews')}
              </div>
            ) : (
              currentUser.peerReviews.map(rev => <ReviewCard key={rev.id} review={rev} />)
            )}
          </div>
        </div>
      )}

      {/* Edit Profile Modal: title and buttons stay in place, the fields scroll between them */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            ref={editRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-edit-title"
            tabIndex={-1}
            className="relative w-full max-w-lg max-h-[90dvh] flex flex-col bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-[#302a28]">
              <h3 id="profile-edit-title" className="font-display text-lg font-bold text-[#f5f2eb]">
                {t('editProfile')}
              </h3>
              <button
                type="button"
                onClick={closeEdit}
                aria-label={t('prfCloseEdit')}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-3 text-xs">
                <div>
                  <label htmlFor="prf-name" className="font-medium text-[#d6cebf] block mb-1">{t('prfFormName')}</label>
                  <input
                    id="prf-name"
                    type="text"
                    required
                    maxLength={80}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                  />
                </div>

                <div>
                  <label htmlFor="prf-bio" className="font-medium text-[#d6cebf] block mb-1">{t('prfFormBio')}</label>
                  <textarea
                    id="prf-bio"
                    rows={3}
                    maxLength={1000}
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="prf-city" className="font-medium text-[#d6cebf] block mb-1">{t('prfFormCity')}</label>
                    <input
                      id="prf-city"
                      type="text"
                      maxLength={80}
                      value={editCity}
                      onChange={e => setEditCity(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                    />
                  </div>
                  <div>
                    <label htmlFor="prf-telegram" className="font-medium text-[#d6cebf] block mb-1">{t('prfFormTelegram')}</label>
                    <input
                      id="prf-telegram"
                      type="text"
                      maxLength={64}
                      autoCapitalize="none"
                      autoCorrect="off"
                      aria-describedby="prf-telegram-hint"
                      value={editTelegram}
                      onChange={e => setEditTelegram(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                    />
                    <p id="prf-telegram-hint" className="mt-1 text-[11px] text-[#8c8279]">{t('prfTelegramPublicHint')}</p>
                  </div>
                </div>

                {uploadAvatar && (
                  <div>
                    <span className="font-medium text-[#d6cebf] block mb-1.5">{t('liveAvatarLabel')}</span>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full ring-1 ring-[#dfcfb3]/40">
                        <AvatarWithFallback src={currentUser.avatar} name={currentUser.name} className="w-12 h-12" />
                      </span>
                      <label className="px-3 py-2 min-h-10 inline-flex items-center rounded-lg bg-[#2e2927] hover:bg-[#3d3633] border border-[#483f3a] text-xs text-[#dfcfb3] cursor-pointer">
                        {avatarBusy ? t('liveAvatarUploading') : t('liveAvatarUpload')}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
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
                  <span className="font-medium text-[#d6cebf] block mb-1.5">
                    {t('prfFormDirections')}:
                  </span>
                  {!isDemoData && <p className="text-[11px] text-[#8c8279] mb-2">{t('liveMembershipHint')}</p>}
                  <div className="flex flex-wrap gap-2">
                    {activeDirections().map(dir => (
                      <button
                        key={dir.id}
                        type="button"
                        aria-pressed={editDirections.includes(dir.id)}
                        onClick={() => toggleDirection(dir.id)}
                        className={`px-3 py-1.5 min-h-9 rounded-lg text-xs font-medium border transition-colors text-left ${
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
              </div>

              <div className="px-5 sm:px-6 py-3 border-t border-[#302a28] space-y-2 safe-area-pb">
                {saveError && (
                  <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                    {saveError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    disabled={saving}
                    className="px-3 py-2 min-h-10 text-xs text-[#8c8279] hover:text-[#f5f2eb] disabled:opacity-50"
                  >
                    {t('actionClose')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !editName.trim()}
                    className="px-4 py-2 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] disabled:opacity-60"
                  >
                    {saving ? t('prfSaving') : t('actionSave')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
