import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { canAccessRoom } from '../utils/permissions';
import { clubDayTime, formatClubDateTime, formatShortDate } from '../utils/eventTime';
import { FORUM_LIMITS } from '../data/forumCategories';
import { useDialog } from '../hooks/useDialog';
import { AvatarWithFallback, ProfileRoleBadge } from './ProfileParts';
import { MessageSquare, Lock, ShieldCheck, ThumbsUp, Send, Plus, Key, X, ArrowLeft } from 'lucide-react';

/** User text: line breaks and paragraphs kept, long words and links wrap inside the card (never rendered as HTML). */
const USER_TEXT = 'whitespace-pre-line break-words [overflow-wrap:anywhere]';
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#191615]';

export const ForumAndChatsView: React.FC = () => {
  const {
    forumTopics,
    forumCategories,
    createForumTopic,
    replyToForumTopic,
    upvoteReply,
    upvoteTopic,
    chatRooms,
    sendChatMessage,
    currentUser,
    t,
    lf,
    ln,
  } = useApp();

  const [activeSection, setActiveSection] = useState<'forum' | 'encrypted_rooms'>('forum');

  // Pinned topics first; otherwise the existing order (newest first in live).
  const sortedTopics = useMemo(
    () => [...forumTopics].sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned)),
    [forumTopics],
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const activeTopic = sortedTopics.find(tp => tp.id === selectedTopicId) || sortedTopics[0];

  // Only rooms the current role may enter are listed (moderator rooms are hidden from members).
  const visibleRooms = chatRooms.filter(r => canAccessRoom(r, currentUser.role));
  const [selectedRoomId, setSelectedRoomId] = useState<string>(visibleRooms[0]?.id || '');
  const activeRoom = visibleRooms.find(r => r.id === selectedRoomId) || visibleRooms[0];

  const [mobileForumView, setMobileForumView] = useState<'list' | 'thread'>('list');
  const [mobileChatView, setMobileChatView] = useState<'list' | 'chat'>('list');

  // --- Reply composer: the text stays until the server accepted it ---------------------------
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState('');
  useEffect(() => setReplyError(''), [activeTopic?.id]);

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopic || replySending || !replyText.trim()) return;
    setReplySending(true);
    setReplyError('');
    const r = await replyToForumTopic(activeTopic.id, replyText.trim());
    setReplySending(false);
    if (r.ok) setReplyText('');
    else setReplyError(t(r.error || 'authErrorGeneric'));
  };

  // --- Chat composer ------------------------------------------------------------------------
  const [chatMessageText, setChatMessageText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');

  // --- New topic dialog ---------------------------------------------------------------------
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState<string>(forumCategories[0]?.id ?? '');
  const [newTopicContent, setNewTopicContent] = useState('');
  const [topicSending, setTopicSending] = useState(false);
  const [topicError, setTopicError] = useState('');
  const closeCreate = () => {
    if (!topicSending) setShowCreateTopicModal(false);
  };
  const createRef = useDialog<HTMLDivElement>(showCreateTopicModal, closeCreate);
  const openCreate = () => {
    // Keep what was typed before (a failed or cancelled attempt); only make sure the section exists.
    if (!forumCategories.some(c => c.id === newTopicCategory)) setNewTopicCategory(forumCategories[0]?.id ?? '');
    setTopicError('');
    setShowCreateTopicModal(true);
  };
  const titleOk = newTopicTitle.trim().length >= FORUM_LIMITS.titleMin && newTopicTitle.length <= FORUM_LIMITS.titleMax;

  const handleCreateTopicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topicSending || !titleOk || !newTopicContent.trim()) return;
    setTopicSending(true);
    setTopicError('');
    const r = await createForumTopic(newTopicTitle.trim(), newTopicContent.trim(), newTopicCategory);
    setTopicSending(false);
    if (r.ok) {
      setShowCreateTopicModal(false);
      setNewTopicTitle('');
      setNewTopicContent('');
      setSelectedTopicId('');
      setMobileForumView('list');
    } else {
      setTopicError(t(r.error || 'authErrorGeneric'));
    }
  };

  // --- Topic list ↔ thread on narrow screens (focus follows) --------------------------------
  const threadHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastOpenedTopic = useRef<string | null>(null);
  const openTopic = (id: string) => {
    setSelectedTopicId(id);
    lastOpenedTopic.current = id;
    setMobileForumView('thread');
    requestAnimationFrame(() => threadHeadingRef.current?.focus({ preventScroll: false }));
  };
  const backToTopics = () => {
    setMobileForumView('list');
    const id = lastOpenedTopic.current;
    requestAnimationFrame(() => {
      if (id) document.querySelector<HTMLElement>(`[data-topic-card="${id}"]`)?.focus();
    });
  };

  // --- Chat: show the latest message; follow new ones only if the reader is at the bottom ----
  const messagesRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const scrollChatToEnd = () => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
  };
  const messageCount = activeRoom?.messages.length ?? 0;
  useLayoutEffect(() => {
    scrollChatToEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id, activeSection, mobileChatView]);
  useLayoutEffect(() => {
    if (atBottomRef.current) scrollChatToEnd();
  }, [messageCount]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || chatSending || !chatMessageText.trim()) return;
    setChatSending(true);
    setChatError('');
    const r = await sendChatMessage(activeRoom.id, chatMessageText.trim());
    setChatSending(false);
    if (r.ok) {
      setChatMessageText('');
      atBottomRef.current = true;
      requestAnimationFrame(scrollChatToEnd);
    } else {
      setChatError(t(r.error || 'authErrorGeneric'));
    }
  };

  const sectionButton = (id: 'forum' | 'encrypted_rooms', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-pressed={activeSection === id}
      onClick={() => setActiveSection(id)}
      className={`flex items-center justify-center gap-1.5 px-3 min-h-10 rounded-lg text-xs font-semibold transition-all ${FOCUS_RING} ${
        activeSection === id ? 'bg-[#dfcfb3] text-[#1e1b1a] shadow-sm' : 'text-[#8c8279] hover:text-[#f5f2eb]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const voteButton = (opts: { own: boolean; voted: boolean; count: number; onClick: () => void; labelKey: string; small?: boolean }) => (
    <button
      type="button"
      onClick={opts.own ? undefined : opts.onClick}
      disabled={opts.own}
      aria-pressed={opts.own ? undefined : opts.voted}
      aria-label={t(opts.own ? 'frmOwnVote' : opts.labelKey).replace('{n}', String(opts.count))}
      title={t(opts.own ? 'frmOwnVote' : opts.labelKey).replace('{n}', String(opts.count))}
      data-vote-own={opts.own || undefined}
      className={`shrink-0 inline-flex items-center justify-center gap-1 min-h-10 min-w-10 px-2.5 rounded-lg font-mono transition-colors ${FOCUS_RING} ${
        opts.small ? 'text-[11px]' : 'text-xs'
      } ${
        opts.own
          ? 'bg-transparent text-[#6f6760] border border-dashed border-[#3b3430] cursor-not-allowed'
          : opts.voted
            ? 'bg-[#dfcfb3] text-[#1e1b1a] font-bold'
            : 'bg-[#1a1716] text-[#dfcfb3] border border-[#3b3430] hover:border-[#5a4f48]'
      }`}
    >
      <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
      <span aria-hidden="true">{opts.count}</span>
    </button>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">{t('tabForum')}</h1>
          <p className="text-xs text-[#9e948c]">{t('forumSubtitle')}</p>
        </div>

        {/* Section switcher: a toggle group (the pressed button is the shown part) */}
        <div role="group" aria-label={t('frmSectionsLabel')} className="grid grid-cols-2 sm:flex items-stretch bg-[#191615] p-1 rounded-xl border border-[#3b3430] shrink-0">
          {sectionButton('forum', <MessageSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />, t('generalDiscussions'))}
          {sectionButton('encrypted_rooms', <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" aria-hidden="true" />, t('encryptedRooms'))}
        </div>
      </div>

      {/* SECTION 1: GENERAL FORUM */}
      {activeSection === 'forum' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Topics list (5 cols) */}
          <div className={`lg:col-span-5 space-y-3 min-w-0 ${mobileForumView === 'thread' ? 'hidden lg:block' : 'block'}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-[#8c8279] uppercase tracking-wider">
                {t('frmDiscussions')} ({sortedTopics.length})
              </h2>
              <button
                type="button"
                onClick={openCreate}
                className={`px-3 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1 shrink-0 ${FOCUS_RING}`}
                data-create-topic
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('createTopic')}</span>
              </button>
            </div>

            {sortedTopics.length === 0 ? (
              <div className="rounded-xl bg-[#23201e] border border-[#352f2c] p-6 text-center space-y-2" data-forum-empty>
                <MessageSquare className="w-6 h-6 text-[#8c8279] mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#f5f2eb]">{t('frmEmptyTitle')}</p>
                <p className="text-xs text-[#9e948c]">{t('frmEmptyText')}</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className={`mt-2 inline-flex items-center gap-1 px-4 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold ${FOCUS_RING}`}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('createTopic')}
                </button>
              </div>
            ) : (
              <ul className="space-y-2 lg:max-h-[650px] lg:overflow-y-auto lg:pr-1">
                {sortedTopics.map(topic => {
                  const isSelected = activeTopic?.id === topic.id;
                  return (
                    <li key={topic.id}>
                      <button
                        type="button"
                        onClick={() => openTopic(topic.id)}
                        aria-current={isSelected ? 'true' : undefined}
                        data-topic-card={topic.id}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${FOCUS_RING} ${
                          isSelected ? 'bg-[#2b2522] border-[#dfcfb3]' : 'bg-[#23201e] border-[#352f2c] hover:border-[#4d443f]'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2 text-[11px] mb-1">
                          <span className="font-semibold text-[#dfcfb3] min-w-0 truncate">{lf(topic, 'categoryName')}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {topic.isPinned && (
                              <span className="text-[10px] px-1.5 py-px rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                                {t('frmPinned')}
                              </span>
                            )}
                            {topic.isClosed && (
                              <span className="text-[10px] px-1.5 py-px rounded bg-[#1c1918] text-[#9e948c] border border-[#4a413b] inline-flex items-center gap-1" data-topic-closed>
                                <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                                {t('frmClosedBadge')}
                              </span>
                            )}
                          </span>
                        </span>

                        <span className="block text-xs font-bold text-[#f5f2eb] line-clamp-2 leading-snug break-words [overflow-wrap:anywhere]">
                          {topic.title}
                        </span>

                        <span className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-[#302a28] text-[11px] text-[#8c8279]">
                          <span className="truncate min-w-0">{topic.authorName}</span>
                          <span className="flex items-center gap-2 font-mono shrink-0">
                            <span aria-hidden="true">💬 {topic.replies.length}</span>
                            <span aria-hidden="true">👍 {topic.upvotes.length}</span>
                            <span className="sr-only">
                              {t('frmRepliesCount').replace('{n}', String(topic.replies.length))}, {t('frmVotesCount').replace('{n}', String(topic.upvotes.length))}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Active topic thread (7 cols) */}
          <div
            className={`lg:col-span-7 rounded-2xl bg-[#23201e] border border-[#352f2c] flex-col justify-between overflow-hidden min-w-0 ${
              sortedTopics.length ? 'min-h-[500px]' : ''
            } ${mobileForumView === 'list' ? 'hidden lg:flex' : 'flex'}`}
          >
            {activeTopic ? (
              <>
                <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
                  {/* Back to the list (narrow screens) */}
                  <div className="lg:hidden pb-2 border-b border-[#302a28]">
                    <button
                      type="button"
                      onClick={backToTopics}
                      className={`inline-flex items-center gap-1.5 min-h-10 pr-2 rounded-lg text-xs text-[#dfcfb3] hover:text-white font-medium ${FOCUS_RING}`}
                    >
                      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                      <span>{t('frmBack')}</span>
                    </button>
                  </div>

                  {/* Topic header */}
                  <article className="space-y-3 pb-4 border-b border-[#302a28]" aria-labelledby="forum-topic-title">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-[#dfcfb3] min-w-0 truncate">{lf(activeTopic, 'categoryName')}</span>
                      {voteButton({
                        own: activeTopic.authorId === currentUser.id,
                        voted: activeTopic.upvotes.includes(currentUser.id),
                        count: activeTopic.upvotes.length,
                        onClick: () => upvoteTopic(activeTopic.id),
                        labelKey: 'frmUpvoteTopic',
                      })}
                    </div>

                    <h2
                      id="forum-topic-title"
                      ref={threadHeadingRef}
                      tabIndex={-1}
                      className={`font-display text-lg font-bold text-[#f5f2eb] break-words [overflow-wrap:anywhere] outline-none`}
                    >
                      {activeTopic.title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#8c8279]">
                      <AvatarWithFallback src={activeTopic.authorAvatar} name={activeTopic.authorName} className="w-6 h-6" textClassName="text-[10px]" />
                      <span className="font-semibold text-[#f5f2eb]">{activeTopic.authorName}</span>
                      <ProfileRoleBadge role={activeTopic.authorRole} compact />
                      <span aria-hidden="true">·</span>
                      <span data-topic-date>{formatClubDateTime(activeTopic.createdAt, t)}</span>
                      {activeTopic.isPinned && (
                        <span className="text-[10px] px-1.5 py-px rounded bg-amber-950/70 text-amber-300 border border-amber-800">{t('frmPinned')}</span>
                      )}
                      {activeTopic.isClosed && (
                        <span className="text-[10px] px-1.5 py-px rounded bg-[#1c1918] text-[#9e948c] border border-[#4a413b] inline-flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                          {t('frmClosedBadge')}
                        </span>
                      )}
                    </div>

                    <p className={`text-[13px] text-[#d6cebf] leading-relaxed pt-2 ${USER_TEXT}`} data-topic-content>
                      {activeTopic.content}
                    </p>
                  </article>

                  {/* Replies */}
                  <section className="space-y-4" aria-labelledby="forum-replies-title">
                    <h3 id="forum-replies-title" className="text-xs font-bold text-[#8c8279] uppercase tracking-wider">
                      {t('frmReplies')} ({activeTopic.replies.length})
                    </h3>

                    {activeTopic.replies.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#8c8279]">{t('frmNoReplies')}</div>
                    ) : (
                      <ul className="space-y-4">
                        {activeTopic.replies.map(reply => (
                          <li key={reply.id} className="p-4 rounded-xl bg-[#1c1918] border border-[#302a28] space-y-2 text-xs" data-reply-id={reply.id}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                <AvatarWithFallback src={reply.authorAvatar} name={reply.authorName} className="w-5 h-5" textClassName="text-[9px]" />
                                <span className="font-bold text-[#f5f2eb] break-words min-w-0">{reply.authorName}</span>
                                <ProfileRoleBadge role={reply.authorRole} compact />
                                <span className="text-[11px] text-[#8c8279]" data-reply-date>{formatClubDateTime(reply.createdAt, t)}</span>
                              </div>
                              {voteButton({
                                own: reply.authorId === currentUser.id,
                                voted: reply.upvotes.includes(currentUser.id),
                                count: reply.upvotes.length,
                                onClick: () => upvoteReply(activeTopic.id, reply.id),
                                labelKey: 'frmUpvoteReply',
                                small: true,
                              })}
                            </div>

                            <p className={`text-[13px] text-[#b8afa3] leading-relaxed ${USER_TEXT}`}>{reply.content}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>

                {/* Reply composer — or why there is none (closed topic) */}
                {activeTopic.isClosed ? (
                  <div className="p-4 bg-[#1e1b1a] border-t border-[#302a28] flex items-start gap-2 text-xs text-[#a39b94]" role="note" data-closed-notice>
                    <Lock className="w-4 h-4 shrink-0 mt-px text-[#8c8279]" aria-hidden="true" />
                    <span>{t('frmClosedNotice')}</span>
                  </div>
                ) : (
                  <form onSubmit={handleReplySubmit} className="p-4 bg-[#1e1b1a] border-t border-[#302a28] space-y-2" data-reply-form>
                    <div className="flex gap-2 min-w-0">
                      <label htmlFor="forum-reply" className="sr-only">{t('frmReplyPlaceholder')}</label>
                      <input
                        id="forum-reply"
                        type="text"
                        placeholder={t('frmReplyPlaceholder')}
                        value={replyText}
                        maxLength={FORUM_LIMITS.replyMax}
                        onChange={e => setReplyText(e.target.value)}
                        aria-describedby="forum-reply-hint"
                        aria-invalid={replyError ? true : undefined}
                        className="flex-1 min-w-0 px-3 min-h-10 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
                      />
                      <button
                        type="submit"
                        disabled={replySending || !replyText.trim()}
                        className={`shrink-0 px-3 sm:px-4 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{replySending ? t('frmSending') : t('replyToTopic')}</span>
                      </button>
                    </div>
                    {replyError && (
                      <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-reply-error>
                        {replyError}
                      </p>
                    )}
                    <p id="forum-reply-hint" className="text-[11px] text-[#8c8279]">{t('frmReplyRewardHint')}</p>
                  </form>
                )}
              </>
            ) : (
              <div className="hidden lg:flex flex-1 items-center justify-center p-8 text-center text-xs text-[#8c8279]" data-thread-empty>
                {t('frmEmptyText')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 2: CLOSED MEMBERS-ONLY ROOMS */}
      {activeSection === 'encrypted_rooms' && (
        visibleRooms.length === 0 ? (
          <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] p-8 text-center space-y-2">
            <Lock className="w-6 h-6 text-[#8c8279] mx-auto" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#f5f2eb]">{t('frmNoRooms')}</p>
            <p className="text-xs text-[#8c8279]">{t('frmNoRoomsText')}</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Room selector (4 cols) */}
          <div className={`lg:col-span-4 space-y-3 min-w-0 ${mobileChatView === 'chat' ? 'hidden lg:block' : 'block'}`}>
            <h2 className="text-xs font-semibold text-[#8c8279] uppercase tracking-wider">{t('frmRooms')}</h2>

            <ul className="space-y-2">
              {visibleRooms.map(room => {
                const isSelected = activeRoom?.id === room.id;
                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setMobileChatView('chat');
                        setChatError('');
                      }}
                      aria-current={isSelected ? 'true' : undefined}
                      data-room-card={room.id}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${FOCUS_RING} ${
                        isSelected ? 'bg-[#2b2522] border-[#dfcfb3]' : 'bg-[#23201e] border-[#352f2c] hover:border-[#4d443f]'
                      }`}
                    >
                      <span className="font-bold text-[#f5f2eb] flex items-center gap-1.5 text-xs mb-1">
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{lf(room, 'title')}</span>
                      </span>
                      <span className="block text-[11px] text-[#9e948c] line-clamp-2 mt-1">{lf(room, 'description')}</span>
                      <span className="mt-3 pt-2 border-t border-[#302a28] flex items-center justify-between gap-2 text-[10px] text-[#8c8279]">
                        <span className="font-mono text-[#dfcfb3]">
                          {room.accessLevel === 'moderators' ? t('frmModCouncil') : t('frmResidents')}
                        </span>
                        <span>{room.memberCount} {t('frmMembers')}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Closed room (8 cols) */}
          <div className={`lg:col-span-8 rounded-2xl bg-[#23201e] border border-[#352f2c] flex-col justify-between overflow-hidden min-h-[550px] min-w-0 ${mobileChatView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
            {/* Room header */}
            <div className="p-4 bg-[#1a1716] border-b border-[#302a28] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="lg:hidden pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileChatView('list');
                      const id = activeRoom?.id;
                      requestAnimationFrame(() => { if (id) document.querySelector<HTMLElement>(`[data-room-card="${id}"]`)?.focus(); });
                    }}
                    className={`inline-flex items-center gap-1.5 min-h-10 pr-2 rounded-lg text-xs text-[#dfcfb3] hover:text-white font-medium ${FOCUS_RING}`}
                  >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    <span>{t('frmBackToRooms')}</span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-sm font-bold text-[#f5f2eb] break-words">{lf(activeRoom, 'title')}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">{t('frmPrivateChat')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8c8279] mt-0.5">
                  <Key className="w-3 h-3 text-[#dfcfb3]" aria-hidden="true" />
                  <span>{t('frmAccess')}: {activeRoom.accessLevel === 'moderators' ? t('frmModCouncil') : t('frmResidents')}</span>
                </div>
              </div>
            </div>

            {/* Messages (the latest is shown; new ones followed only when the reader is at the bottom) */}
            <div
              ref={messagesRef}
              onScroll={e => {
                const el = e.currentTarget;
                atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
              className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[380px]"
              data-chat-messages
            >
              {(() => {
                let lastDay: string | undefined;
                return activeRoom.messages.map(msg => {
                  const isMe = msg.senderId === currentUser.id;
                  const { day, time } = clubDayTime(msg.timestamp);
                  const showDay = !!day && day !== lastDay;
                  if (day) lastDay = day;
                  return (
                    <React.Fragment key={msg.id}>
                      {showDay && (
                        <div className="flex items-center gap-2 text-[10px] text-[#8c8279] py-1" data-chat-day>
                          <span className="flex-1 h-px bg-[#302a28]" />
                          <span>{formatShortDate(day, t)}</span>
                          <span className="flex-1 h-px bg-[#302a28]" />
                        </div>
                      )}
                      <div className={`flex gap-3 max-w-lg min-w-0 ${isMe ? 'ml-auto flex-row-reverse' : ''}`} data-chat-message>
                        <span className="rounded-full ring-1 ring-[#dfcfb3]/40 shrink-0 h-fit">
                          <AvatarWithFallback src={msg.senderAvatar} name={msg.senderName} className="w-7 h-7" textClassName="text-[10px]" />
                        </span>
                        <div
                          className={`p-3 rounded-2xl text-xs space-y-1 min-w-0 ${
                            isMe ? 'bg-[#dfcfb3] text-[#1e1b1a] rounded-tr-none' : 'bg-[#1c1918] border border-[#352f2c] text-[#f5f2eb] rounded-tl-none'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[10px]">
                            <span className={`font-bold min-w-0 truncate ${isMe ? 'text-[#1e1b1a]' : 'text-[#dfcfb3]'}`}>{msg.senderName}</span>
                            {time && <span className="opacity-70 font-mono text-[10px] shrink-0">{time}</span>}
                          </div>
                          <p className={`leading-relaxed ${USER_TEXT}`}>{msg.text}</p>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                });
              })()}
            </div>

            {/* Message composer */}
            <form onSubmit={handleSendChat} className="p-4 bg-[#1a1716] border-t border-[#302a28] space-y-2" data-chat-form>
              <div className="flex gap-2 min-w-0">
                <label htmlFor="chat-message" className="sr-only">{t('frmMessagePlaceholder')}</label>
                <input
                  id="chat-message"
                  type="text"
                  placeholder={t('frmMessagePlaceholder')}
                  value={chatMessageText}
                  maxLength={FORUM_LIMITS.chatMax}
                  onChange={e => setChatMessageText(e.target.value)}
                  aria-invalid={chatError ? true : undefined}
                  className="flex-1 min-w-0 px-3 min-h-10 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
                />
                <button
                  type="submit"
                  disabled={chatSending || !chatMessageText.trim()}
                  className={`shrink-0 px-3 sm:px-4 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-60 ${FOCUS_RING}`}
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{chatSending ? t('frmSending') : t('actionSend')}</span>
                </button>
              </div>
              {chatError && (
                <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">{chatError}</p>
              )}
            </form>
          </div>
        </div>
        )
      )}

      {/* New topic dialog: title and buttons stay in place, the fields scroll between them */}
      {showCreateTopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div
            ref={createRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-topic-title"
            tabIndex={-1}
            className="relative w-full max-w-lg max-h-[90dvh] flex flex-col bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-[#302a28]">
              <h3 id="create-topic-title" className="font-display text-lg font-bold text-[#f5f2eb]">{t('createTopic')}</h3>
              <button
                type="button"
                onClick={closeCreate}
                aria-label={t('frmCloseCreate')}
                className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716] ${FOCUS_RING}`}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateTopicSubmit} className="flex flex-col flex-1 min-h-0" data-create-form>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-3 text-xs">
                <div>
                  <label htmlFor="topic-title" className="font-medium text-[#d6cebf] block mb-1">{t('frmTopicTitle')} *</label>
                  <input
                    id="topic-title"
                    type="text"
                    required
                    minLength={FORUM_LIMITS.titleMin}
                    maxLength={FORUM_LIMITS.titleMax}
                    value={newTopicTitle}
                    onChange={e => setNewTopicTitle(e.target.value)}
                    placeholder={t('frmTopicPlaceholder')}
                    aria-describedby="topic-title-hint"
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                  />
                  <p id="topic-title-hint" className="mt-1 flex justify-between gap-2 text-[11px] text-[#8c8279]">
                    <span>{t('frmTitleHint')}</span>
                    <span className="font-mono" aria-hidden="true">{newTopicTitle.length}/{FORUM_LIMITS.titleMax}</span>
                  </p>
                </div>

                <div>
                  <label htmlFor="topic-section" className="font-medium text-[#d6cebf] block mb-1">{t('frmSection')}</label>
                  {/* Forum sections (public.forum_categories), not club directions */}
                  <select
                    id="topic-section"
                    value={newTopicCategory}
                    onChange={e => setNewTopicCategory(e.target.value)}
                    className="w-full p-2.5 min-h-10 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                  >
                    {forumCategories.map(c => (
                      <option key={c.id} value={c.id}>{ln(c)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="topic-content" className="font-medium text-[#d6cebf] block mb-1">{t('frmPostText')} *</label>
                  <textarea
                    id="topic-content"
                    rows={5}
                    required
                    maxLength={FORUM_LIMITS.contentMax}
                    value={newTopicContent}
                    onChange={e => setNewTopicContent(e.target.value)}
                    placeholder={t('frmPostPlaceholder')}
                    className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                  />
                </div>

                <p className="text-[11px] text-[#a39b94] leading-relaxed" data-topic-reward-hint>{t('frmTopicRewardHint')}</p>
              </div>

              <div className="px-5 sm:px-6 py-3 border-t border-[#302a28] space-y-2 safe-area-pb">
                {topicError && (
                  <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-create-error>
                    {topicError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCreate}
                    disabled={topicSending}
                    className={`px-3 min-h-10 rounded-lg text-xs text-[#8c8279] hover:text-[#f5f2eb] disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {t('actionClose')}
                  </button>
                  <button
                    type="submit"
                    disabled={topicSending || !titleOk || !newTopicContent.trim()}
                    className={`px-4 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] disabled:opacity-60 ${FOCUS_RING}`}
                  >
                    {topicSending ? t('frmPublishing') : t('frmPublish')}
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
