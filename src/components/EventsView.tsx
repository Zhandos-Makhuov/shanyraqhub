import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { COMMUNITY_DIRECTIONS, activeDirections, eventImage } from '../data/directions';
import { hasRole } from '../utils/permissions';
import { isDemoData } from '../config/runtime';
import { exportEventToIcs } from '../utils/calendar';
import { formatEventDay, getEventStart, hasEventEnded, hasEventStarted } from '../utils/eventTime';
import { EVENTS_INTENT_EVENT, takeEventsIntent } from '../utils/navIntent';
import { eventLink } from '../utils/deepLink';
import { EventCard } from './EventCard';
import { MyQrModal } from './CheckInQr';
import { CommunityEvent, DirectionId } from '../types';
import { useDialog } from '../hooks/useDialog';
import { attendedCount, registeredCount } from '../utils/counts';
import { AvatarWithFallback } from './ProfileParts';
import { ConfirmDialog } from './ForumPostTools';
import { toLocalDay } from '../utils/streak';
import {
  Download,
  Plus,
  Search,
  Star,
  Check,
  X,
  FilterX,
  CalendarCheck,
  Link2,
} from 'lucide-react';

/** C-21: how many names the "who signed up" list shows before "and N more". */
const WHO_COMING_LIMIT = 24;

const getEventStartSafe = (date: string, time: string) => getEventStart({ date, time } as CommunityEvent).getTime();

