/**
 * Live only, admins: club directions — add, edit, archive / restore (owner decisions 2026-11-20).
 * Archive hides a direction from every choice; its history stays. A new direction gets its own
 * "5 visits" achievement on the server. Ids are permanent.
 */
import React, { useState } from 'react';
import { Archive, Compass, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS } from '../data/directions';
import type { DirectionInput } from '../data/supabase/live';
import type { Direction } from '../types';

const empty: DirectionInput = {
  id: '', name_ru: '', name_kz: '', name_en: '', short_name_ru: '', short_name_kz: '', short_name_en: '',
  description_ru: '', description_kz: '', description_en: '', icon: 'Compass', color: '#dfcfb3', requires_approval: true,
};

const fromDirection = (d: Direction): DirectionInput => ({
  id: d.id, name_ru: d.nameRu, name_kz: d.nameKz, name_en: d.nameEn,
  short_name_ru: d.shortNameRu, short_name_kz: d.shortNameKz, short_name_en: d.shortNameEn,
  description_ru: d.descriptionRu, description_kz: d.descriptionKz, description_en: d.descriptionEn,
  icon: d.icon || 'Compass', color: /^#[0-9a-fA-F]{6}$/.test(d.color) ? d.color : '#dfcfb3', requires_approval: d.requiresApproval !== false,
});

/** A permanent id from the English (or any) name: lowercase latin letters, digits and "_". */
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 30);

const input = 'w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] text-xs focus:outline-none focus:border-[#dfcfb3]';

export const DirectionsManager: React.FC = () => {
  const { liveApi, runLiveAction, t, ln } = useApp();
  const [form, setForm] = useState<DirectionInput | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!liveApi) return null;

  const set = (k: keyof DirectionInput, v: string | boolean) => setForm(f => (f ? { ...f, [k]: v } : f));
  const reloadAfter = async (action: Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    try {
      const r = await action;
      if (!r.ok) { alert(t(r.error)); return false; }
      await liveApi.reloadCatalog();                               // directions + their achievements
      await runLiveAction(Promise.resolve({ ok: true as const }), true); // re-render with the new lists
      return true;
    } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const id = isNew ? form.id || slug(form.name_en) : form.id;
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(id)) { alert(t('dirErrInvalidId')); return; }
    if (await reloadAfter(liveApi.saveDirection({ ...form, id }))) setForm(null);
  };

  const field = (k: keyof DirectionInput, label: string, area = false) => (
    <label className="block">
      <span className="text-[10px] text-[#8c8279] block mb-0.5">{label}</span>
      {area ? (
        <textarea rows={2} className={input} value={String(form![k])} onChange={e => set(k, e.target.value)} />
      ) : (
        <input className={input} value={String(form![k])} onChange={e => set(k, e.target.value)} />
      )}
    </label>
  );

  return (
    <div className="p-5 rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-bold text-[#f5f2eb] flex items-center gap-2">
          <Compass className="w-4 h-4 text-[#dfcfb3]" /> {t('dirTitle')}
        </h3>
        <button
          onClick={() => { setForm({ ...empty }); setIsNew(true); }}
          className="px-3 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> {t('dirAdd')}
        </button>
      </div>
      <p className="text-[11px] text-[#8c8279]">{t('dirIntro')}</p>

      <div className="divide-y divide-[#302a28]">
        {COMMUNITY_DIRECTIONS.map(d => (
          <div key={d.id} className={`py-2.5 flex items-center justify-between gap-3 text-xs ${d.isActive === false ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <div className="min-w-0">
                <span className="font-semibold text-[#f5f2eb] block truncate">{ln(d)}</span>
                <span className="text-[10px] text-[#8c8279] font-mono">
                  {d.id}{d.isActive === false ? ` · ${t('dirArchived')}` : ''}{d.requiresApproval === false ? ` · ${t('dirOpen')}` : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                disabled={busy}
                onClick={() => { setForm(fromDirection(d)); setIsNew(false); }}
                className="p-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] text-[#dfcfb3]"
                title={t('dirEdit')}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {d.isActive === false ? (
                <button disabled={busy} onClick={() => reloadAfter(liveApi.setDirectionActive(d.id, true))}
                        className="p-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] text-emerald-400" title={t('dirRestore')}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button disabled={busy}
                        onClick={() => confirm(t('dirArchiveConfirm').replace('{name}', ln(d))) && reloadAfter(liveApi.setDirectionActive(d.id, false))}
                        className="p-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] text-amber-300" title={t('dirArchive')}>
                  <Archive className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
          <form onSubmit={submit} className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl p-5 space-y-3">
            <button type="button" onClick={() => setForm(null)} className="absolute top-3 right-3 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]">
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-display text-base font-bold text-[#f5f2eb]">{isNew ? t('dirAdd') : t('dirEdit')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {field('name_kz', `${t('dirName')} (KZ) *`)}
              {field('name_ru', `${t('dirName')} (RU) *`)}
              {field('name_en', `${t('dirName')} (EN) *`)}
              {field('short_name_kz', `${t('dirShortName')} (KZ)`)}
              {field('short_name_ru', `${t('dirShortName')} (RU)`)}
              {field('short_name_en', `${t('dirShortName')} (EN)`)}
            </div>
            {field('description_kz', `${t('evFormDescription')} (KZ)`, true)}
            {field('description_ru', `${t('evFormDescription')} (RU)`, true)}
            {field('description_en', `${t('evFormDescription')} (EN)`, true)}
            <div className="grid grid-cols-2 gap-3 items-end">
              <label className="block">
                <span className="text-[10px] text-[#8c8279] block mb-0.5">{t('dirColor')}</span>
                <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="w-full h-9 rounded-lg bg-[#1a1716] border border-[#3b3430]" />
              </label>
              <label className="flex items-center gap-2 text-xs text-[#d6cebf] pb-2">
                <input type="checkbox" checked={form.requires_approval} onChange={e => set('requires_approval', e.target.checked)} />
                {t('dirRequiresApproval')}
              </label>
            </div>
            {isNew && (
              <label className="block">
                <span className="text-[10px] text-[#8c8279] block mb-0.5">{t('dirId')}</span>
                <input className={`${input} font-mono`} value={form.id} placeholder={slug(form.name_en) || 'pottery'}
                       onChange={e => set('id', e.target.value.toLowerCase())} />
                <span className="text-[10px] text-[#736a62]">{t('dirIdHint')}</span>
              </label>
            )}
            {isNew && <p className="text-[11px] text-[#dfcfb3]/80">{t('dirNewAchievement')}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="px-3 py-2 rounded-lg bg-[#2e2927] text-xs text-[#d6cebf]">{t('actionClose')}</button>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-xs font-semibold text-[#1e1b1a]">{t('actionSave')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default DirectionsManager;
