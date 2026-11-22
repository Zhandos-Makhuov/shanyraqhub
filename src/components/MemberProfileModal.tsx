import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ACHIEVEMENT_ICONS } from './AchievementsView';
import { TIERS } from '../data/gamification';
import { X, BookOpen, Award, UserRound } from 'lucide-react';
import { PeerReview } from '../types';
import { useDialog } from '../hooks/useDialog';
import {
  EquippedAvatar,
  ProfileRoleBadge,
  RecentAchievements,
  ReviewCard,
  TelegramContact,
  TierProgressPanel,
  useDirectionName,
} from './ProfileParts';
import { activeAchievementCount } from '../utils/profileProgress';
import { formatClubDate } from '../utils/eventTime';

export const MemberProfileModal: React.FC = () => {
  const { selectedUserModal, setSelectedUserModal, addPeerReview, currentUser, t, ln, lf } = useApp();
  const directionName = useDirectionName();

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAspect, setReviewAspect] = useState<PeerReview['aspect']>('inspiration');
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [showAllAchievements, setShowAllAchievements] = useState(false);

  const open = !!selectedUserModal;
  const close = () => setSelectedUserModal(null);
  const panelRef = useDialog<HTMLDivElement>(open, close);

  // Another member opened → start with a clean review form.
  const memberId = selectedUserModal?.id;
  useEffect(() => {
    setShowReviewForm(false);
    setReviewComment('');
    setReviewError('');
    setReviewSent(false);
    setShowAllAchievements(false);
  }, [memberId]);

  if (!selectedUserModal) return null;
  const member = selectedUserModal;

  const targetTier = TIERS[member.tier] || TIERS.bronze;
  // One review per author, member and aspect (same rule as the database): warn before sending.
  const alreadyReviewedAspect = member.peerReviews.some(r => r.authorId === currentUser.id && r.aspect === reviewAspect);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim() || sending) return;
    if (alreadyReviewedAspect) {
      setReviewError(t('ctxReviewDuplicate'));
      return;
    }
    setSending(true);
    setReviewError('');
    const r = await addPeerReview(member.id, reviewRating, reviewComment.trim(), reviewAspect);
    setSending(false);
    if (r.ok) {
      setReviewComment('');
      setShowReviewForm(false);
      setReviewSent(true);
    } else {
      // A duplicate aspect (e.g. an earlier review hidden by a moderator) comes back from the server as a unique-key error.
      setReviewError(t(r.error === 'liveErrDuplicate' ? 'ctxReviewDuplicate' : r.error || 'authErrorGeneric'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={e => {
        if (e.target === e.currentTarget) close();
      }}
      data-member-backdrop
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-name"
        tabIndex={-1}
        className="relative w-full max-w-xl max-h-[90dvh] flex flex-col bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
      >
        {/* The close button sits outside the scrolling area, so it is always reachable */}
        <button
          type="button"
          onClick={close}
          aria-label={t('mpCloseProfile')}
          className="absolute top-3 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]/90 border border-[#302a28]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-6 rounded-2xl">
          {/* Member Header */}
          <div className="flex items-start gap-4 pr-10">
            <EquippedAvatar user={member} size="md" />

            <div className="space-y-1 min-w-0">
              <h2 id="member-profile-name" className="font-display text-lg font-bold text-[#f5f2eb] break-words [overflow-wrap:anywhere]">
                {member.name}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[11px] font-semibold ${targetTier.textColor}`}>{ln(targetTier)}</span>
                <ProfileRoleBadge role={member.role} compact />
              </div>
              {member.bio && <p className="text-xs text-[#a39b94] leading-relaxed break-words">{member.bio}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8c8279] pt-1">
                {member.city && <span>{member.city}</span>}
                <span className="flex items-center gap-1 min-w-0" title={t('prfHandleLabel')} data-contact="handle">
                  <UserRound className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('prfHandleLabel')}: </span>
                  <span className="font-mono text-[#dfcfb3] break-all">{member.handle}</span>
                </span>
                <TelegramContact value={member.telegram} />
                <span data-member-joined>{t('joinedSince')} {formatClubDate(member.joinedDate, t)}</span>
              </div>
            </div>
          </div>

          {/* Directions */}
          {member.directions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {member.directions.map(dirId => (
                <span
                  key={dirId}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#1c1918] text-[#d6cebf] border border-[#302a28]"
                >
                  {directionName(dirId)}
                </span>
              ))}
            </div>
          )}

          {/* Profile overview: public level progress (no coins) and the latest achievements */}
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:items-start gap-3" data-profile-overview>
            <TierProgressPanel user={member} idPrefix="member" />
            <RecentAchievements
              user={member}
              isOwn={member.id === currentUser.id}
              idPrefix="member"
              action={
                activeAchievementCount(member) > 3 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllAchievements(v => !v)}
                    aria-expanded={showAllAchievements}
                    aria-controls="member-all-achievements"
                    className="shrink-0 min-h-8 text-[12px] font-medium text-[#dfcfb3] hover:text-[#ecd9bf] hover:underline"
                    data-recent-all
                  >
                    {showAllAchievements
                      ? t('prfHideAchievements')
                      : t('prfShowAllAchievements').replace('{n}', String(activeAchievementCount(member)))}
                  </button>
                ) : undefined
              }
            />
          </div>

          {/* All achievements of this member (the existing list), opened from the block above */}
          {showAllAchievements && (
            <div id="member-all-achievements" className="space-y-2" data-member-all-achievements>
              <h3 className="text-xs font-bold text-[#dfcfb3] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('mpAchievements')} ({activeAchievementCount(member)}):</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {member.achievements
                  .filter(ach => !(member.revokedAchievementIds ?? []).includes(ach.id)) // revoked ones are never shown as earned
                  .map(ach => (
                  <span
                    key={ach.id}
                    data-member-achievement={ach.id}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-[#1c1918] border border-[#38312d] text-[#f5f2eb]"
                  >
                    {React.createElement(ACHIEVEMENT_ICONS[ach.icon] || Award, { className: 'w-3.5 h-3.5 text-[#dfcfb3] shrink-0' })}
                    {lf(ach, 'title')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Books read by this member */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[#dfcfb3] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('mpBooks')} ({member.readBooks.length}):</span>
            </h3>
            <div className="space-y-1.5 max-h-36 overflow-y-auto overscroll-contain">
              {member.readBooks.length === 0 ? (
                <span className="text-xs text-[#8c8279]">{t('mpNoEntries')}</span>
              ) : (
                member.readBooks.map(book => {
                  const completed = book.status === 'completed';
                  return (
                    <div key={book.id} className="p-2.5 rounded-lg bg-[#1c1918] text-xs" data-profile-book={book.status}>
                      <div className="flex justify-between gap-2 font-bold text-[#f5f2eb]">
                        <span className="min-w-0 break-words">{book.title} ({book.author})</span>
                        {completed && book.userRating > 0 ? (
                          <span className="text-amber-400 shrink-0" data-book-rating>{book.userRating}★</span>
                        ) : !completed ? (
                          <span className="shrink-0 text-[10px] font-semibold text-[#dfcfb3]">{t('libMarkReading')}</span>
                        ) : null}
                      </div>
                      {book.review && (
                        <p className="text-[11px] text-[#a39b94] italic mt-1 leading-relaxed break-words">
                          «{book.review}»
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Peer Reviews on this member */}
          <div className="space-y-2 pt-2 border-t border-[#302a28]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[#f5f2eb]" data-member-reviews-count={member.peerReviews.length}>
                {t('mpReviews')} ({member.peerReviews.length}):
              </h3>
              {member.id !== currentUser.id && (
                <button
                  type="button"
                  onClick={() => {
                    setShowReviewForm(!showReviewForm);
                    setReviewError('');
                    setReviewSent(false);
                  }}
                  aria-expanded={showReviewForm}
                  className="text-xs text-[#dfcfb3] hover:underline min-h-9 shrink-0"
                >
                  {showReviewForm ? t('mpCancel') : `+ ${t('mpLeaveReview')}`}
                </button>
              )}
            </div>

            {reviewSent && (
              <p role="status" className="text-[12px] text-emerald-300">{t('mpReviewSent')}</p>
            )}

            {showReviewForm && (
              <form onSubmit={handleReviewSubmit} className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28] space-y-3 text-xs">
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="mp-rating" className="text-[#8c8279] block mb-1">{t('mpRating')}</label>
                    {/* The form offers 3–5 stars; the data allows 1–5 (range unchanged until the owner decides). */}
                    <select
                      id="mp-rating"
                      value={reviewRating}
                      onChange={e => setReviewRating(Number(e.target.value))}
                      className="w-full p-2 min-h-10 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb]"
                    >
                      <option value={5}>5★ {t('mpRate5')}</option>
                      <option value={4}>4★ {t('mpRate4')}</option>
                      <option value={3}>3★ {t('mpRate3')}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="mp-aspect" className="text-[#8c8279] block mb-1">{t('prfAspect')}</label>
                    <select
                      id="mp-aspect"
                      value={reviewAspect}
                      onChange={e => {
                        setReviewAspect(e.target.value as PeerReview['aspect']);
                        setReviewError('');
                      }}
                      className="w-full p-2 min-h-10 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb]"
                    >
                      <option value="inspiration">{t('aspect_inspiration')}</option>
                      <option value="knowledge">{t('aspect_knowledge')}</option>
                      <option value="communication">{t('aspect_communication')}</option>
                      <option value="teamwork">{t('aspect_teamwork')}</option>
                    </select>
                  </div>
                </div>

                {alreadyReviewedAspect && (
                  <p className="text-[11px] text-amber-300" data-review-duplicate>{t('ctxReviewDuplicate')}</p>
                )}

                <div>
                  <label htmlFor="mp-text" className="text-[#8c8279] block mb-1">{t('mpReviewText')}</label>
                  <textarea
                    id="mp-text"
                    rows={2}
                    required
                    maxLength={2000}
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    placeholder={t('mpReviewPlaceholder')}
                    className="w-full p-2 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                  />
                </div>

                <p className="text-[11px] text-[#a39b94] leading-relaxed" data-review-reward-hint>{t('mpRewardHint')}</p>

                {reviewError && (
                  <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                    {reviewError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending || alreadyReviewedAspect || !reviewComment.trim()}
                  className="px-3 py-2 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] disabled:opacity-50"
                >
                  {sending ? t('mpSending') : t('mpSendReview')}
                </button>
              </form>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto overscroll-contain">
              {member.peerReviews.length === 0 ? (
                <span className="text-xs text-[#8c8279]">{t('mpNoReviews')}</span>
              ) : (
                member.peerReviews.map(rev => <ReviewCard key={rev.id} review={rev} compact />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
