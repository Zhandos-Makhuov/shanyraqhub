import React from 'react';
import { useApp } from '../context/AppContext';
import { STORAGE_KEY, isDemoData } from '../config/runtime';
import { X, Database, ShieldCheck, RefreshCw, Server, CheckCircle2, AlertCircle } from 'lucide-react';

interface DemoStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DemoStatusModal: React.FC<DemoStatusModalProps> = ({ isOpen, onClose }) => {
  const { allUsers, events, allReadBooks, notifications } = useApp();

  if (!isOpen) return null;

  const handleResetDemoData = () => {
    if (!isDemoData) return;
    if (window.confirm('Сбросить все демонстрационные данные к начальному состоянию?')) {
      // Demo keys only: live data is never touched by this button.
      const suffixes = ['users', 'events', 'topics', 'chats', 'notifs', 'txs', 'audits', 'rewards', 'activity'];
      suffixes.forEach(suffix => localStorage.removeItem(`${STORAGE_KEY}_${suffix}`));
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-600/40 flex items-center justify-center text-amber-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-[#f5f2eb]">
              Статус Данных и Архитектура
            </h3>
            <span className={`text-[11px] font-mono ${isDemoData ? 'text-amber-400' : 'text-emerald-400'}`}>
              {isDemoData ? 'Режим демонстрации (Demo Mode Active)' : 'Боевой режим (Live)'}
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#1a1716] border border-[#352f2c] text-xs space-y-2 text-[#b0a79d] leading-relaxed">
          {isDemoData ? (
            <>
              <p>
                <strong className="text-[#f5f2eb]">Внимание:</strong> Отображаемые пользователи, книги, мероприятия, отзывы и транзакции сгенерированы для наглядной демонстрации интерфейса и возможностей Shanyraq Hub.
              </p>
              <p>
                Они <strong className="text-amber-300">не являются</strong> реальными персональными данными или официальной статистикой сообщества.
              </p>
            </>
          ) : (
            <>
              <p>
                <strong className="text-[#f5f2eb]">Боевой режим:</strong> показываются только реальные данные сообщества. Демонстрационные записи сюда не загружаются и не смешиваются с ними.
              </p>
              <p>
                <strong className="text-emerald-300">Вход и аккаунты</strong> работают через сервер (Supabase): имя, почта и роль берутся из базы. Остальные данные (события, книги, форум, коины) <strong className="text-amber-300">пока хранятся только в этом браузере</strong> — перенос на сервер идёт следующим этапом.
              </p>
            </>
          )}
        </div>

        {/* Backend & Integration Status Matrix */}
        <div className="space-y-2 pt-1 text-xs">
          <span className="font-semibold text-[#dfcfb3] text-[11px] uppercase tracking-wider block">
            Интеграционный статус модулей:
          </span>

          <div className="space-y-1.5">
            <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#8c8279]" />
                <div>
                  <span className="font-medium text-[#f5f2eb] block">Supabase PostgreSQL & Auth</span>
                  <span className="text-[10px] text-[#8c8279]">Хранилище и серверная авторизация</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0">
                {isDemoData ? 'Не подключён (схема готова)' : 'Вход подключён · данные — далее'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-medium text-[#f5f2eb] block">Локальное хранилище браузера</span>
                  <span className="text-[10px] text-[#8c8279]">Сквозная персистентность сессий</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                Активно
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#8c8279]" />
                <div>
                  <span className="font-medium text-[#f5f2eb] block">Закрытые чаты и доступ по ролям</span>
                  <span className="text-[10px] text-[#8c8279]">Серверная проверка прав (Supabase RLS). Сообщения не шифруются сквозным шифрованием</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0">
                После подключения
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1c1918] border border-[#302a28] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="font-medium text-[#f5f2eb] block">PWA & Offline Service Worker</span>
                  <span className="text-[10px] text-[#8c8279]">Манифест и статическое кеширование</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                Установлено
              </span>
            </div>
          </div>
        </div>

        {/* Current Demo Cache Count */}
        <div className="p-3 rounded-xl bg-[#1a1716] border border-[#302a28] flex items-center justify-between text-xs text-[#8c8279]">
          <span>{isDemoData ? 'Загружено демо-записей:' : 'Записей в этом браузере:'}</span>
          <span className="font-mono text-[#dfcfb3]">
            {allUsers.length} пользователей · {events.length} событий · {allReadBooks.length} книг
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#302a28]">
          {isDemoData ? (
          <button
            onClick={handleResetDemoData}
            className="px-3 py-1.5 rounded-lg bg-[#272321] hover:bg-[#322c29] border border-[#3d3632] text-xs text-[#dfcfb3] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Сбросить демо-данные</span>
          </button>
          ) : (
            <span />
          )}

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] transition-colors"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
