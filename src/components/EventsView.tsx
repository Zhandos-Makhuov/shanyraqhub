import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS } from '../data/mockData';
import { exportEventToIcs } from '../utils/calendar';
import { CommunityEvent, DirectionId } from '../types';
import {
  Clock,
  MapPin,
  Users,
  Download,
  Plus,
  Search,
  Star,
  Check,
  X,
  FilterX,
} from 'lucide-react';

export const EventsView: React.FC = () => {
  const {
    events,
    currentUser,
    registerForEvent,
    cancelEventRegistration,
    submitEventFeedback,
    createEvent,
    language,
    t,
  } = useApp();

  const [selectedDirection, setSelectedDirection] = useState<string>('all');
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'offline' | 'online'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalEvent, setActiveModalEvent] = useState<CommunityEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<CommunityEvent | null>(null);

  // Feedback form state
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [usefulnessScore, setUsefulnessScore] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  // Create event form state
  const [newTitle, setNewTitle] = useState('');
  const [newDirection, setNewDirection] = useState<DirectionId>('books');
  const [newDate, setNewDate] = useState('2026-11-25');
  const [newTime, setNewTime] = useState('19:00');
  const [newDuration, setNewDuration] = useState(90);
  const [newFormat, setNewFormat] = useState<'offline' | 'online'>('offline');
  const [newAddress, setNewAddress] = useState('Алматы, пр. Достык 160, Shanyraq Hub');
  const [newDescription, setNewDescription] = useState('');
  const [newMaterials, setNewMaterials] = useState('');
  const [newCapacity, setNewCapacity] = useState(25);

  const isStaff =
    currentUser.role === 'super_admin' ||
    currentUser.role === 'admin' ||
    currentUser.role === 'organizer' ||
    currentUser.role === 'moderator';

  const filteredEvents = events.filter(e => {
    if (selectedDirection !== 'all' && e.direction !== selectedDirection) return false;
    if (selectedFormat !== 'all' && e.format !== selectedFormat) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(q);
      const matchDesc = e.description.toLowerCase().includes(q);
      const matchSpeaker = e.speaker.name.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchSpeaker) return false;
    }
    return true;
  });

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFeedbackModal) return;
    submitEventFeedback(
      showFeedbackModal.id,
      satisfactionScore,
      usefulnessScore,
      feedbackComment.trim() || 'Отличная организация и теплая атмосфера!'
    );
    setShowFeedbackModal(null);
    setFeedbackComment('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const materialsArray = newMaterials
      .split('\n')
      .map(m => m.trim())
      .filter(Boolean);

    createEvent({
      title: newTitle.trim(),
      direction: newDirection,
      date: newDate,
      time: newTime,
      durationMinutes: Number(newDuration),
      format: newFormat,
      locationAddress: newAddress.trim(),
      description: newDescription.trim() || 'Клубная встреча резидентов Shanyraq Hub',
      requiredMaterials: materialsArray.length > 0 ? materialsArray : ['Хорошее настроение и открытость новому'],
      maxCapacity: Number(newCapacity),
    });

    setShowCreateModal(false);
    setNewTitle('');
    setNewDescription('');
    setNewMaterials('');
  };

  const resetFilters = () => {
    setSelectedDirection('all');
    setSelectedFormat('all');
    setSearchQuery('');
  };

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 w-full max-w-full">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#f5f2eb]">
            {t('tabEvents')}
          </h1>
          <p className="text-xs text-[#9e948c]">
            Календарь встреч, запись в один клик и экспорт в Apple/Google Calendar
          </p>
        </div>

        {isStaff && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="self-start sm:self-auto px-3.5 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shrink-0 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('actionCreateEvent')}</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3 p-2.5 sm:p-3 bg-[#23201e] border border-[#352f2c] rounded-xl">
        {/* Directions Horizontal Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 lg:pb-0">
          <button
            onClick={() => setSelectedDirection('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              selectedDirection === 'all'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                : 'text-[#9e948c] hover:text-[#f5f2eb] hover:bg-[#2b2725]'
            }`}
          >
            {t('actionFilterAll')}
          </button>
          {COMMUNITY_DIRECTIONS.map(dir => (
            <button
              key={dir.id}
              onClick={() => setSelectedDirection(dir.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedDirection === dir.id
                  ? 'bg-[#dfcfb3] text-[#1e1b1a] font-semibold'
                  : 'text-[#9e948c] hover:text-[#f5f2eb] hover:bg-[#2b2725]'
              }`}
            >
              {language === 'kz' ? dir.shortNameKz : language === 'en' ? dir.shortNameEn : dir.shortNameRu}
            </button>
          ))}
        </div>

        {/* Format & Search */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-[#191615] rounded-lg p-0.5 border border-[#3b3430] shrink-0">
            <button
              onClick={() => setSelectedFormat('all')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                selectedFormat === 'all' ? 'bg-[#352f2c] text-[#f5f2eb]' : 'text-[#8c8279]'
              }`}
            >
              Все
            </button>
            <button
              onClick={() => setSelectedFormat('offline')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                selectedFormat === 'offline' ? 'bg-[#352f2c] text-[#f5f2eb]' : 'text-[#8c8279]'
              }`}
            >
              Офлайн
            </button>
            <button
              onClick={() => setSelectedFormat('online')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                selectedFormat === 'online' ? 'bg-[#352f2c] text-[#f5f2eb]' : 'text-[#8c8279]'
              }`}
            >
              Онлайн
            </button>
          </div>

          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8c8279]" />
            <input
              type="text"
              placeholder={t('actionSearch')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#191615] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
            />
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-3">
          <FilterX className="w-10 h-10 text-[#8c8279] mx-auto opacity-40" />
          <h3 className="font-display text-base font-bold text-[#f5f2eb]">
            Мероприятий не найдено
          </h3>
          <p className="text-xs text-[#9e948c] max-w-sm mx-auto">
            По выбранному фильтру или запросу события отсутствуют. Попробуйте сбросить фильтры.
          </p>
          <button
            onClick={resetFilters}
            className="px-4 py-2 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] text-xs font-semibold text-[#dfcfb3] border border-[#483f3a] transition-colors"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        /* Events Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredEvents.map(event => {
            const isRegistered = event.registeredUserIds.includes(currentUser.id);
            const hasAttended = event.attendedUserIds.includes(currentUser.id);
            const seatsLeft = Math.max(0, event.maxCapacity - event.registeredUserIds.length);
            const directionMeta = COMMUNITY_DIRECTIONS.find(d => d.id === event.direction);

            return (
              <div
                key={event.id}
                className="rounded-2xl bg-[#23201e] border border-[#352f2c] hover:border-[#4d443f] overflow-hidden flex flex-col justify-between transition-all shadow-md group"
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Meta Header */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#dfcfb3]">
                      {directionMeta
                        ? language === 'kz' ? directionMeta.shortNameKz : language === 'en' ? directionMeta.shortNameEn : directionMeta.shortNameRu
                        : event.direction}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#2d2825] text-[#b0a79d] border border-[#3f3834]">
                      {event.format === 'offline' ? 'Офлайн' : 'Онлайн эфир'}
                    </span>
                  </div>

                  {/* Event Title */}
                  <h3
                    onClick={() => setActiveModalEvent(event)}
                    className="font-display text-base font-bold text-[#f5f2eb] group-hover:text-[#dfcfb3] cursor-pointer transition-colors leading-snug"
                  >
                    {event.title}
                  </h3>

                  {/* Short Description */}
                  <p className="text-xs text-[#a39b94] line-clamp-3 leading-relaxed">
                    {event.description}
                  </p>

                  {/* Logistics */}
                  <div className="pt-2 space-y-1.5 text-xs text-[#9e948c] border-t border-[#302a28]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                      <span className="truncate">{event.date} в {event.time} ({event.durationMinutes} мин)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                      <span className="truncate">{event.locationAddress}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0" />
                      <span className="truncate">
                        Записано {event.registeredUserIds.length} из {event.maxCapacity} ({seatsLeft > 0 ? `осталось ${seatsLeft}` : 'мест нет'})
                      </span>
                    </div>
                  </div>

                  {/* Required Materials Preview */}
                  {event.requiredMaterials && event.requiredMaterials.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] text-[11px] space-y-1">
                      <span className="font-semibold text-[#dfcfb3] block">
                        {t('eventMaterials')}:
                      </span>
                      <ul className="list-disc list-inside text-[#9e948c] space-y-0.5">
                        {event.requiredMaterials.slice(0, 2).map((mat, i) => (
                          <li key={i} className="truncate">{mat}</li>
                        ))}
                        {event.requiredMaterials.length > 2 && (
                          <li className="text-[10px] text-[#736a62]">
                            и еще {event.requiredMaterials.length - 2} пункта...
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 sm:p-4 bg-[#1e1b1a] border-t border-[#302a28] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      onClick={() => exportEventToIcs(event)}
                      className="p-1.5 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3d3632] text-[#dfcfb3] transition-colors"
                      title={t('actionExportCalendar')}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setActiveModalEvent(event)}
                      className="text-xs text-[#a39b94] hover:text-[#f5f2eb] underline underline-offset-4"
                    >
                      Подробнее
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {hasAttended && !event.feedbacks.some(f => f.userId === currentUser.id) && (
                      <button
                        onClick={() => setShowFeedbackModal(event)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] text-[11px] font-medium text-[#dfcfb3] border border-[#483f3a]"
                      >
                        Отзыв
                      </button>
                    )}

                    {isRegistered ? (
                      <button
                        onClick={() => cancelEventRegistration(event.id)}
                        className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] text-xs font-medium text-[#dfcfb3] border border-[#483f3a] transition-colors"
                      >
                        {t('actionRegistered')} (отмена)
                      </button>
                    ) : (
                      <button
                        onClick={() => registerForEvent(event.id)}
                        disabled={seatsLeft === 0}
                        className="px-3 sm:px-4 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 text-xs font-semibold text-[#1e1b1a] transition-all"
                      >
                        {seatsLeft > 0 ? t('actionRegister') : t('eventFull')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Details Modal */}
      {activeModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 sm:space-y-5">
            <button
              onClick={() => setActiveModalEvent(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#dfcfb3] font-semibold">
                {activeModalEvent.direction.toUpperCase()} · {activeModalEvent.format === 'offline' ? 'Офлайн' : 'Онлайн'}
              </span>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#f5f2eb] mt-1 pr-6">
                {activeModalEvent.title}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-[#b0a79d] leading-relaxed">
              {activeModalEvent.description}
            </p>

            {/* Date & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3 rounded-xl bg-[#1c1918] border border-[#302a28] text-xs">
              <div className="space-y-1">
                <span className="text-[#8c8279] block">Дата и время:</span>
                <span className="text-[#f5f2eb] font-medium font-mono-numbers">
                  {activeModalEvent.date} в {activeModalEvent.time} ({activeModalEvent.durationMinutes} мин)
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[#8c8279] block">Место проведения:</span>
                <span className="text-[#f5f2eb] font-medium">
                  {activeModalEvent.locationAddress}
                </span>
                {activeModalEvent.locationDetails && (
                  <span className="text-[#8c8279] block text-[11px]">
                    {activeModalEvent.locationDetails}
                  </span>
                )}
              </div>
            </div>

            {/* Required Materials Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#dfcfb3]">
                {t('eventMaterials')}:
              </h4>
              <div className="space-y-1.5">
                {activeModalEvent.requiredMaterials.map((mat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#d6cebf]">
                    <Check className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0 mt-0.5" />
                    <span>{mat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Speaker Information */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1918] border border-[#302a28]">
              <img
                src={activeModalEvent.speaker.avatar}
                alt=""
                className="w-10 h-10 rounded-full object-cover ring-1 ring-[#dfcfb3] shrink-0"
              />
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#f5f2eb] block truncate">
                  {activeModalEvent.speaker.name}
                </span>
                <span className="text-[11px] text-[#dfcfb3] block truncate">
                  {activeModalEvent.speaker.role}
                </span>
              </div>
            </div>

            {/* Reviews Section */}
            {activeModalEvent.feedbacks.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#302a28]">
                <h4 className="text-xs font-semibold text-[#f5f2eb]">
                  {t('eventFeedbackTitle')} ({activeModalEvent.feedbacks.length}):
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {activeModalEvent.feedbacks.map(fb => (
                    <div key={fb.id} className="p-2.5 rounded-lg bg-[#1c1918] text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#f5f2eb]">{fb.userName}</span>
                        <div className="flex items-center gap-1 text-amber-400">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="text-[10px]">{fb.satisfactionRating}/5</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#a39b94]">{fb.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#302a28]">
              <button
                onClick={() => exportEventToIcs(activeModalEvent)}
                className="px-3 py-2 rounded-lg bg-[#272321] hover:bg-[#322c29] text-xs font-medium text-[#dfcfb3] border border-[#3d3632] flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('actionExportCalendar')}</span>
                <span className="sm:hidden">.ICS</span>
              </button>

              <button
                onClick={() => {
                  if (activeModalEvent.registeredUserIds.includes(currentUser.id)) {
                    cancelEventRegistration(activeModalEvent.id);
                  } else {
                    registerForEvent(activeModalEvent.id);
                  }
                  setActiveModalEvent(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
              >
                {activeModalEvent.registeredUserIds.includes(currentUser.id)
                  ? t('actionCancelRegistration')
                  : t('actionRegister')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowFeedbackModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
              {t('actionLeaveFeedback')}
            </h3>
            <p className="text-xs text-[#a39b94]">
              Оцените встречу «{showFeedbackModal.title}». За честную обратную связь вы получите +30 XP и +20 коинов!
            </p>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[#d6cebf] block mb-1">
                  {t('eventSatisfaction')} (1-5):
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(score => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setSatisfactionScore(score)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                        satisfactionScore === score
                          ? 'bg-[#dfcfb3] text-[#1e1b1a]'
                          : 'bg-[#1c1918] text-[#8c8279] hover:bg-[#282321]'
                      }`}
                    >
                      {score}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#d6cebf] block mb-1">
                  {t('eventUsefulness')} (1-5):
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(score => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setUsefulnessScore(score)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-colors ${
                        usefulnessScore === score
                          ? 'bg-[#dfcfb3] text-[#1e1b1a]'
                          : 'bg-[#1c1918] text-[#8c8279] hover:bg-[#282321]'
                      }`}
                    >
                      {score}★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[#d6cebf] block mb-1">
                  Ваш отзыв и инсайты:
                </label>
                <textarea
                  rows={3}
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  placeholder="Что запомнилось больше всего? Что можно улучшить?"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(null)}
                  className="px-3 py-1.5 text-xs text-[#8c8279] hover:text-[#f5f2eb]"
                >
                  {t('actionClose')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                >
                  {t('actionSend')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Event Modal (Admin/Staff) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
              {t('actionCreateEvent')}
            </h3>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Название события *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Например: Книжный вечер: Стефано Манкузо"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Направление</label>
                  <select
                    value={newDirection}
                    onChange={e => setNewDirection(e.target.value as DirectionId)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                  >
                    {COMMUNITY_DIRECTIONS.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.nameRu}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Формат</label>
                  <select
                    value={newFormat}
                    onChange={e => setNewFormat(e.target.value as 'offline' | 'online')}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                  >
                    <option value="offline">Офлайн</option>
                    <option value="online">Онлайн</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Дата</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Время</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">Лимит мест</label>
                  <input
                    type="number"
                    min={5}
                    max={100}
                    value={newCapacity}
                    onChange={e => setNewCapacity(Number(e.target.value))}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">Адрес / Ссылка</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">Описание</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Что будет на встрече, о чем поговорим..."
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Необходимые материалы (каждый пункт с новой строки)
                </label>
                <textarea
                  rows={2}
                  value={newMaterials}
                  onChange={e => setNewMaterials(e.target.value)}
                  placeholder="Книга первого тома&#10;Блокнот для записей&#10;Удобная форма"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#302a28]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-[#8c8279] hover:text-[#f5f2eb]"
                >
                  {t('actionClose')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                >
                  Опубликовать и оповестить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
