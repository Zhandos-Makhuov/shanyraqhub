import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
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
} from 'lucide-react';

export const AttendanceView: React.FC = () => {
  const { allUsers, events, currentUser, checkInAttendance, setSelectedUserModal, t } = useApp();

  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);
  const [qrScanning, setQrScanning] = useState(false);
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');

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
  const totalRegistrations = allVisits.length;
  const attendanceRate = totalRegistrations > 0
    ? Math.round((attendedVisits.length / totalRegistrations) * 100)
    : 100;

  const handleSimulateQrCheckIn = () => {
    setQrScanning(true);
    setScanSuccessMsg('');

    setTimeout(() => {
      checkInAttendance(selectedEventId, selectedUserId);
      setQrScanning(false);
      const user = allUsers.find(u => u.id === selectedUserId);
      setScanSuccessMsg(`Визит для ${user?.name} успешно подтвержден! Начислено +60 XP и +40 коинов.`);
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
          <span className="text-[11px] text-emerald-400 block mt-1">✓ Подтверждено на месте</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">{t('attendanceRate')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#dfcfb3]">
            {attendanceRate}%
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">высокая дисциплина клуба</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">Моих визитов</span>
          <span className="text-2xl font-bold font-mono-numbers text-[#f5d77f]">
            {currentUser.attendedEvents.filter(e => e.status === 'attended').length}
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">личный рекорд</span>
        </div>

        <div className="p-4 rounded-xl bg-[#23201e] border border-[#352f2c]">
          <span className="text-xs text-[#8c8279] block mb-1">{t('participationStreak')}</span>
          <span className="text-2xl font-bold font-mono-numbers text-amber-500 flex items-center gap-1">
            <Flame className="w-5 h-5 fill-current" />
            14
          </span>
          <span className="text-[11px] text-[#8c8279] block mt-1">дней активности</span>
        </div>
      </div>

      {/* QR Code Check-in Simulator Box */}
      <div className="rounded-2xl bg-gradient-to-br from-[#27211e] via-[#201d1c] to-[#181514] border border-[#433c37] p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-lg">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#dfcfb3]">
              <QrCode className="w-4 h-4" />
              <span>{t('qrCheckInSimulator')}</span>
            </div>
            <h3 className="font-display text-base font-bold text-[#f5f2eb]">
              Экспресс-верификация присутствия на встрече клуба
            </h3>
            <p className="text-xs text-[#a39b94] leading-relaxed">
              На входе в пространство Shanyraq Hub сканируйте клубный QR-код или выберите встречу ниже для моментального начисления XP и Shanyraq Coins.
            </p>
          </div>

          {/* Interactive controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#191615] p-3 rounded-xl border border-[#352f2c]">
            <div className="w-full sm:w-auto">
              <label className="text-[10px] text-[#8c8279] uppercase block mb-1">Событие</label>
              <select
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
                className="w-full sm:w-56 p-1.5 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] focus:outline-none"
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    {ev.date} · {ev.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-auto">
              <label className="text-[10px] text-[#8c8279] uppercase block mb-1">Участник</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full sm:w-44 p-1.5 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] focus:outline-none"
              >
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-auto self-end">
              <button
                onClick={handleSimulateQrCheckIn}
                disabled={qrScanning}
                className="w-full px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-xs font-semibold text-[#1e1b1a] transition-all flex items-center justify-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{qrScanning ? 'Сканирование...' : t('actionCheckIn')}</span>
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

      {/* Attendance History Table */}
      <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] overflow-hidden">
        <div className="p-4 border-b border-[#302a28] flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
            История посещений участников клуба
          </h3>
          <span className="text-xs text-[#8c8279]">
            Показано {allVisits.length} записей
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#1a1716] text-[#8c8279] uppercase text-[10px] tracking-wider border-b border-[#302a28]">
              <tr>
                <th className="px-4 py-3">Участник</th>
                <th className="px-4 py-3">Мероприятие</th>
                <th className="px-4 py-3">Дата встречи</th>
                <th className="px-4 py-3">Время отметки</th>
                <th className="px-4 py-3 text-right">Статус верификации</th>
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
                        Посетил (+60 XP)
                      </span>
                    ) : item.status === 'registered' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#2a2522] text-[#dfcfb3] border border-[#443b36]">
                        <Clock className="w-3 h-3" />
                        Зарегистрирован
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#736a62]">
                        Отменено
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
