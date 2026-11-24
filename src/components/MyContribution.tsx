import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { clubMonthStart, contribution, Contribution } from '../utils/memberActivity';

/**
 * Phase 5 — "My contribution": what the member has given to the club (all time and this month).
 * Counts only real records (confirmed visits, finished books, reviews, forum posts, event feedback); no ranking, no rewards.
 */
export const MyContribution: React.FC = () => {
  const { currentUser, events, forumTopics, t } = useApp();
  const total = useMemo(() => contribution(currentUser, events, forumTopics), [currentUser, events, forumTopics]);
  const month = useMemo(() => contribution(currentUser, events, forumTopics, clubMonthStart()), [currentUser, events, forumTopics]);

  const rows: { key: keyof Contribution; label: string }[] = [
    { key: 'visits', label: t('mcVisits') },
    { key: 'booksRead', label: t('mcBooks') },
    { key: 'bookReviews', label: t('mcBookReviews') },
    { key: 'topics', label: t('mcTopics') },
    { key: 'replies', label: t('mcReplies') },
    { key: 'eventFeedback', label: t('mcFeedback') },
  ];
  const empty = rows.every(r => total[r.key] === 0);

  return (
    <section className="rounded-xl bg-[#1c1918] border border-[#302a28] p-4 space-y-3" aria-labelledby="my-contribution-title" data-my-contribution>
      <div>
        <h3 id="my-contribution-title" className="text-sm font-bold text-[#f5f2eb]">{t('mcTitle')}</h3>
        <p className="text-[12px] text-[#9e948c]">{empty ? t('mcEmpty') : t('mcSubtitle')}</p>
      </div>
      {!empty && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {rows.map(r => (
            <div key={r.key} className="p-2.5 rounded-lg bg-[#23201e] border border-[#302a28] min-w-0" data-contribution={r.key}>
              <dt className="text-[11px] text-[#9e948c] leading-tight">{r.label}</dt>
              <dd className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                <span className="text-lg font-bold font-mono-numbers text-[#f5f2eb]" data-total>{total[r.key]}</span>
                {month[r.key] > 0 && (
                  <span className="text-[11px] text-emerald-300" data-month>
                    {t('mcThisMonth').replace('{n}', String(month[r.key]))}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
