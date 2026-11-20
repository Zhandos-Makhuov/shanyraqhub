import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { isStaffRole } from '../utils/permissions';
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
  const { allUsers, events, currentUser, checkInAttendance, checkInWithCode, setSelectedUserModal, getActivityStreak, getWeekStreak, t, language } = useApp();
  const myStreak = getActivityStreak(currentUser.id);
  const myWeekStreak = getWeekStreak(currentUser.id);

  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  // Staff confirm attendance of other members; nobody can check themselves in.
  const isStaff = isStaffRole(currentUser.role);
  const checkInCandidates = allUsers.filter(u => u.id !== currentUser.id || currentUser.role === 'super_admin');
  const [selectedUserId, setSelectedUserId] = useState<string>(checkInCandidates[0]?.id || '');
  const [qrScanning, setQrScanning] = useState(false);
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const currentEvent = events.find(e => e.id === selectedEventId) || events[0];

  // Aggregate attendance data across all users
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

  const attendedVisits = allVisits.filter(v => v.status === 'attended');
  const totalRegistrations = allVisits.filter(v => v.status !== 'cancelled').length;
  // null when there are no registrations yet (shown as "—", never a made-up 100%).
  const attendanceRate = totalRegistrations > 0
    ? Math.round((attendedVisits.length / totalRegistrations) * 100)
    : null;

  const handleSimulateQrCheckIn = () => {
    setQrScanning(true);
    setScanSuccessMsg('');

    setTimeout(async () => {
      const user = allUsers.find(u => u.id === selectedUserId);
      const ev = events.find(e => e.id === selectedEventId);
      const isAlreadyCheckedIn = ev?.attendedUserIds.includes(selectedUserId);

      if (isAlreadyCheckedIn) {
        setQrScanning(false);
        setScanSuccessMsg(t('attAlreadyChecked').replace('{name}', user?.name ?? '').replace('{event}', ev?.title ?? ''));
        setTimeout(() => setScanSuccessMsg(''), 5000);
        return;
      }

      const result = await checkInAttendance(selectedEventId, selectedUserId);
      setQrScanning(false);
      if (!result.ok) {
        setScanSuccessMsg(result.error ? t(result.error) : t('attStaffOnly'));
        setTimeout(() => setScanSuccessMsg(''), 5000);
        return;
      }
      const coins = attendanceCoinsForTier(user?.tier ?? 'bronze');
      const bonus = TIERS[user?.tier ?? 'bronze']?.attendanceCoinBonusPercent ?? 0;
      setScanSuccessMsg(
        t('attConfirmed').replace('{name}', user?.name ?? '').replace('{xp}', String(ATTENDANCE_XP)).replace('{coins}', String(coins)) + (bonus ? ` (${t('attTierBonus')} +${bonus}%)` : '')
      );
      setTimeout(() => setScanSuccessMsg(''), 5000);
    }, 800);
  };

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
          <span className="text-xs text-[#8c8279] block mb-1">{t('verifiedVisits')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#f5f2eb]">
            {attendedVisits.length}
          </span>
          <span className="text-[11px] text-emerald-400 block mt-1">✓ {t('attConfirmedOnSite')}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">{t('attendanceRate')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#dfcfb3]">
            {attendanceRate !== null ? `${attendanceRate}%` : '—'}
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">
            {attendanceRate !== null ? t('attRateSub') : t('attNoEntries')}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">{t('attMyVisits')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f]">
            {currentUser.attendedEvents.filter(e => e.status === 'attended').length}
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">{t('attByStaff')}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">{t('participationStreak')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-amber-500 flex items-center gap-1">
            <Flame className="w-5 h-5 fill-current" />
            {myWeekStreak}
            <span className="font-display text-xs font-medium text-[#8c8279] ml-0.5">{language === 'ru' ? `${pluralWeeksRu(myWeekStreak)} подряд` : t('attWeeksInRow')}</span>
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">{language === 'ru' ? `и ${myStreak} ${pluralDaysRu(myStreak)} подряд` : t('attDaysInRow').replace('{n}', String(myStreak))}</span>
        </div>
      </div>

      {/* QR Code Check-in Simulator Box (staff only) */}
      {isStaff && (
      <div className="rounded-2xl bg-gradient-to-br from-[#27211e] via-[#201d1c] to-[#181514] border border-[#433c37] p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-lg">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#dfcfb3]">
              <QrCode className="w-4 h-4" />
              <span>{isDemoData ? t('qrCheckInSimulator') : t('qrScanTitle')}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800">
                {isDemoData ? t('attDemoScanner') : t('attManual')}
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-[#f5f2eb]">
              {t('attExpressTitle')}
            </h3>
            <p className="text-xs text-[#a39b94] leading-relaxed">
              {t('attExpressText')}
            </p>
          </div>

          {/* Interactive controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#191615] p-3 rounded-xl border border-[#352f2c]">
            <div className="w-full sm:w-auto">
              <label className="text-[10px] text-[#8c8279] uppercase block mb-1">{t('attEvent')}</label>
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="w-full sm:w-56 p-2 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] focus:outline-none"
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.date} · {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-auto">
              <label className="text-[10px] text-[#8c8279] uppercase block mb-1">{t('attMember')}</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full sm:w-44 p-2 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] focus:outline-none"
              >
                {checkInCandidates.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {checkInWithCode && (
              <div className="w-full sm:w-auto sm:self-end">
                <button
                  onClick={() => setShowScanner(true)}
                  className="w-full px-4 py-2 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] border border-[#483f3a] text-xs font-semibold text-[#dfcfb3] transition-all flex items-center justify-center gap-1.5"
                >
                  <ScanLine className="w-3.5 h-3.5" />
                  <span>{t('qrScanButton')}</span>
                </button>
              </div>
            )}
            <div className="w-full sm:w-auto sm:self-end">
              <button
                onClick={handleSimulateQrCheckIn}
                disabled={qrScanning || !selectedEventId || !selectedUserId}
                title={!selectedEventId ? t('attNoEvents') : undefined}
                className="w-full px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-xs font-semibold text-[#1e1b1a] transition-all flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{qrScanning ? t('attScanning') : t('actionCheckIn')}</span>
              </button>
            </div>
          </div>
        </div>

        {scanSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-fade-in">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{scanSuccessMsg}</span>
          </div>
        )}
      </div>
      )}

      {showScanner && <QrScanModal onClose={() => setShowScanner(false)} />}

      {/* Attendance History */}
      <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
        <div className="p-4 border-b border-[#302a28] flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
            {t('attHistoryTitle')}
          </h3>
          <span className="text-xs text-[#8c8279]">
            {t('attShown').replace('{n}', String(allVisits.length))}
          </span>
        </div>

        {/* Mobile Cards List (< sm) */}
        <div className="sm:hidden divide-y divide-[#2d2725]">
          {allVisits.map((item, idx) => (
            <div key={`mobile-visit-${item.eventId}-${item.userId}-${idx}`} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div
                  onClick={() => {
                    const target = allUsers.find(u => u.id === item.userId);
                    if (target) setSelectedUserModal(target);
                  }}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <img
                    src={item.userAvatar}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover ring-1 ring-[#dfcfb3]/40"
                  />
                  <div>
                    <span className="font-semibold text-xs text-[#f5f2eb] block">
                      {item.userName}
                    </span>
                    <span className="text-[10px] text-[#8c8279] uppercase font-mono">
                      {item.userTier}
                    </span>
                  </div>
                </div>

                <div>
                  {item.status === 'attended' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                      <CheckCircle className="w-3 h-3" />
                      {t('prfAttended')}
                    </span>
                  ) : item.status === 'registered' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#2a2522] text-[#dfcfb3] border border-[#443b36]">
                      <Clock className="w-3 h-3" />
                      {t('prfSignedUp')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#736a62]">
                      {t('attCancelled')}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-[#d6cebf] font-medium leading-snug">
                {item.title}
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#8c8279] font-mono pt-1">
                <span>{t('evFormDate')}: {item.date}</span>
                <span>{t('attCheckIn')}: {item.checkInTime || '—'}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View (>= sm) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1a1716] text-[#8c8279] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
              <tr>
                <th className="px-4 py-3">{t('attMember')}</th>
                <th className="px-4 py-3">{t('attEvent')}</th>
                <th className="px-4 py-3">{t('attMeetupDate')}</th>
                <th className="px-4 py-3">{t('attCheckInTime')}</th>
                <th className="px-4 py-3 text-right">{t('attStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d2725]">
              {allVisits.map((item, idx) => (
                <tr key={`${item.eventId}-${item.userId}-${idx}`} className="hover:bg-[#282321] transition-colors">
                  <td className="px-4 py-3">
                    <div
                      onClick={() => {
                        const target = allUsers.find(u => u.id === item.userId);
                        if (target) setSelectedUserModal(target);
                      }}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <img
                        src={item.userAvatar}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover ring-1 ring-[#dfcfb3]/40"
                      />
                      <div>
                        <span className="font-semibold text-[#f5f2eb] group-hover:text-[#dfcfb3] transition-colors block">
                          {item.userName}
                        </span>
                        <span className="text-[10px] text-[#8c8279]">
                          {item.userTier.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#d6cebf] font-medium max-w-xs truncate">
                    {item.title}
                  </td>
                  <td className="px-4 py-3 text-[#8c8279] font-mono">
                    {item.date}
                  </td>
                  <td className="px-4 py-3 text-[#8c8279] font-mono">
                    {item.checkInTime || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'attended' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
                        <CheckCircle className="w-3 h-3" />
                        {t('prfAttended')}
                      </span>
                    ) : item.status === 'registered' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#2a2522] text-[#dfcfb3] border border-[#443b36]">
                        <Clock className="w-3 h-3" />
                        {t('prfSignedUp')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#736a62]">
                        {t('attCancelled')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
