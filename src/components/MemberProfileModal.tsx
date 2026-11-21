import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TIERS, SHOP_ITEMS } from '../data/gamification';
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import {
  X,
  Star,
  BookOpen,
  Calendar,
  Award,
  HeartHandshake,
  Send,
  MapPin,
} from 'lucide-react';
import { PeerReview } from '../types';

export const MemberProfileModal: React.FC = () => {
  const { selectedUserModal, setSelectedUserModal, addPeerReview, currentUser, t, ln, lf } = useApp();

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewAspect, setReviewAspect] = useState<PeerReview['aspect']>('inspiration');
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);

  if (!selectedUserModal) return null;

  const targetTier = TIERS[selectedUserModal.tier] || TIERS.bronze;
  const equippedFrame = SHOP_ITEMS.find(i => i.id === selectedUserModal.inventory.equippedFrame);
  const equippedSkin = SHOP_ITEMS.find(i => i.id === selectedUserModal.inventory.equippedAvatarSkin);
  const equippedArtifact = SHOP_ITEMS.find(i => i.id === selectedUserModal.inventory.equippedArtifact);
  const equippedAura = SHOP_ITEMS.find(i => i.id === selectedUserModal.inventory.equippedAura);

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;

    addPeerReview(selectedUserModal.id, reviewRating, reviewComment.trim(), reviewAspect);
    setReviewComment('');
    setShowReviewForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-6 space-y-6">
        <button
          onClick={() => setSelectedUserModal(null)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Member Header */}
        <div className="flex items-start gap-4">
          <div className="relative">
            {equippedAura && (
              <div className={`absolute inset-0 rounded-full blur-xl pointer-events-none ${equippedAura.id === 'item-aura-tengri-glow' ? 'bg-amber-400/40' : 'bg-sky-400/30'}`} />
            )}
            <div
              className={`relative w-16 h-16 rounded-full overflow-hidden p-0.5 ${
                equippedFrame?.borderStyle || 'ring-2 ring-[#dfcfb3]/40'
              }`}
            >
              <img
                src={equippedSkin?.previewUrl || selectedUserModal.avatar}
                alt=""
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            {equippedArtifact && (
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-[#1e1b1a] border border-[#dfcfb3] text-[8px] font-bold text-[#f5d77f]">
                {equippedArtifact.badgeTitle}
              </span>
            )}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-bold text-[#f5f2eb] truncate">
                {selectedUserModal.name}
              </h2>
              <span className={`text-[11px] font-semibold ${targetTier.textColor}`}>
                {ln(targetTier)}
              </span>
            </div>
            <p className="text-xs text-[#a39b94] leading-relaxed">
              {selectedUserModal.bio}
            </p>
            <div className="flex items-center gap-2 text-xs text-[#8c8279] pt-1">
              <span>{selectedUserModal.city}</span>
              <span>·</span>
              <span className="font-mono text-[#dfcfb3]">{selectedUserModal.handle}</span>
              <span>·</span>
              <span>{selectedUserModal.xp} XP</span>
            </div>
          </div>
        </div>

        {/* Directions */}
        <div className="flex flex-wrap gap-1.5">
          {selectedUserModal.directions.map(dirId => {
            const dir = COMMUNITY_DIRECTIONS.find(d => d.id === dirId);
            return (
              <span
                key={dirId}
                className="text-[10px] px-2 py-0.5 rounded bg-[#1c1918] text-[#d6cebf] border border-[#302a28]"
              >
                {lf(dir, 'shortName') || dirId}
              </span>
            );
          })}
        </div>

        {/* Books read by this member */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[#dfcfb3] flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('mpBooks')} ({selectedUserModal.readBooks.length}):</span>
          </h4>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {selectedUserModal.readBooks.length === 0 ? (
              <span className="text-xs text-[#8c8279]">{t('mpNoEntries')}</span>
            ) : (
              selectedUserModal.readBooks.map(book => (
                <div key={book.id} className="p-2.5 rounded-lg bg-[#1c1918] text-xs">
                  <div className="flex justify-between font-bold text-[#f5f2eb]">
                    <span>{book.title} ({book.author})</span>
                    <span className="text-amber-400">{book.userRating}★</span>
                  </div>
                  {book.review && (
                    <p className="text-[11px] text-[#a39b94] italic mt-1 leading-relaxed">
                      «{book.review}»
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Achievements */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[#dfcfb3] flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" />
            <span>{t('mpAchievements')} ({selectedUserModal.achievements.length}):</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedUserModal.achievements.map(ach => (
              <span
                key={ach.id}
                className="text-xs px-2.5 py-1 rounded-lg bg-[#1c1918] border border-[#38312d] text-[#f5f2eb]"
              >
                ✓ {lf(ach, 'title')}
              </span>
            ))}
          </div>
        </div>

        {/* Peer Reviews on this member */}
        <div className="space-y-2 pt-2 border-t border-[#302a28]">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#f5f2eb]">
              {t('mpReviews')} ({selectedUserModal.peerReviews.length}):
            </h4>
            {selectedUserModal.id !== currentUser.id && (
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="text-xs text-[#dfcfb3] hover:underline"
              >
                {showReviewForm ? t('mpCancel') : `+ ${t('mpLeaveReview')}`}
              </button>
            )}
          </div>

          {showReviewForm && (
            <form onSubmit={handleReviewSubmit} className="p-3 rounded-xl bg-[#1c1918] border border-[#302a28] space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[#8c8279] block mb-1">{t('mpRating')} (1-5)</label>
                  <select
                    value={reviewRating}
                    onChange={e => setReviewRating(Number(e.target.value))}
                    className="w-full p-1.5 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    <option value={5}>5★ {t('mpRate5')}</option>
                    <option value={4}>4★ {t('mpRate4')}</option>
                    <option value={3}>3★ {t('mpRate3')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#8c8279] block mb-1">{t('prfAspect')}</label>
                  <select
                    value={reviewAspect}
                    onChange={e => setReviewAspect(e.target.value as any)}
                    className="w-full p-1.5 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    <option value="inspiration">{t('aspect_inspiration')}</option>
                    <option value="knowledge">{t('aspect_knowledge')}</option>
                    <option value="communication">{t('aspect_communication')}</option>
                    <option value="teamwork">{t('aspect_teamwork')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[#8c8279] block mb-1">{t('mpReviewText')}</label>
                <textarea
                  rows={2}
                  required
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder={t('mpReviewPlaceholder')}
                  className="w-full p-2 rounded bg-[#24201e] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
              >
                {t('mpSendReview')} (+20 XP, +10 🪙)
              </button>
            </form>
          )}

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectedUserModal.peerReviews.length === 0 ? (
              <span className="text-xs text-[#8c8279]">{t('mpNoReviews')}</span>
            ) : (
              selectedUserModal.peerReviews.map(rev => (
                <div key={rev.id} className="p-2.5 rounded-lg bg-[#1c1918] text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#f5f2eb]">{rev.authorName}</span>
                    <span className="text-amber-400 font-mono">{rev.rating}★</span>
                  </div>
                  <p className="text-[11px] text-[#a39b94] leading-relaxed">«{rev.comment}»</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
