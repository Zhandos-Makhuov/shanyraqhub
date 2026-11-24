import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { hasRole, isStaffRole } from '../utils/permissions';
import { formatShortDate, getEventStart, hasEventEnded } from '../utils/eventTime';
import { AvatarWithFallback } from './ProfileParts';
import { ConfirmDialog } from './ForumPostTools';
import { attendedCount, registeredCount } from '../utils/counts';
import { computeCommunityStats } from '../utils/communityStats';
import { CommunityEvent } from '../types';
import { isDemoData } from '../config/runtime';
import { QrScanModal } from './CheckInQr';
import { ATTENDANCE_XP, TIERS, attendanceCoinsForTier } from '../data/gamification';
import { pluralDaysRu, pluralWeeksRu } from '../utils/streak';
import {
  UserCheck,
  QrCode,
  Calendar,
  CheckCircle,
  Clock,
  Sparkles,
  Flame,
  Award,
  Users,
  ScanLine,
} from 'lucide-react';

export const AttendanceView: React.FC = () => {
  const { allUsers, events, currentUser, checkInAttendance, undoCheckIn, checkInWithCode, setSelectedUserModal, getActivityStreak, getWeekStreak, t, language, ln } = useApp();
  const myStreak = getActivityStreak(currentUser.id);
  const myWeekStreak = getWeekStreak(currentUser.id);

  // Staff confirm attendance of other members; nobody can check themselves in (except a super admin — owner decision).
  const isStaff = isStaffRole(currentUser.role);
  const selfAllowed = currentUser.role === 'super_admin';
  const [showScanner, setShowScanner] = useState(false);

  // Events this person may check members in to — the same rules as manual_check_in:
  // the event's organizer or moderator+, not cancelled, from 2 hours before the start.
  const now = Date.now();
  const checkInEvents = useMemo(() => events
    .filter(e => e.status !== 'cancelled'
      && (hasRole(currentUser.role, 'moderator') || e.hostId === currentUser.id)
      && getEventStart(e).getTime() - 2 * 3600_000 <= now
      // Owner decision C-15: an organizer's manual check-in closes 24 h after the event ends; moderator+ can correct later.
      && (hasRole(currentUser.role, 'moderator') || now <= getEventStart(e).getTime() + (e.durationMinutes || 90) * 60_000 + 24 * 3600_000))
    // Running/today first, then the most recent ones.
    .sort((a, b) => Number(hasEventEnded(a)) - Number(hasEventEnded(b)) || getEventStart(b).getTime() - getEventStart(a).getTime()),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [events, currentUser.role, currentUser.id]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const currentEvent: CommunityEvent | undefined = checkInEvents.find(e => e.id === selectedEventId) ?? checkInEvents[0];

  // Roster: who registered (and who already came), plus walk-ins found by name.
  const roster = currentEvent
    ? [...new Set([...currentEvent.registeredUserIds, ...currentEvent.attendedUserIds])]
        .map(id => allUsers.find(u => u.id === id))
        .filter((u): u is NonNullable<typeof u> => !!u)
    : [];
  const [walkInQuery, setWalkInQuery] = useState('');
  const walkIns = walkInQuery.trim().length < 2 || !currentEvent ? [] : allUsers
    .filter(u => !roster.some(r => r.id === u.id) && u.name.toLocaleLowerCase().includes(walkInQuery.trim().toLocaleLowerCase()))
    .slice(0, 5);

  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const checkIn = async (userId: string) => {
    if (!currentEvent || busyRef.current) return;
    busyRef.current = true;
    setBusyUserId(userId);
    setResult(null);
    const user = allUsers.find(u => u.id === userId);
    const r = await checkInAttendance(currentEvent.id, userId);
    busyRef.current = false;
    setBusyUserId(null);
    if (!r.ok) {
      setResult({ ok: false, text: r.error ? t(r.error) : t('attStaffOnly') });
      return;
    }
    const coins = attendanceCoinsForTier(user?.tier ?? 'bronze');
    const bonus = TIERS[user?.tier ?? 'bronze']?.attendanceCoinBonusPercent ?? 0;
    setResult({
      ok: true,
      text: t('attConfirmed').replace('{name}', user?.name ?? '').replace('{xp}', String(ATTENDANCE_XP)).replace('{coins}', String(coins)) + (bonus ? ` (${t('attTierBonus')} +${bonus}%)` : ''),
    });
    setWalkInQuery('');
  };

  // Undo a wrong check-in (owner decision C-14): moderator+, with a reason; the server takes the reward back.
  const canUndo = hasRole(currentUser.role, 'moderator');
  const [undoUser, setUndoUser] = useState<{ id: string; name: string } | null>(null);
  const [undoReason, setUndoReason] = useState('');
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState('');
  const doUndo = async () => {
    if (!undoUser || !currentEvent || undoBusy) return;
    setUndoBusy(true); setUndoError('');
    const r = await undoCheckIn(currentEvent.id, undoUser.id, undoReason.trim());
    setUndoBusy(false);
    if (!r.ok) { setUndoError(t(r.error || 'authErrorGeneric')); return; }
    setResult({ ok: true, text: t('attUndoDone').replace('{name}', undoUser.name) });
    setUndoUser(null); setUndoReason('');
  };

  // Aggregate attendance data: newest first; staff may see everyone they are allowed to (members — only themselves,
  // other members' visits are private, owner decision C-21); shown in pages of 30.
  const [historyScopeChoice, setHistoryScope] = useState<'all' | 'mine'>('all');
  const historyScope = isStaff ? historyScopeChoice : 'mine';
  const [historyLimit, setHistoryLimit] = useState(30);
  const allVisits = allUsers.flatMap(u =>
    u.attendedEvents.map(att => ({
      ...att,
      userId: u.id,
      userName: u.name,
      userAvatar: u.avatar,
      userRole: u.role,
      userTier: u.tier,
    }))
  );
  const historyVisits = allVisits
    .filter(v => historyScope === 'all' || v.userId === currentUser.id)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const shownVisits = historyVisits.slice(0, historyLimit);
  const openMember = (id: string) => {
    const target = allUsers.find(u => u.id === id);
    if (target) setSelectedUserModal(target);
  };

  // Club numbers from public counts (live: get_event_counts); null rate when there are no registrations ("—").
  const clubStats = computeCommunityStats(allUsers, events);
  const attendedVisits = { length: clubStats.verifiedVisits };
  const attendanceRate = clubStats.attendanceRate;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
          {t('attendanceTitle')}
        </h1>
        <p className="text-xs text-[#9e948c] mt-1">
          {t('attendanceSubtitle')}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#9e948c] block mb-1">{t('verifiedVisits')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {attendedVisits.length}
          </span>
          <span className="text-[11px] text-emerald-400 block mt-1">✓ {t('attConfirmedOnSite')}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#9e948c] block mb-1">{t('attendanceRate')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#dfcfb3]">
            {attendanceRate !== null ? `${attendanceRate}%` : '—'}
          </span>
          <span className="text-[11px] text-[#9e948c] block mt-1">
            {attendanceRate !== null ? t('attRateSub') : t('attNoEntries')}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#9e948c] block mb-1">{t('attMyVisits')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f]">
            {currentUser.attendedEvents.filter(e => e.status === 'attended').length}
          </span>
          <span className="text-[11px] text-[#9e948c] block mt-1">{t('attByStaff')}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#9e948c] block mb-1">{t('participationStreak')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-amber-500 flex items-center gap-1">
            <Flame className="w-5 h-5 fill-current" />
            {myWeekStreak}
            <span className="font-display text-xs font-medium text-[#9e948c] ml-0.5">{language === 'ru' ? `${pluralWeeksRu(myWeekStreak)} подряд` : t('attWeeksInRow')}</span>
          </span>
          <span className="text-[11px] text-[#9e948c] block mt-1">{language === 'ru' ? `и ${myStreak} ${pluralDaysRu(myStreak)} подряд` : t('attDaysInRow').replace('{n}', String(myStreak))}</span>
        </div>
      </div>

      {/* Check-in desk (staff only): pick the event, mark people from its list, find walk-ins by name */}
      {isStaff && (
      <section className="rounded-2xl bg-gradient-to-br from-[#27211e] via-[#201d1c] to-[#181514] border border-[#433c37] p-4 sm:p-6 shadow-xl space-y-4" aria-labelledby="checkin-title" data-checkin-desk>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 max-w-lg">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#dfcfb3]">
              <QrCode className="w-4 h-4" aria-hidden="true" />
              <span>{isDemoData ? t('qrCheckInSimulator') : t('qrScanTitle')}</span>
            </div>
            <h2 id="checkin-title" className="font-display text-base font-bold text-[#f5f2eb]">
              {t('attExpressTitle')}
            </h2>
            <p className="text-xs text-[#a39b94] leading-relaxed">{t('attDeskText')}</p>
          </div>
          {checkInWithCode && (
            <button
              onClick={() => setShowScanner(true)}
              className="btn-secondary min-h-10 px-4 text-xs shrink-0 self-start"
            >
              <ScanLine className="w-4 h-4" aria-hidden="true" />
              <span>{t('qrScanButton')}</span>
            </button>
          )}
        </div>

        {checkInEvents.length === 0 ? (
          <p className="p-3 rounded-xl bg-[#191615] border border-[#352f2c] text-xs text-[#a39b94]" data-checkin-empty>{t('attNoCheckInEvents')}</p>
        ) : currentEvent && (
          <>
            <div>
              <label htmlFor="checkin-event" className="text-[11px] text-[#9e948c] block mb-1">{t('attEvent')}</label>
              <select
                id="checkin-event"
                value={currentEvent.id}
                onChange={e => { setSelectedEventId(e.target.value); setResult(null); setWalkInQuery(''); }}
                className="w-full sm:max-w-md min-h-10 px-2 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
              >
                {checkInEvents.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {formatShortDate(ev.date, t)} · {ev.time} · {ev.title}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] text-[#d6cebf]" aria-live="polite" data-checkin-counts>
                {t('attRosterCounts').replace('{reg}', String(registeredCount(currentEvent))).replace('{came}', String(attendedCount(currentEvent)))}
              </p>
            </div>

            {result && (
              <div role={result.ok ? 'status' : 'alert'} className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${result.ok ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-red-950/40 border-red-900/60 text-red-200'}`} data-checkin-result={result.ok ? 'ok' : 'error'}>
                <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{result.text}</span>
              </div>
            )}

            {roster.length === 0 ? (
              <p className="text-xs text-[#9e948c]">{t('evNoRegistrations')}</p>
            ) : (
              <ul className="divide-y divide-[#2d2725] rounded-xl border border-[#352f2c] bg-[#191615]" data-checkin-roster>
                {roster.map(u => {
                  const came = currentEvent.attendedUserIds.includes(u.id);
                  const self = u.id === currentUser.id && !selfAllowed;
                  return (
                    <li key={u.id} className="flex items-center gap-2.5 px-3 py-2" data-roster-user={u.id}>
                      <AvatarWithFallback src={u.avatar} name={u.name} className="w-8 h-8 shrink-0" textClassName="text-[10px]" />
                      <span className="min-w-0 flex-1 text-xs text-[#f5f2eb] truncate">{u.name}</span>
                      {came ? (
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="inline-flex items-center gap-1 px-2.5 min-h-8 rounded-full text-[11px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800" data-roster-came>
                            <CheckCircle className="w-3 h-3" aria-hidden="true" />{t('prfAttended')}
                          </span>
                          {canUndo && !self && (
                            <button
                              type="button"
                              onClick={() => { setUndoError(''); setUndoReason(''); setUndoUser({ id: u.id, name: u.name }); }}
                              aria-label={`${t('attUndo')}: ${u.name}`}
                              className="min-h-10 px-2.5 rounded-lg text-[11px] text-red-300 border border-red-900/60 hover:bg-red-950/40"
                              data-roster-undo
                            >
                              {t('attUndo')}
                            </button>
                          )}
                        </span>
                      ) : self ? (
                        <span className="text-[11px] text-[#9e948c] shrink-0">{t('attNotSelf')}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void checkIn(u.id)}
                          disabled={busyUserId !== null}
                          aria-busy={busyUserId === u.id}
                          aria-label={`${t('actionCheckIn')}: ${u.name}`}
                          className="btn-primary min-h-10 px-3 text-xs shrink-0 disabled:opacity-60"
                          data-roster-checkin
                        >
                          {busyUserId === u.id ? t('evWorking') : t('attMarkShort')}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Walk-ins: came without registering */}
            <div className="space-y-2">
              <label htmlFor="checkin-walkin" className="text-[11px] text-[#9e948c] block">{t('attWalkInLabel')}</label>
              <input
                id="checkin-walkin"
                type="search"
                value={walkInQuery}
                onChange={e => setWalkInQuery(e.target.value)}
                placeholder={t('attWalkInPlaceholder')}
                autoComplete="off"
                className="w-full sm:max-w-md min-h-10 px-3 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] placeholder-[#9e948c] focus:outline-none focus:border-[#dfcfb3]"
              />
              {walkInQuery.trim().length >= 2 && (
                walkIns.length === 0 ? (
                  <p className="text-[12px] text-[#9e948c]" data-walkin-empty>{t('attWalkInNone')}</p>
                ) : (
                  <ul className="space-y-1.5" data-walkin-list>
                    {walkIns.map(u => {
                      const self = u.id === currentUser.id && !selfAllowed;
                      return (
                        <li key={u.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[#352f2c] bg-[#191615]">
                          <AvatarWithFallback src={u.avatar} name={u.name} className="w-8 h-8 shrink-0" textClassName="text-[10px]" />
                          <span className="min-w-0 flex-1 text-xs text-[#f5f2eb] truncate">{u.name}</span>
                          {self ? (
                            <span className="text-[11px] text-[#9e948c] shrink-0">{t('attNotSelf')}</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void checkIn(u.id)}
                              disabled={busyUserId !== null}
                              aria-label={`${t('actionCheckIn')}: ${u.name}`}
                              className="btn-secondary min-h-10 px-3 text-xs shrink-0 disabled:opacity-60"
                              data-walkin-checkin
                            >
                              {busyUserId === u.id ? t('evWorking') : t('attMarkShort')}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              )}
            </div>
          </>
        )}
      </section>
      )}

      <ConfirmDialog
        open={!!undoUser}
        title={t('attUndoQ')}
        text={t('attUndoText').replace('{name}', undoUser?.name ?? '').replace('{event}', currentEvent?.title ?? '')}
        confirmLabel={t('attUndo')}
        busyLabel={t('evWorking')}
        cancelLabel={t('frmCancel')}
        busy={undoBusy}
        error={undoError}
        confirmDisabled={!undoReason.trim()}
        onConfirm={() => void doUndo()}
        onCancel={() => setUndoUser(null)}
      >
        <div>
          <label htmlFor="undo-reason" className="text-[11px] text-[#d6cebf] block mb-1">{t('attUndoReason')} *</label>
          <input
            id="undo-reason"
            type="text"
            value={undoReason}
            maxLength={300}
            onChange={e => setUndoReason(e.target.value)}
            className="w-full min-h-10 px-3 rounded-lg bg-[#1a1716] border border-[#3b3430] text-xs text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
          />
        </div>
      </ConfirmDialog>

      {showScanner && <QrScanModal onClose={() => setShowScanner(false)} />}

      {/* Attendance History: newest first, mine / everyone, shown in pages */}
      <section className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden" aria-labelledby="att-history-title" data-att-history>
        <div className="p-4 border-b border-[#302a28] flex flex-wrap items-center justify-between gap-2">
          <h2 id="att-history-title" className="font-display text-sm font-bold text-[#f5f2eb]">
            {t('attHistoryTitle')}
          </h2>
          <div className="flex items-center gap-2">
            {isStaff && <div className="flex items-center bg-[#1a1716] rounded-lg p-0.5 border border-[#302a28]" role="group" aria-label={t('attHistoryScope')}>
              {(['all', 'mine'] as const).map(sc => (
                <button key={sc} type="button" onClick={() => { setHistoryScope(sc); setHistoryLimit(30); }} aria-pressed={historyScope === sc}
                        className={`min-h-9 px-3 rounded-md text-[11px] font-medium ${historyScope === sc ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#9e948c]'}`}>
                  {sc === 'all' ? t('attHistoryAll') : t('attHistoryMine')}
                </button>
              ))}
            </div>}
            <span className="text-xs text-[#9e948c]" aria-live="polite">
              {t('attShown').replace('{n}', String(historyVisits.length))}
            </span>
          </div>
        </div>

        {historyVisits.length === 0 ? (
          <p className="p-6 text-center text-xs text-[#9e948c]" data-att-history-empty>{t('attHistoryEmpty')}</p>
        ) : (
          <ul className="divide-y divide-[#2d2725]">
            {shownVisits.map((item, idx) => (
              <li key={`${item.eventId}-${item.userId}-${idx}`} className="p-3 sm:px-4 flex flex-wrap min-[480px]:flex-nowrap items-center gap-x-3 gap-y-1.5 min-w-0" data-visit>
                <button type="button" onClick={() => openMember(item.userId)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 min-[480px]:flex-none min-[480px]:w-44 sm:w-56 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3]/60">
                  <AvatarWithFallback src={item.userAvatar} name={item.userName} className="w-8 h-8 ring-1 ring-[#dfcfb3]/40 shrink-0" textClassName="text-[10px]" />
                  <span className="min-w-0">
                    <span className="font-semibold text-xs text-[#f5f2eb] block truncate" data-visit-name>{item.userName}</span>
                    <span className="text-[10px] text-[#9e948c] block truncate">{ln(TIERS[item.userTier])}</span>
                  </span>
                </button>
                {/* Narrow phones: the event goes on its own line under the name */}
                <span className="min-w-0 basis-full order-last pl-[42px] min-[480px]:pl-0 min-[480px]:basis-auto min-[480px]:order-none min-[480px]:flex-1">
                  <span className="block text-xs text-[#d6cebf] font-medium truncate">{item.title}</span>
                  <span className="block text-[11px] text-[#9e948c]">
                    {formatShortDate(item.date, t)}{item.checkInTime ? ` · ${t('attCheckIn')}: ${item.checkInTime}` : ''}
                  </span>
                </span>
                <span className="shrink-0 ml-auto min-[480px]:order-none">
                  {item.status === 'attended' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                      <CheckCircle className="w-3 h-3" aria-hidden="true" />
                      {t('prfAttended')}
                    </span>
                  ) : item.status === 'registered' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#2a2522] text-[#dfcfb3] border border-[#443b36]">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {t('prfSignedUp')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#9e948c]">
                      {t('attCancelled')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {historyVisits.length > shownVisits.length && (
          <div className="p-3 border-t border-[#302a28] text-center">
            <button type="button" onClick={() => setHistoryLimit(l => l + 30)} className="btn-ghost min-h-10 px-4 text-xs" data-att-more>
              {t('attShowMore').replace('{n}', String(historyVisits.length - shownVisits.length))}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
