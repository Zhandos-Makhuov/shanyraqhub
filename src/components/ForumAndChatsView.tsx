import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { canAccessRoom } from '../utils/permissions';
import {
  MessageSquare,
  Lock,
  ShieldCheck,
  ThumbsUp,
  Send,
  Plus,
  User,
  Key,
  X,
  ArrowLeft,
} from 'lucide-react';
import { DirectionId } from '../types';

export const ForumAndChatsView: React.FC = () => {
  const {
    forumTopics,
    createForumTopic,
    replyToForumTopic,
    upvoteReply,
    upvoteTopic,
    chatRooms,
    sendChatMessage,
    currentUser,
    setSelectedUserModal,
    allUsers,
    language,
    t,
  } = useApp();

  const [activeSection, setActiveSection] = useState<'forum' | 'encrypted_rooms'>('forum');
  const [selectedTopicId, setSelectedTopicId] = useState<string>(forumTopics[0]?.id || '');
  // Only rooms the current role may enter are listed (moderator rooms are hidden from members).
  const visibleRooms = chatRooms.filter(r => canAccessRoom(r, currentUser.role));
  const [selectedRoomId, setSelectedRoomId] = useState<string>(visibleRooms[0]?.id || '');
  const [mobileForumView, setMobileForumView] = useState<'list' | 'thread'>('list');
  const [mobileChatView, setMobileChatView] = useState<'list' | 'chat'>('list');

  // Compose state
  const [replyText, setReplyText] = useState('');
  const [chatMessageText, setChatMessageText] = useState('');

  // Create topic modal
  const [showCreateTopicModal, setShowCreateTopicModal] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState<DirectionId>('books');
  const [newTopicContent, setNewTopicContent] = useState('');

  const activeTopic = forumTopics.find(t => t.id === selectedTopicId) || forumTopics[0];
  const activeRoom = visibleRooms.find(r => r.id === selectedRoomId) || visibleRooms[0];

  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTopic) return;
    replyToForumTopic(activeTopic.id, replyText.trim());
    setReplyText('');
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessageText.trim() || !activeRoom) return;
    sendChatMessage(activeRoom.id, chatMessageText.trim());
    setChatMessageText('');
  };

  const handleCreateTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !newTopicContent.trim()) return;
    createForumTopic(newTopicTitle.trim(), newTopicContent.trim(), newTopicCategory, newTopicCategory);
    setShowCreateTopicModal(false);
    setNewTopicTitle('');
    setNewTopicContent('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#f5f2eb]">
            {t('tabForum')}
          </h1>
          <p className="text-xs text-[#9e948c]">
            {t('forumSubtitle')}
          </p>
        </div>

        {/* Section Segmented Control */}
        <div className="flex items-center bg-[#191615] p-1 rounded-xl border border-[#3b3430] shrink-0">
          <button
            onClick={() => setActiveSection('forum')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSection === 'forum'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] shadow-sm'
                : 'text-[#8c8279] hover:text-[#f5f2eb]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('generalDiscussions')}</span>
          </button>
          <button
            onClick={() => setActiveSection('encrypted_rooms')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeSection === 'encrypted_rooms'
                ? 'bg-[#dfcfb3] text-[#1e1b1a] shadow-sm'
                : 'text-[#8c8279] hover:text-[#f5f2eb]'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-amber-500" />
            <span>{t('encryptedRooms')}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: GENERAL FORUM */}
      {activeSection === 'forum' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Topics List Sidebar (5 cols) */}
          <div className={`lg:col-span-5 space-y-3 ${mobileForumView === 'thread' ? 'hidden lg:block' : 'block'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#8c8279] uppercase tracking-wider">
                Обсуждения ({forumTopics.length})
              </span>
              <button
                onClick={() => setShowCreateTopicModal(true)}
                className="px-3 py-1 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>{t('createTopic')}</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
              {forumTopics.map(topic => {
                const isSelected = activeTopic?.id === topic.id;
                return (
                  <div
                    key={topic.id}
                    onClick={() => {
                      setSelectedTopicId(topic.id);
                      setMobileForumView('thread');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#2b2522] border-[#dfcfb3]'
                        : 'bg-[#23201e] border-[#352f2c] hover:border-[#4d443f]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold text-[#dfcfb3]">
                        {topic.categoryNameRu}
                      </span>
                      {topic.isPinned && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950/70 text-amber-300 border border-amber-800">
                          Закреплено
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-[#f5f2eb] line-clamp-2 leading-snug">
                      {topic.title}
                    </h4>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#302a28] text-[11px] text-[#8c8279]">
                      <span className="truncate max-w-[140px]">{topic.authorName}</span>
                      <span className="flex items-center gap-2 font-mono">
                        <span>💬 {topic.replies.length}</span>
                        <span>👍 {topic.upvotes.length}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Topic Thread (7 cols) */}
          <div className={`lg:col-span-7 rounded-2xl bg-[#23201e] border border-[#352f2c] flex-col justify-between overflow-hidden min-h-[500px] ${mobileForumView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
            {activeTopic ? (
              <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
                {/* Mobile Back Button */}
                <div className="lg:hidden pb-2 border-b border-[#302a28]">
                  <button
                    onClick={() => setMobileForumView('list')}
                    className="flex items-center gap-1.5 text-xs text-[#dfcfb3] hover:text-white font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Назад ко всем темам</span>
                  </button>
                </div>

                {/* Topic Header */}
                <div className="space-y-3 pb-4 border-b border-[#302a28]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#dfcfb3]">
                      {activeTopic.categoryNameRu}
                    </span>
                    <button
                      onClick={() => upvoteTopic(activeTopic.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                        activeTopic.upvotes.includes(currentUser.id)
                          ? 'bg-[#dfcfb3] text-[#1e1b1a] font-bold'
                          : 'bg-[#1a1716] text-[#dfcfb3] border border-[#3b3430]'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{activeTopic.upvotes.length}</span>
                    </button>
                  </div>

                  <h2 className="font-display text-lg font-bold text-[#f5f2eb]">
                    {activeTopic.title}
                  </h2>

                  <div className="flex items-center gap-2.5 text-xs text-[#8c8279]">
                    <img
                      src={activeTopic.authorAvatar}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover ring-1 ring-[#dfcfb3]/50"
                    />
                    <span className="font-semibold text-[#f5f2eb]">
                      {activeTopic.authorName}
                    </span>
                    <span>·</span>
                    <span>{activeTopic.createdAt}</span>
                  </div>

                  <p className="text-xs text-[#d6cebf] leading-relaxed pt-2">
                    {activeTopic.content}
                  </p>
                </div>

                {/* Replies Thread */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-[#8c8279] uppercase tracking-wider">
                    Ответы ({activeTopic.replies.length})
                  </h4>

                  {activeTopic.replies.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#8c8279]">
                      Пока нет ответов. Будьте первым, кто поделится мыслями!
                    </div>
                  ) : (
                    activeTopic.replies.map(reply => (
                      <div
                        key={reply.id}
                        className="p-4 rounded-xl bg-[#1c1918] border border-[#302a28] space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img
                              src={reply.authorAvatar}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover"
                            />
                            <span className="font-bold text-[#f5f2eb]">
                              {reply.authorName}
                            </span>
                            <span className="text-[10px] text-[#dfcfb3]">
                              {reply.authorRole.toUpperCase()}
                            </span>
                          </div>

                          <button
                            onClick={() => upvoteReply(activeTopic.id, reply.id)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                              reply.upvotes.includes(currentUser.id)
                                ? 'bg-[#dfcfb3] text-[#1e1b1a] font-bold'
                                : 'text-[#8c8279] hover:text-[#f5f2eb] bg-[#272321]'
                            }`}
                            title="Отметить как полезный ответ (+15 XP автору)"
                          >
                            <ThumbsUp className="w-3 h-3" />
                            <span>{reply.upvotes.length}</span>
                          </button>
                        </div>

                        <p className="text-xs text-[#b8afa3] leading-relaxed">
                          {reply.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {/* Reply Composer Bar */}
            <form onSubmit={handleReplySubmit} className="p-4 bg-[#1e1b1a] border-t border-[#302a28] flex gap-2">
              <input
                type="text"
                placeholder="Напишите аргументированный ответ (+20 XP)..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('replyToTopic')}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 2: CLOSED MEMBERS-ONLY ROOMS */}
      {activeSection === 'encrypted_rooms' && (
        visibleRooms.length === 0 ? (
          <div className="rounded-2xl bg-[#23201e] border border-[#352f2c] p-8 text-center space-y-2">
            <Lock className="w-6 h-6 text-[#8c8279] mx-auto" />
            <p className="text-sm font-semibold text-[#f5f2eb]">Закрытых комнат пока нет</p>
            <p className="text-xs text-[#8c8279]">Комнаты направлений создаёт администрация клуба. Они появятся здесь.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Room Selector (4 cols) */}
          <div className={`lg:col-span-4 space-y-3 ${mobileChatView === 'chat' ? 'hidden lg:block' : 'block'}`}>
            <span className="text-xs font-semibold text-[#8c8279] uppercase tracking-wider block">
              Закрытые каналы направлений
            </span>

            <div className="space-y-2">
              {visibleRooms.map(room => {
                const isSelected = activeRoom?.id === room.id;
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      setSelectedRoomId(room.id);
                      setMobileChatView('chat');
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#2b2522] border-[#dfcfb3]'
                        : 'bg-[#23201e] border-[#352f2c] hover:border-[#4d443f]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-[#f5f2eb] flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                        {room.titleRu}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#9e948c] line-clamp-2 mt-1">
                      {room.descriptionRu}
                    </p>

                    <div className="mt-3 pt-2 border-t border-[#302a28] flex items-center justify-between text-[10px] text-[#8c8279]">
                      <span className="font-mono text-[#dfcfb3]">
                        {room.accessLevel === 'moderators' ? 'Совет модераторов' : 'Резиденты клуба'}
                      </span>
                      <span>{room.memberCount} участников</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Closed Room Interface (8 cols) */}
          <div className={`lg:col-span-8 rounded-2xl bg-[#23201e] border border-[#352f2c] flex-col justify-between overflow-hidden min-h-[550px] ${mobileChatView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
            {/* Room Security Header */}
            <div className="p-4 bg-[#1a1716] border-b border-[#302a28] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                {/* Mobile back button */}
                <div className="lg:hidden pb-1">
                  <button
                    onClick={() => setMobileChatView('list')}
                    className="flex items-center gap-1.5 text-xs text-[#dfcfb3] hover:text-white font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>К списку каналов</span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-display text-sm font-bold text-[#f5f2eb]">
                    {activeRoom.titleRu}
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                    Закрытый чат
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8c8279] mt-0.5">
                  <Key className="w-3 h-3 text-[#dfcfb3]" />
                  <span>Доступ: {activeRoom.accessLevel === 'moderators' ? 'Совет модераторов' : 'Резиденты клуба'}</span>
                </div>
              </div>

            </div>

            {/* Message Stream */}
            <div className="p-4 space-y-3 flex-1 overflow-y-auto max-h-[380px]">
              {activeRoom.messages.map(msg => {
                const isMe = msg.senderId === currentUser.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 max-w-lg ${isMe ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    <img
                      src={msg.senderAvatar}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0 ring-1 ring-[#dfcfb3]/40"
                    />
                    <div
                      className={`p-3 rounded-2xl text-xs space-y-1 ${
                        isMe
                          ? 'bg-[#dfcfb3] text-[#1e1b1a] rounded-tr-none'
                          : 'bg-[#1c1918] border border-[#352f2c] text-[#f5f2eb] rounded-tl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px]">
                        <span className={`font-bold ${isMe ? 'text-[#1e1b1a]' : 'text-[#dfcfb3]'}`}>
                          {msg.senderName}
                        </span>
                        <span className="opacity-70 font-mono text-[9px]">
                          {msg.timestamp}
                        </span>
                      </div>

                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Message Input Box */}
            <form onSubmit={handleSendChat} className="p-4 bg-[#1a1716] border-t border-[#302a28] flex gap-2">
              <input
                type="text"
                placeholder="Сообщение для участников комнаты..."
                value={chatMessageText}
                onChange={e => setChatMessageText(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#24201e] border border-[#3d3632] text-xs text-[#f5f2eb] placeholder-[#736a62] focus:outline-none focus:border-[#dfcfb3]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-[#1e1b1a] text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t('actionSend')}</span>
              </button>
            </form>
          </div>
        </div>
        )
      )}

      {/* Create Topic Modal */}
      {showCreateTopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-6 space-y-4">
            <button
              onClick={() => setShowCreateTopicModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716]"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-display text-lg font-bold text-[#f5f2eb]">
              {t('createTopic')}
            </h3>

            <form onSubmit={handleCreateTopicSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Тема обсуждения *
                </label>
                <input
                  type="text"
                  required
                  value={newTopicTitle}
                  onChange={e => setNewTopicTitle(e.target.value)}
                  placeholder="О чем хотите поговорить с резидентами?"
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Раздел / Направление
                </label>
                <select
                  value={newTopicCategory}
                  onChange={e => setNewTopicCategory(e.target.value as DirectionId)}
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb]"
                >
                  <option value="books">Книжная полка & Рецензии</option>
                  <option value="english">Speaking English Club</option>
                  <option value="arabic">Арабский язык & Каллиграфия</option>
                  <option value="sport">Спорт и бег Tarlan</option>
                  <option value="art">Арт-терапия и керамика</option>
                  <option value="intellect">Интеллектуальные игры Zerde</option>
                  <option value="general">Общие анонсы и идеи</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-[#d6cebf] block mb-1">
                  Текст публикации *
                </label>
                <textarea
                  rows={4}
                  required
                  value={newTopicContent}
                  onChange={e => setNewTopicContent(e.target.value)}
                  placeholder="Опишите подробности, задайте наводящие вопросы..."
                  className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#302a28]">
                <button
                  type="button"
                  onClick={() => setShowCreateTopicModal(false)}
                  className="px-3 py-1.5 text-[#8c8279] hover:text-[#f5f2eb]"
                >
                  {t('actionClose')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
                >
                  Опубликовать (+30 XP, +15 🪙)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
