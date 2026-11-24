/**
 * Live mode: pending applications to join a direction (owner decision: joining needs approval).
 * Shown to whoever the database lets decide — the direction's lead or a moderator+ (RLS + review_membership).
 * Renders nothing in demo mode or when there is nothing to decide.
 */
import React, { useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS } from '../data/directions';

export const MembershipApplications: React.FC<{ showWhenEmpty?: boolean }> = ({ showWhenEmpty = false }) => {
  const { membershipApplications, reviewMembership, language, t } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  if (!reviewMembership || (!showWhenEmpty && membershipApplications.length === 0)) return null;

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    await reviewMembership(id, approve);
    setBusy(null);
  };

  return (
    <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] p-4 sm:p-5 space-y-3">
      <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-[#dfcfb3]" />
        {t('liveApplicationsTitle')}
        {membershipApplications.length > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-[#dfcfb3]/15 text-[#dfcfb3]">{membershipApplications.length}</span>
        )}
      </h3>
      {membershipApplications.length === 0 ? (
        <p className="text-xs text-[#9e948c]">{t('liveApplicationsEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {membershipApplications.map(app => {
            const dir = COMMUNITY_DIRECTIONS.find(d => d.id === app.direction);
            const dirName = language === 'kz' ? dir?.nameKz : language === 'en' ? dir?.nameEn : dir?.nameRu;
            return (
              <li key={app.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#1a1716] border border-[#302a28]">
                <div className="text-xs min-w-0">
                  <span className="font-semibold text-[#f5f2eb]">{app.userName}</span>
                  <span className="text-[#9e948c]"> → {dirName ?? app.direction}</span>
                  <span className="block text-[10px] text-[#9e948c] font-mono">{app.createdAt}</span>
                  {app.message && <span className="block text-[11px] text-[#c7beaf] mt-1">«{app.message}»</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void decide(app.id, true)}
                    disabled={busy === app.id}
                    className="px-3 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-[11px] font-semibold text-[#1e1b1a] flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('liveApprove')}
                  </button>
                  <button
                    onClick={() => void decide(app.id, false)}
                    disabled={busy === app.id}
                    className="px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] disabled:opacity-50 border border-[#483f3a] text-[11px] text-[#dfcfb3] flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t('liveReject')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