export const EventsView: React.FC = () => {
  const {
    events,
    currentUser,
    registerForEvent,
    cancelEventRegistration,
    submitEventFeedback,
    createEvent,
    updateEvent,
    setEventCancelled,
    allUsers,
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
  // Phase 5: only my events (registered or attended), so a member can find what they signed up for.
  const [onlyMine, setOnlyMine] = useState(!!intent.mine);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModalEvent, setActiveModalEvent] = useState<CommunityEvent | null>(
    () => events.find(e => e.id === intent.openEventId) ?? null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState<CommunityEvent | null>(
    () => events.find(e => e.id === intent.feedbackEventId) ?? null,
  );
  const [qrEvent, setQrEvent] = useState<CommunityEvent | null>(null);
  // The intent was found at mount; later ones (a notification while this page is open) arrive as an event.
  const [eventGone, setEventGone] = useState(() => !!intent.openEventId && !events.some(e => e.id === intent.openEventId));
  const eventsRef = useRef(events);
  eventsRef.current = events;
  React.useEffect(() => {
    const onIntent = () => {
      const next = takeEventsIntent();
      if (next.mine) setOnlyMine(true);
      if (!next.openEventId) return;
      const ev = eventsRef.current.find(e => e.id === next.openEventId);
      setEventGone(!ev);
      setActiveModalEvent(ev ?? null);
    };
    window.addEventListener(EVENTS_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(EVENTS_INTENT_EVENT, onIntent);
  }, []);

  // Feedback form state
  const [satisfactionScore, setSatisfactionScore] = useState(5);
  const [usefulnessScore, setUsefulnessScore] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  // Create event form state
  const [newTitle, setNewTitle] = useState('');
  const [newDirection, setNewDirection] = useState<DirectionId>('books');
  // Tomorrow in club time by default (a fixed date would soon be in the past).
  const tomorrow = () => { const d = new Date(`${toLocalDay()}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
  const [newDate, setNewDate] = useState(tomorrow);
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
  // The same form edits an existing event (organizer of the event or moderator+).
  const [editingEvent, setEditingEvent] = useState<CommunityEvent | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const formBusyRef = useRef(false);
  // Detail window: register / cancel registration / cancel the event
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [confirmCancelEvent, setConfirmCancelEvent] = useState(false);
  const [notice, setNotice] = useState('');
  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);
  // Feedback form
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
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
  // Same rule as RLS events_update: the event's organizer or moderator+.
  const canManage = (ev: CommunityEvent) => hasRole(currentUser.role, 'moderator') || (ev.hostId === currentUser.id && isStaff);
  const openModal = activeModalEvent ? events.find(e => e.id === activeModalEvent.id) ?? activeModalEvent : null;

  // Phase 6 (C-16): copy the event's direct link; the message stays until the window closes or another event opens.
  const [linkCopied, setLinkCopied] = useState('');
  React.useEffect(() => setLinkCopied(''), [activeModalEvent?.id]);
  const copyEventLink = async (ev: CommunityEvent) => {
    const url = eventLink(ev.id);
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(t('evLinkCopied'));
    } catch {
      setLinkCopied(t('evLinkCopyManual').replace('{url}', url)); // no clipboard (e.g. some in-app browsers): show it
    }
  };
  const closeDetail = () => { if (!detailBusy) { setActiveModalEvent(null); setDetailError(''); } };
  const detailRef = useDialog<HTMLDivElement>(!!openModal && !confirmCancelEvent && !showCreateModal, closeDetail);
  const closeFeedback = () => { if (!feedbackBusy) setShowFeedbackModal(null); };
  const feedbackRef = useDialog<HTMLDivElement>(!!showFeedbackModal, closeFeedback);
  const closeForm = () => { if (!formBusyRef.current) { setShowCreateModal(false); setEditingEvent(null); } };
  const formRef = useDialog<HTMLDivElement>(showCreateModal, closeForm);

  const openCreate = () => {
    setEditingEvent(null); setFormError('');
    if (getEventStartSafe(newDate, newTime) <= Date.now()) setNewDate(tomorrow());
    setShowCreateModal(true);
  };
  const openEdit = (ev: CommunityEvent) => {
    setEditingEvent(ev); setFormError('');
    setNewTitle(ev.title); setNewDirection(ev.direction); setNewDate(ev.date); setNewTime(ev.time);
    setNewDuration(ev.durationMinutes); setNewFormat(ev.format); setNewAddress(ev.locationAddress);
    setNewDescription(ev.description); setNewMaterials(realMaterials(ev).join('\n')); setNewCapacity(ev.maxCapacity);
    setShowCreateModal(true);
  };

  const registerOrCancel = async (ev: CommunityEvent) => {
    if (detailBusy) return;
    setDetailBusy(true); setDetailError('');
    const mine = ev.registeredUserIds.includes(currentUser.id);
    const r = mine ? await cancelEventRegistration(ev.id) : await registerForEvent(ev.id);
    setDetailBusy(false);
    if (!r.ok) { setDetailError(t(r.error || 'authErrorGeneric')); return; }
    setActiveModalEvent(null);
    setNotice(mine ? t('evRegCancelledDone') : t('evRegisteredDone').replace('{title}', ev.title));
  };

  const toggleEventCancelled = async (ev: CommunityEvent, cancelled: boolean) => {
    setDetailBusy(true); setDetailError('');
    const r = await setEventCancelled(ev.id, cancelled);
    setDetailBusy(false);
    setConfirmCancelEvent(false);
    if (!r.ok) { setDetailError(t(r.error || 'authErrorGeneric')); return; }
    setNotice(cancelled ? t('evCancelledDone').replace('{title}', ev.title) : t('evRestoredDone').replace('{title}', ev.title));
  };

  const isMine = (e: CommunityEvent) => e.registeredUserIds.includes(currentUser.id) || e.attendedUserIds.includes(currentUser.id);
  const filteredEvents = events.filter(e => {
    if (onlyMine && !isMine(e)) return false;
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

  const hasActiveFilters = onlyMine || selectedDirection !== 'all' || selectedFormat !== 'all' || searchQuery.trim() !== '';
  // Upcoming first (soonest on top), then past events (latest on top).
  const byStart = (a: CommunityEvent, b: CommunityEvent) => getEventStart(a).getTime() - getEventStart(b).getTime();
  const upcomingList = filteredEvents.filter(e => !hasEventEnded(e)).sort(byStart);
  const pastList = filteredEvents.filter(e => hasEventEnded(e)).sort((a, b) => byStart(b, a));

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFeedbackModal || feedbackBusy) return;
    setFeedbackBusy(true); setFeedbackError('');
    const r = await submitEventFeedback(showFeedbackModal.id, satisfactionScore, usefulnessScore, feedbackComment.trim());
    setFeedbackBusy(false);
    if (!r.ok) { setFeedbackError(t(r.error || 'authErrorGeneric')); return; }
    setShowFeedbackModal(null);
    setFeedbackComment('');
    setNotice(t('evFeedbackDone'));
  };

  // Create or edit: the window closes only when the server accepted it; otherwise the error stays inside with the data.
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formBusyRef.current || !newTitle.trim()) return;
    const materialsArray = newMaterials.split('\n').map(m => m.trim()).filter(Boolean);
    formBusyRef.current = true;
    setFormBusy(true); setFormError('');
    const r = editingEvent
      ? await updateEvent(editingEvent.id, {
          title: newTitle.trim(),
          description: newDescription.trim(),
          date: newDate,
          time: newTime,
          durationMinutes: Number(newDuration),
          format: newFormat,
          locationAddress: newAddress.trim(),
          maxCapacity: Number(newCapacity),
          requiredMaterials: materialsArray,
        })
      : await createEvent({
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
    formBusyRef.current = false;
    setFormBusy(false);
    if (!r.ok) { setFormError(t(r.error || 'authErrorGeneric')); return; }
    setNotice(editingEvent ? t('evUpdatedDone').replace('{title}', newTitle.trim()) : t('evCreatedDone').replace('{title}', newTitle.trim()));
    setNewCoverFile(null);
    setShowCreateModal(false);
    setEditingEvent(null);
    setNewTitle('');
    setNewDescription('');
    setNewMaterials('');
  };

  const resetFilters = () => {
    setOnlyMine(false);
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
            onClick={openCreate}
            className="btn-primary self-start sm:self-auto shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('actionCreateEvent')}</span>
          </button>
        )}
      </div>

      {eventGone && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200" data-event-not-found>
          <span className="flex-1">{t('evNotFound')}</span>
          <button type="button" onClick={() => setEventGone(false)} aria-label={t('actionClose')} className="shrink-0 -my-1 w-10 h-10 inline-flex items-center justify-center rounded-lg">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {notice && (
        <div role="status" className="flex items-center gap-2 p-3 rounded-xl border bg-emerald-950/30 border-emerald-900/60 text-[13px] text-emerald-200" data-events-notice>
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
        </div>
      )}

      {/* Filters: directions (scrolling chips), format and search; active filters can be reset in one tap. */}
      <div className="space-y-2.5">
        <div className="-mx-3 sm:mx-0 px-3 sm:px-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setOnlyMine(v => !v)}
            className={`chip gap-1.5 shrink-0 ${onlyMine ? 'chip-active' : ''}`}
            aria-pressed={onlyMine}
            data-events-mine
          >
            <CalendarCheck className="w-3.5 h-3.5" aria-hidden="true" />
            {t('evMineFilter')}
          </button>
          <span aria-hidden="true" className="w-px h-5 bg-[#3b3430] shrink-0" />
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
          <div className="flex items-center bg-[#23201e] rounded-xl p-1 border border-[#352f2c] shrink-0" role="group" aria-label={t('evFormFormat')}>
            {(['all', 'offline', 'online'] as const).map(f => (
              <button
                key={f}
                onClick={() => setSelectedFormat(f)}
                aria-pressed={selectedFormat === f}
                className={`min-h-9 px-2.5 sm:px-3 text-xs font-medium rounded-lg transition-colors ${
                  selectedFormat === f ? 'bg-[#3a3330] text-[#f5f2eb]' : 'text-[#9e948c] hover:text-[#d6cebf]'
                }`}
              >
                {f === 'all' ? t('evFormatAll') : f === 'offline' ? t('evOffline') : t('evOnline')}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-0 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9e948c] pointer-events-none" />
            <input
              type="search"
              aria-label={t('evSearchLabel')}
              placeholder={t('actionSearch')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-h-10 pl-9 pr-3 rounded-xl bg-[#23201e] border border-[#352f2c] text-sm text-[#f5f2eb] placeholder-[#9e948c] focus:outline-none focus:border-[#dfcfb3]/70"
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
          <div className="flex items-center justify-between text-xs text-[#9e948c]">
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
          <FilterX className="w-10 h-10 text-[#9e948c] mx-auto opacity-40" />
          <h3 className="font-display text-base font-bold text-[#f5f2eb]">
            {t('evEmptyTitle')}
          </h3>
          <p className="text-xs text-[#9e948c] max-w-sm mx-auto">
            {onlyMine && selectedDirection === 'all' && selectedFormat === 'all' && !searchQuery.trim() ? t('evMineEmpty') : t('evEmptyText')}
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
                <span className="text-xs font-mono-numbers font-normal text-[#9e948c]">{group.list.length}</span>
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

      {/* Event Details Modal: useDialog (focus inside, Escape, focus back); close and actions stay, the middle scrolls */}
      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 sm:px-4 bg-black/75 backdrop-blur-sm animate-fade-in"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          onClick={e => e.target === e.currentTarget && closeDetail()}
        >
          <div
            ref={detailRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-detail-title"
            tabIndex={-1}
            data-event-dialog
            className="relative w-full max-w-xl max-h-full sm:max-h-[90dvh] flex flex-col overflow-hidden bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <button
              onClick={closeDetail}
              aria-label={t('actionClose')}
              className="absolute top-3 right-3 z-10 flex items-center justify-center w-10 h-10 rounded-xl text-[#e6dfd3] hover:text-white bg-black/55 backdrop-blur-sm"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <div tabIndex={0} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 sm:space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#dfcfb3]/60">
            <div className="-mx-5 sm:-mx-6 -mt-5 sm:-mt-6 relative">
              <img src={eventImage(openModal)} alt="" className={`w-full h-44 sm:h-52 object-cover rounded-t-2xl ${openModal.status === 'cancelled' ? 'grayscale' : ''}`} />
              {canEditCover(openModal) && (
                <div className="absolute bottom-2 left-3 flex gap-1.5">
                  <label className={`px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] font-semibold text-[#f5f2eb] cursor-pointer focus-within:ring-2 focus-within:ring-[#dfcfb3] ${coverBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                    {coverBusy ? t('liveAvatarUploading') : t('evCoverChange')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                           onChange={e => { const f = e.target.files?.[0]; if (f) void changeCover(openModal, f); }} />
                  </label>
                  {openModal.coverUrl && !coverBusy && (
                    <button onClick={() => void changeCover(openModal, null)}
                            className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] text-[#d6cebf]">
                      {t('evCoverReset')}
                    </button>
                  )}
                </div>
              )}
            </div>
            {openModal.status === 'cancelled' && (
              <p role="note" className="p-3 rounded-xl bg-red-950/40 border border-red-900/60 text-[13px] text-red-200" data-event-cancelled-note>
                {t('evCancelledNote')}
              </p>
            )}
            <div>
              <span className="text-[11px] uppercase tracking-wider text-[#dfcfb3] font-semibold">
                {ln(COMMUNITY_DIRECTIONS.find(d => d.id === openModal.direction)) || openModal.direction} · {openModal.format === 'offline' ? t('evOffline') : t('evOnline')}
              </span>
              <h2 id="event-detail-title" className="font-display text-lg sm:text-xl font-bold text-[#f5f2eb] mt-1 pr-6 break-words [overflow-wrap:anywhere]">
                {openModal.title}
              </h2>
            </div>

            <p className="text-xs sm:text-sm text-[#b0a79d] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
              {openModal.description}
            </p>

            {/* Date & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 p-3 rounded-xl bg-[#1c1918] border border-[#302a28] text-xs">
              <div className="space-y-1">
                <span className="text-[#9e948c] block">{t('evDateTime')}:</span>
                <span className="text-[#f5f2eb] font-medium">
                  {formatEventDay(openModal, t)} · {openModal.time}
                  <span className="text-[#9e948c] font-normal"> · {openModal.durationMinutes} {t('evMin')}</span>
                </span>
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-[#9e948c] block">{t('evPlace')}:</span>
                <span className="text-[#f5f2eb] font-medium break-words [overflow-wrap:anywhere]">
                  {openModal.locationAddress}
                </span>
                {openModal.locationDetails && (
                  <span className="text-[#9e948c] block text-[11px]">
                    {openModal.locationDetails}
                  </span>
                )}
              </div>
            </div>

            {/* Required Materials Checklist */}
            {realMaterials(openModal).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#dfcfb3]">
                {t('eventMaterials')}:
              </h3>
              <ul className="space-y-1.5">
                {realMaterials(openModal).map((mat, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#d6cebf]">
                    <Check className="w-3.5 h-3.5 text-[#dfcfb3] shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{mat}</span>
                  </li>
                ))}
              </ul>
            </div>
            )}

            {/* Speaker Information */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#1c1918] border border-[#302a28]">
              <AvatarWithFallback src={openModal.speaker.avatar} name={openModal.speaker.name || '—'} className="w-10 h-10 ring-1 ring-[#dfcfb3] shrink-0" textClassName="text-xs" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#f5f2eb] block truncate">
                  {openModal.speaker.name}
                </span>
                <span className="text-[11px] text-[#dfcfb3] block truncate">
                  {['Ведущий Shanyraq Hub', 'Shanyraq Hub жүргізушісі', 'Shanyraq Hub host'].includes(openModal.speaker.role) ? t('evHostRole') : openModal.speaker.role}
                </span>
              </div>
            </div>

            {/* C-21 (Phase 4): every member sees who signed up (names only; who came stays with the organizer) */}
            {!canManage(openModal) && openModal.status !== 'cancelled' && openModal.registeredUserIds.length > 0 && (() => {
              const shown = openModal.registeredUserIds.slice(0, WHO_COMING_LIMIT);
              const rest = openModal.registeredUserIds.length - shown.length;
              return (
                <div className="space-y-2" data-event-who-coming>
                  <h3 className="text-xs font-semibold text-[#dfcfb3]">
                    {t('evWhoComing').replace('{n}', String(openModal.registeredUserIds.length))}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {shown.map(id => {
                      const u = allUsers.find(x => x.id === id);
                      const me = id === currentUser.id;
                      return (
                        <li key={id} className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 min-h-8 rounded-full border text-[12px] ${me ? 'border-[#dfcfb3]/60 bg-[#2a2522] text-[#f5f2eb]' : 'border-[#302a28] bg-[#23201e] text-[#d6cebf]'}`}>
                          <AvatarWithFallback src={u?.avatar} name={u?.name ?? '—'} className="w-6 h-6" textClassName="text-[9px]" />
                          <span className="max-w-[10rem] truncate">{u?.name ?? '—'}</span>
                        </li>
                      );
                    })}
                    {rest > 0 && (
                      <li className="inline-flex items-center px-2.5 min-h-8 rounded-full border border-[#302a28] text-[12px] text-[#9e948c]">
                        {t('evWhoComingMore').replace('{n}', String(rest))}
                      </li>
                    )}
                  </ul>
                </div>
              );
            })()}

            {/* Organizer tools (organizer of this event or moderator+): who signed up, edit, cancel / restore */}
            {canManage(openModal) && (
              <div className="space-y-3 p-3 rounded-xl border border-[#4a413b] bg-[#1c1918]" data-event-manage>
                <h3 className="text-xs font-semibold text-[#dfcfb3]">{t('evManageTitle')}</h3>
                <div>
                  <p className="text-[12px] text-[#d6cebf] mb-1.5">
                    {t('evRegisteredList').replace('{n}', String(registeredCount(openModal))).replace('{max}', String(openModal.maxCapacity))}
                    {attendedCount(openModal) > 0 && <> · {t('evAttendedCount').replace('{n}', String(attendedCount(openModal)))}</>}
                  </p>
                  {registeredCount(openModal) === 0 ? (
                    <p className="text-[12px] text-[#9e948c]">{t('evNoRegistrations')}</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5" data-event-registrants>
                      {openModal.registeredUserIds.map(id => {
                        const u = allUsers.find(x => x.id === id);
                        const came = openModal.attendedUserIds.includes(id);
                        return (
                          <li key={id} className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 min-h-8 rounded-full border text-[12px] ${came ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-[#302a28] bg-[#23201e] text-[#d6cebf]'}`}>
                            <AvatarWithFallback src={u?.avatar} name={u?.name ?? '—'} className="w-6 h-6" textClassName="text-[9px]" />
                            <span className="max-w-[10rem] truncate">{u?.name ?? '—'}</span>
                            {came && <span className="sr-only">— {t('prfAttended')}</span>}
                            {came && <Check className="w-3 h-3" aria-hidden="true" />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {!hasEventEnded(openModal) && (
                  <div className="flex flex-wrap gap-2">
                    {openModal.status !== 'cancelled' && (
                      <button type="button" onClick={() => openEdit(openModal)} disabled={detailBusy} className="btn-secondary min-h-10 px-3 text-xs" data-event-edit>
                        {t('evEdit')}
                      </button>
                    )}
                    {openModal.status === 'cancelled' ? (
                      <button type="button" onClick={() => void toggleEventCancelled(openModal, false)} disabled={detailBusy} className="btn-secondary min-h-10 px-3 text-xs" data-event-restore>
                        {t('evRestore')}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setConfirmCancelEvent(true)} disabled={detailBusy}
                              className="min-h-10 px-3 rounded-xl text-xs font-semibold text-red-300 border border-red-900/60 hover:bg-red-950/40" data-event-cancel>
                        {t('evCancelEvent')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reviews Section */}
            {openModal.feedbacks.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#302a28]">
                <h3 className="text-xs font-semibold text-[#f5f2eb]">
                  {t('eventFeedbackTitle')} ({openModal.feedbacks.length}):
                </h3>
                <div className="space-y-2">
                  {openModal.feedbacks.map(fb => (
                    <div key={fb.id} className="p-2.5 rounded-lg bg-[#1c1918] text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#f5f2eb] truncate">{fb.userName}</span>
                        <div className="flex items-center gap-1 text-amber-400 shrink-0">
                          <Star className="w-3 h-3 fill-current" aria-hidden="true" />
                          <span className="text-[10px]">{fb.satisfactionRating}/5</span>
                        </div>
                      </div>
                      {fb.comment && <p className="text-[11px] text-[#a39b94] whitespace-pre-line break-words">{fb.comment}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            </div>

            {/* Modal Bottom Actions: always visible */}
            <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-[#302a28] bg-[#201d1c] space-y-2">
              {detailError && (
                <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-event-error>
                  {detailError}
                </p>
              )}
              {linkCopied && (
                <p role="status" className="text-[12px] text-emerald-300 break-all" data-link-copied>{linkCopied}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => exportEventToIcs(openModal)}
                  className="btn-ghost px-3 text-[#dfcfb3]"
                  aria-label={t('actionExportCalendar')}
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('actionExportCalendar')}</span>
                  <span className="sm:hidden" aria-hidden="true">.ICS</span>
                </button>
                {/* Phase 6 (C-16): a direct link to this event (opens after sign-in; access is still checked by the server) */}
                <button
                  onClick={() => void copyEventLink(openModal)}
                  className="btn-ghost px-3 text-[#dfcfb3]"
                  aria-label={t('evCopyLink')}
                  title={t('evCopyLink')}
                  data-event-copy-link
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('evCopyLinkShort')}</span>
                </button>
                </div>

                <button
                  onClick={() => void registerOrCancel(openModal)}
                  disabled={
                    detailBusy ||
                    openModal.status === 'cancelled' ||
                    hasEventStarted(openModal) ||
                    (!openModal.registeredUserIds.includes(currentUser.id) &&
                      registeredCount(openModal) >= openModal.maxCapacity)
                  }
                  aria-busy={detailBusy}
                  className="btn-primary min-w-0 flex-1 sm:flex-none disabled:opacity-60"
                  data-event-register
                >
                  {detailBusy
                    ? t('evWorking')
                    : openModal.status === 'cancelled'
                      ? t('evStatusCancelled')
                      : hasEventStarted(openModal)
                        ? t('registrationClosed')
                        : openModal.registeredUserIds.includes(currentUser.id)
                          ? t('evCancelRegistration')
                          : registeredCount(openModal) >= openModal.maxCapacity
                            ? t('eventFull')
                            : t('actionRegister')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openModal && (
        <ConfirmDialog
          open={confirmCancelEvent}
          title={t('evCancelEventQ')}
          text={t('evCancelEventText').replace('{title}', openModal.title).replace('{n}', String(registeredCount(openModal)))}
          confirmLabel={t('evCancelEvent')}
          busyLabel={t('evWorking')}
          cancelLabel={t('evKeepEvent')}
          busy={detailBusy}
          onConfirm={() => void toggleEventCancelled(openModal, true)}
          onCancel={() => setConfirmCancelEvent(false)}
        />
      )}

      {/* Leave Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            ref={feedbackRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            tabIndex={-1}
            data-feedback-dialog
            className="relative w-full max-w-md bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto outline-none"
          >
            <button
              onClick={closeFeedback}
              aria-label={t('actionClose')}
              className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <h3 id="feedback-title" className="font-display text-base sm:text-lg font-bold text-[#f5f2eb] pr-10">
              {t('actionLeaveFeedback')}
            </h3>
            <p className="text-xs text-[#a39b94]">
              {t('evRateIntro')} «{showFeedbackModal.title}». {t('evRateReward')}
            </p>

            <form onSubmit={handleFeedbackSubmit} className="space-y-4">
              {([
                ['fb-satisfaction', t('eventSatisfaction'), satisfactionScore, setSatisfactionScore],
                ['fb-usefulness', t('eventUsefulness'), usefulnessScore, setUsefulnessScore],
              ] as const).map(([id, label, value, set]) => (
                <div key={id}>
                  <span id={id} className="text-xs font-medium text-[#d6cebf] block mb-1">{label} (1-5):</span>
                  <div className="flex gap-2" role="radiogroup" aria-labelledby={id}>
                    {[1, 2, 3, 4, 5].map(score => (
                      <button
                        key={score}
                        type="button"
                        role="radio"
                        aria-checked={value === score}
                        aria-label={`${score}/5`}
                        onClick={() => set(score)}
                        className={`flex-1 min-h-10 rounded-lg text-xs font-mono font-bold transition-colors ${
                          value === score ? 'bg-[#dfcfb3] text-[#1e1b1a]' : 'bg-[#1c1918] text-[#9e948c] hover:bg-[#282321]'
                        }`}
                      >
                        {score}★
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <label htmlFor="fb-comment" className="text-xs font-medium text-[#d6cebf] block mb-1">
                  {t('evYourFeedback')}:
                </label>
                <textarea
                  id="fb-comment"
                  rows={3}
                  maxLength={2000}
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  placeholder={t('evFeedbackPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder-[#9e948c] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              {feedbackError && (
                <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-feedback-error>
                  {feedbackError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeFeedback} disabled={feedbackBusy} className="btn-ghost min-h-10 px-3 text-xs">
                  {t('actionClose')}
                </button>
                <button type="submit" disabled={feedbackBusy} className="btn-primary min-h-10 px-4 text-xs disabled:opacity-60">
                  {feedbackBusy ? t('evWorking') : t('actionSend')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Event (organizer+; edit — the event's organizer or moderator+) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            ref={formRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-form-title"
            tabIndex={-1}
            data-event-form
            className="relative w-full max-w-lg max-h-[92dvh] flex flex-col bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-[#302a28]">
              <h3 id="event-form-title" className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
                {editingEvent ? t('evEditTitle') : t('actionCreateEvent')}
              </h3>
              <button
                onClick={closeForm}
                aria-label={t('actionClose')}
                className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-3">
              {editingEvent && registeredCount(editingEvent) > 0 && (
                <p role="note" className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-900/60 text-[12px] text-amber-200" data-event-edit-warning>
                  {t('evEditWarning').replace('{n}', String(registeredCount(editingEvent)))}
                </p>
              )}
              <div>
                <label htmlFor="ev-title" className="font-medium text-[#d6cebf] block mb-1">
                  {t('evFormTitle')} *
                </label>
                <input
                  id="ev-title"
                  type="text"
                  required
                  minLength={3}
                  maxLength={200}
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder={t('evFormTitlePlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ev-direction" className="font-medium text-[#d6cebf] block mb-1">{t('evFormDirection')}</label>
                  <select
                    id="ev-direction"
                    value={newDirection}
                    disabled={!!editingEvent}
                    onChange={e => setNewDirection(e.target.value as DirectionId)}
                    className="w-full p-2.5 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none disabled:opacity-60"
                  >
                    {(editingEvent ? COMMUNITY_DIRECTIONS : activeDirections()).map(d => (
                      <option key={d.id} value={d.id}>
                        {ln(d)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ev-format" className="font-medium text-[#d6cebf] block mb-1">{t('evFormFormat')}</label>
                  <select
                    id="ev-format"
                    value={newFormat}
                    onChange={e => setNewFormat(e.target.value as 'offline' | 'online')}
                    className="w-full p-2.5 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none"
                  >
                    <option value="offline">{t('evOffline')}</option>
                    <option value="online">{t('evOnline')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="ev-date" className="font-medium text-[#d6cebf] block mb-1">{t('evFormDate')}</label>
                  <input
                    id="ev-date"
                    type="date"
                    required
                    min={toLocalDay()}
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    className="w-full p-2 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label htmlFor="ev-time" className="font-medium text-[#d6cebf] block mb-1">{t('evFormTime')}</label>
                  <input
                    id="ev-time"
                    type="time"
                    required
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="w-full p-2 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div>
                  <label htmlFor="ev-duration" className="font-medium text-[#d6cebf] block mb-1">{t('evFormDuration')}</label>
                  <input
                    id="ev-duration"
                    type="number"
                    min={15}
                    max={1440}
                    step={15}
                    value={newDuration}
                    onChange={e => setNewDuration(Number(e.target.value))}
                    className="w-full p-2 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="ev-capacity" className="font-medium text-[#d6cebf] block mb-1">{t('evFormCapacity')}</label>
                  <input
                    id="ev-capacity"
                    type="number"
                    min={Math.max(5, editingEvent ? registeredCount(editingEvent) : 0)}
                    max={100}
                    value={newCapacity}
                    onChange={e => setNewCapacity(Number(e.target.value))}
                    className="w-full p-2 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ev-address" className="font-medium text-[#d6cebf] block mb-1">{newFormat === 'online' ? t('evFormLink') : t('evFormAddress')}</label>
                <input
                  id="ev-address"
                  type="text"
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              <div>
                <label htmlFor="ev-description" className="font-medium text-[#d6cebf] block mb-1">{t('evFormDescription')}</label>
                <textarea
                  id="ev-description"
                  rows={3}
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder={t('evFormDescriptionPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>

              {!isDemoData && !editingEvent && (
                <div>
                  <span className="font-medium text-[#d6cebf] block mb-1">{t('evFormCover')}</span>
                  <div className="flex items-center gap-3">
                    <img src={newCoverPreview ?? eventImage({ direction: newDirection })} alt="" className="w-24 h-14 rounded-lg object-cover border border-[#3b3430]" />
                    <div className="flex flex-col gap-1">
                      <label className="px-3 py-1.5 min-h-10 inline-flex items-center rounded-lg bg-[#2e2927] hover:bg-[#3a3330] border border-[#483f3a] text-[#dfcfb3] font-semibold cursor-pointer w-fit focus-within:ring-2 focus-within:ring-[#dfcfb3]">
                        {newCoverFile ? t('libCoverChange') : t('evCoverAdd')}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                               onChange={e => setNewCoverFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <span className="text-[10px] text-[#9e948c]">{t('evCoverHint')}</span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="ev-materials" className="font-medium text-[#d6cebf] block mb-1">
                  {t('evFormMaterials')}
                </label>
                <textarea
                  id="ev-materials"
                  rows={2}
                  value={newMaterials}
                  onChange={e => setNewMaterials(e.target.value)}
                  placeholder={t('evFormMaterialsPlaceholder')}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                />
              </div>
              </div>

              <div className="px-5 sm:px-6 py-3 border-t border-[#302a28] space-y-2 safe-area-pb">
                {formError && (
                  <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-event-form-error>
                    {formError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={closeForm} disabled={formBusy} className="btn-ghost min-h-10 px-3 text-xs">
                    {t('actionClose')}
                  </button>
                  <button type="submit" disabled={formBusy} className="btn-primary min-h-10 px-4 text-xs disabled:opacity-60">
                    {formBusy ? t('evWorking') : editingEvent ? t('evSaveChanges') : t('evPublish')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
