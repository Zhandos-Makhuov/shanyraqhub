import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS, activeDirections, eventImage } from '../data/directions';
import { hasRole } from '../utils/permissions';
import { isDemoData } from '../config/runtime';
import { exportEventToIcs } from '../utils/calendar';
import { getEventStart, hasEventEnded, hasEventStarted } from '../utils/eventTime';
import { takeEventsIntent } from '../utils/navIntent';
import { EventCard } from './EventCard';
import { MyQrModal } from './CheckInQr';
import { CommunityEvent, DirectionId } from '../types';
import {
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
    liveApi,
    runLiveAction,
    language,
    t,
    ln,
  } = useApp();

  // The home page can open this screen with a direction chosen, an event's details or its feedback form.
  const [intent] = useState(takeEventsIntent);
  const [selectedDirection, setSelectedDirection] = useState<string>(intent.direction ?? 'all');
  const [selectedFormat, setSelectedFormat] = useState<'all' | 'offline' | 'online'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalEvent, setActiveModalEvent] = useState<CommunityEvent | null>(
    () => events.find(e => e.id === intent.openEventId) ?? null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<CommunityEvent | null>(
    () => events.find(e => e.id === intent.feedbackEventId) ?? null,
  );
  const [qrEvent, setQrEvent] = useState<CommunityEvent | null>(null);

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
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);
  const newCoverPreview = React.useMemo(() => (newCoverFile ? URL.createObjectURL(newCoverFile) : null), [newCoverFile]);
  const [coverBusy, setCoverBusy] = useState(false);
  // The default "what to bring" filler adds noise: it is not shown (old events may still have it saved).
  const DEFAULT_MATERIALS = ['Хорошее настроение и открытость новому', 'Жақсы көңіл-күй және жаңаға ашықтық', 'A good mood and an open mind'];
  const realMaterials = (ev: CommunityEvent) => (ev.requiredMaterials ?? []).filter(m => !DEFAULT_MATERIALS.includes(m.trim()));
  // Who may change an event's picture: its organizer or a moderator+ (the database checks the same).
  const canEditCover = (ev: CommunityEvent) => !isDemoData && !!liveApi && (hasRole(currentUser.role, 'moderator') || ev.hostId === currentUser.id);
  const changeCover = async (ev: CommunityEvent, file: File | null) => {
    if (!liveApi) return;
    setCoverBusy(true);
    try {
      const r = await runLiveAction(file ? liveApi.uploadEventCover(ev.id, file) : liveApi.clearEventCover(ev.id));
      if (r.ok) setActiveModalEvent(null);
    } finally { setCoverBusy(false); }
  };

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

  const hasActiveFilters = selectedDirection !== 'all' || selectedFormat !== 'all' || searchQuery.trim() !== '';
  // Upcoming first (soonest on top), then past events (latest on top).
  const byStart = (a: CommunityEvent, b: CommunityEvent) => getEventStart(a).getTime() - getEventStart(b).getTime();
  const upcomingList = filteredEvents.filter(e => !hasEventEnded(e)).sort(byStart);
  const pastList = filteredEvents.filter(e => hasEventEnded(e)).sort((a, b) => byStart(b, a));

  const handleFeedbackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFeedbackModal) return;
    submitEventFeedback(
      showFeedbackModal.id,
      satisfactionScore,
      usefulnessScore,
      feedbackComment.trim()
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
      description: newDescription.trim() || t('evDefaultDescription'),
      requiredMaterials: materialsArray,
      maxCapacity: Number(newCapacity),
    }, newCoverFile ?? undefined);
    setNewCoverFile(null);

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
            {t('evSubtitle')}
          </p>
        </div>

        {isStaff && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary self-start sm:self-auto shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('actionCreateEvent')}</span>
          </button>
        )}
      </div>

      {/* Filters: directions (scrolling chips), format and search; active filters can be reset in one tap. */}
      <div className="space-y-2.5">
        <div className="-mx-3 sm:mx-0 px-3 sm:px-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedDirection('all')}
            className={`chip shrink-0 ${selectedDirection === 'all' ? 'chip-active' : ''}`}
            aria-pressed={selectedDirection === 'all'}
          >
            {t('actionFilterAll')}
          </button>
          {activeDirections().map(dir => (
            <button
              key={dir.id}
              onClick={() => setSelectedDirection(dir.id)}
              className={`chip shrink-0 ${selectedDirection === dir.id ? 'chip-active' : ''}`}
              aria-pressed={selectedDirection === dir.id}
            >
              {language === 'kz' ? dir.shortNameKz : language === 'en' ? dir.shortNameEn : dir.shortNameRu}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#23201e] rounded-xl p-1 border border-[#352f2c] shrink-0" role="group">
            {(['all', 'offline', 'online'] as const).map(f => (
              <button
                key={f}
                onClick={() => setSelectedFormat(f)}
                aria-pressed={selectedFormat === f}
                className={`min-h-8 px-2.5 sm:px-3 text-xs font-medium rounded-lg transition-colors ${
                  selectedFormat === f ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#8c8279] hover:text-[#d6cebf]'
                }`}
              >
                {f === 'all' ? t('evFormatAll') : f === 'offline' ? t('evOffline') : t('evOnline')}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8c8279] pointer-events-none" />
            <input
              type="search"
              placeholder={t('actionSearch')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-[#23201e] border border-[#352f2c] text-sm text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]/70"
            />
          </div>

          {hasActiveFilters && (
            <button onClick={resetFilters} className="hidden sm:inline-flex btn-ghost min-h-10 px-3 text-xs shrink-0">
              <FilterX className="w-3.5 h-3.5" />
              {t('evResetShort')}
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs text-[#8c8279]">
            <span>{t('evShown').replace('{n}', String(filteredEvents.length))}</span>
            <button onClick={resetFilters} className="sm:hidden inline-flex items-center gap-1 min-h-8 px-2 text-[#dfcfb3] font-medium">
              <FilterX className="w-3.5 h-3.5" />
              {t('evResetShort')}
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-[#23201e] border border-[#352f2c] space-y-3">
          <FilterX className="w-10 h-10 text-[#8c8279] mx-auto opacity-40" />
          <h3 className="font-display text-base font-bold text-[#f5f2eb]">
            {t('evEmptyTitle')}
          </h3>
          <p className="text-xs text-[#9e948c] max-w-sm mx-auto">
            {t('evEmptyText')}
          </p>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="btn-secondary">
              {t('evResetFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {[
            { key: 'upcoming', title: t('evUpcomingSection'), list: upcomingList },
            { key: 'past', title: t('evPastSection'), list: pastList },
          ].filter(g => g.list.length > 0).map(group => (
            <section key={group.key} className="space-y-3">
              <h2 className="flex items-baseline gap-2 font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
                {group.title}
                <span className="text-xs font-mono-numbers font-normal text-[#8c8279]">{group.list.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.list.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpen={setActiveModalEvent}
                    onQr={setQrEvent}
                    onFeedback={setShowFeedbackModal}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {qrEvent && <MyQrModal event={qrEvent} onClose={() => setQrEvent(null)} />}

      {/* Event Details Modal */}
      {activeModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in" onClick={e => e.target === e.currentTarget && setActiveModalEvent(null)}>
          <div className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 sm:space-y-5">
            <button
              onClick={() => setActiveModalEvent(null)}
              aria-label={t('actionClose')}
              className="absolute top-3 right-3 z-10 flex items-center justify-center w-10 h-10 rounded-xl text-[#e6dfd3] hover:text-white bg-black/55 backdrop-blur-sm"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="-mx-5 sm:-mx-6 -mt-5 sm:-mt-6 relative">
              <img src={eventImage(activeModalEvent)} alt="" className="w-full h-44 sm:h-52 object-cover rounded-t-2xl" />
              {canEditCover(activeModalEvent) && (
                <div className="absolute bottom-2 left-3 flex gap-1.5">
                  <label className={`px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] font-semibold text-[#f5f2eb] cursor-pointer ${coverBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                    {coverBusy ? t('liveAvatarUploading') : t('evCoverChange')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                           onChange={e => { const f = e.target.files?.[0]; if (f) void changeCover(activeModalEvent, f); }} />
                  </label>
                  {activeModalEvent.coverUrl && !coverBusy && (
                    <button onClick={() => void changeCover(activeModalEvent, null)}
                            className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] text-[#d6cebf]">
                      {t('evCoverReset')}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#dfcfb3] font-semibold">
                {ln(COMMUNITY_DIRECTIONS.find(d => d.id === activeModalEvent.direction)) || activeModalEvent.direction} · {activeModalEvent.format === 'offline' ? t('evOffline') : t('evOnline')}
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
                <span className="text-[#8c8279] block">{t('evDateTime')}:</span>
                <span className="text-[#f5f2eb] font-medium font-mono-numbers">
                  {activeModalEvent.date} {t('evAt')} {activeModalEvent.time} ({activeModalEvent.durationMinutes} {t('evMin')})
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[#8c8279] block">{t('evPlace')}:</span>
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
            {realMaterials(activeModalEvent).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#dfcfb3]">
                {t('eventMaterials')}:
              </h4>
              <div className="space-y-1.5">
                {realMaterials(activeModalEvent).map((mat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#d6cebf]">
                    <Check className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0 mt-0.5" />
                    <span>{mat}</span>
                  </div>
                ))}
              </div>
            </div>
            )}

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
                  {['Ведущий Shanyraq Hub', 'Shanyraq Hub жүргізушісі', 'Shanyraq Hub host'].includes(activeModalEvent.speaker.role) ? t('evHostRole') : activeModalEvent.speaker.role}
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
                disabled={
                  hasEventStarted(activeModalEvent) ||
                  (!activeModalEvent.registeredUserIds.includes(currentUser.id) &&
                    activeModalEvent.registeredUserIds.length >= activeModalEvent.maxCapacity)
                }
                className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-[#1e1b1a]"
              >
                {hasEventStarted(activeModalEvent)
                  ? t('registrationClosed')
                  : activeModalEvent.registeredUserIds.includes(currentUser.id)
                    ? t('actionCancelRegistration')
                    : activeModalEvent.registeredUserIds.length >= activeModalEvent.maxCapacity
                      ? t('eventFull')
                      : t('actionRegister')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
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
              {t('evRateIntro')} «{showFeedbackModal.title}». {t('evRateReward')}
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
                  {t('evYourFeedback')}:
                </label>
                <textarea
                  rows={3}
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  placeholder={t('evFeedbackPlaceholder')}
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
                  {t('evFormTitle')} *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder={t('evFormTitlePlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormDirection')}</label>
                  <select
                    value={newDirection}
                    onChange={e => setNewDirection(e.target.value as DirectionId)}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                  >
                    {activeDirections().map(d => (
                      <option key={d.id} value={d.id}>
                        {ln(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormFormat')}</label>
                  <select
                    value={newFormat}
                    onChange={e => setNewFormat(e.target.value as 'offline' | 'online')}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                  >
                    <option value="offline">{t('evOffline')}</option>
                    <option value="online">{t('evOnline')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormDate')}</label>
                  <input
                    type="date"
                    required
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormTime')}</label>
                  <input
                    type="time"
                    required
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormCapacity')}</label>
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
                <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormAddress')}</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormDescription')}</label>
                <textarea
                  rows={2}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder={t('evFormDescriptionPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              {!isDemoData && (
                <div>
                  <label className="font-medium text-[#d6cebf] block mb-1">{t('evFormCover')}</label>
                  <div className="flex items-center gap-3">
                    <img src={newCoverPreview ?? eventImage({ direction: newDirection })} alt="" className="w-24 h-14 rounded-lg object-cover border border-[#3b3430]" />
                    <div className="flex flex-col gap-1">
                      <label className="px-3 py-1.5 rounded-lg bg-[#2e2927] hover:bg-[#3a3330] border border-[#483f3a] text-[#dfcfb3] font-semibold cursor-pointer w-fit">
                        {newCoverFile ? t('libCoverChange') : t('evCoverAdd')}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                               onChange={e => setNewCoverFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <span className="text-[10px] text-[#8c8279]">{t('evCoverHint')}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  {t('evFormMaterials')}
                </label>
                <textarea
                  rows={2}
                  value={newMaterials}
                  onChange={e => setNewMaterials(e.target.value)}
                  placeholder={t('evFormMaterialsPlaceholder')}
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
                  {t('evPublish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
