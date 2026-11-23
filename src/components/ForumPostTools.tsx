import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfcfb3] focus-visible:ring-offset-2 focus-visible:ring-offset-[#191615]';

export interface PostAction {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * "⋯" button that opens a short list of actions for a topic or a reply (disclosure pattern:
 * aria-expanded + a list of ordinary buttons). Escape or a click outside closes it; focus returns to "⋯".
 * `groups` are shown with a separator between them (own actions, then moderation).
 */
export const PostActionsMenu: React.FC<{
  label: string;
  groups: { title?: string; actions: PostAction[] }[];
  note?: string;
  dataAttr: string;
}> = ({ label, groups, note, dataAttr }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const visibleGroups = groups.filter(g => g.actions.length > 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    // First action takes focus, so the keyboard continues inside the list.
    requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLElement>('[data-post-action]')?.focus());
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (visibleGroups.length === 0 && !note) return null;

  return (
    <div ref={wrapRef} className="relative shrink-0" {...{ [dataAttr]: true }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center justify-center min-h-10 min-w-10 rounded-lg border transition-colors ${FOCUS_RING} ${
          open ? 'bg-[#2c2624] border-[#5a4f48] text-white' : 'bg-[#1a1716] border-[#3b3430] text-[#dfcfb3] hover:border-[#5a4f48]'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listId}
          className="absolute right-0 top-full mt-1 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-[#4a413b] bg-[#23201e] shadow-2xl py-1"
          data-post-actions-list
        >
          {visibleGroups.map((g, gi) => (
            <div key={gi} role="group" aria-label={g.title} className={gi > 0 ? 'border-t border-[#3b3430] mt-1 pt-1' : ''}>
              {g.title && <p className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-[#9e948c]" aria-hidden="true">{g.title}</p>}
              <ul>
                {g.actions.map(a => (
                  <li key={a.id}>
                    <button
                      type="button"
                      data-post-action={a.id}
                      onClick={() => {
                        setOpen(false);
                        // Focus "⋯" first: a window opened by the action returns focus here when it closes.
                        buttonRef.current?.focus();
                        a.onSelect();
                      }}
                      className={`w-full text-left px-3 min-h-10 text-xs font-medium hover:bg-[#2c2624] focus:bg-[#2c2624] focus:outline-none ${
                        a.danger ? 'text-red-300' : 'text-[#f5f2eb]'
                      }`}
                    >
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {note && (
            <p className={`px-3 py-2 text-[11px] leading-snug text-[#b8afa3] ${visibleGroups.length ? 'border-t border-[#3b3430] mt-1' : ''}`} data-post-actions-note>
              {note}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Confirmation for a destructive action (role="alertdialog"): "Cancel" is the first button,
 * Escape cancels, the error stays inside the window, a second press is ignored while busy.
 */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  busyLabel: string;
  cancelLabel: string;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional extra fields (e.g. a required reason) between the text and the buttons. */
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}> = ({ open, title, text, confirmLabel, busyLabel, cancelLabel, busy, error, onConfirm, onCancel, children, confirmDisabled }) => {
  const ref = useDialog<HTMLDivElement>(open, () => !busy && onCancel());
  const titleId = useId();
  const textId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none p-5 space-y-3"
        data-confirm-dialog
      >
        <h3 id={titleId} className="font-display text-base font-bold text-[#f5f2eb]">{title}</h3>
        <p id={textId} className="text-xs text-[#b8afa3] leading-relaxed">{text}</p>
        {children}
        {error && (
          <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-confirm-error>
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`px-3 min-h-10 rounded-lg text-xs text-[#d6cebf] hover:text-white bg-[#1a1716] border border-[#3b3430] disabled:opacity-50 ${FOCUS_RING}`}
            data-confirm-cancel
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className={`px-4 min-h-10 rounded-lg bg-red-800 hover:bg-red-700 text-xs font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
            data-confirm-ok
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Edit a topic's title and text (the section cannot change — the database allows only these two fields). */
export const TopicEditDialog: React.FC<{
  open: boolean;
  initialTitle: string;
  initialContent: string;
  limits: { titleMin: number; titleMax: number; contentMax: number };
  labels: { heading: string; title: string; titleHint: string; text: string; save: string; saving: string; cancel: string; close: string };
  onSave: (title: string, content: string) => Promise<string | null>;
  onClose: () => void;
}> = ({ open, initialTitle, initialContent, limits, labels, onSave, onClose }) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setContent(initialContent);
      setError('');
    }
  }, [open, initialTitle, initialContent]);
  const close = () => !busyRef.current && onClose();
  const ref = useDialog<HTMLDivElement>(open, close);
  if (!open) return null;
  const titleOk = title.trim().length >= limits.titleMin && title.length <= limits.titleMax;
  const changed = title.trim() !== initialTitle || content.trim() !== initialContent;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current || !titleOk || !content.trim() || !changed) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const err = await onSave(title.trim(), content.trim());
    busyRef.current = false;
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-topic-heading"
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90dvh] flex flex-col bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl outline-none"
        data-edit-topic-dialog
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3 border-b border-[#302a28]">
          <h3 id="edit-topic-heading" className="font-display text-lg font-bold text-[#f5f2eb]">{labels.heading}</h3>
          <button
            type="button"
            onClick={close}
            aria-label={labels.close}
            className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-[#9e948c] hover:text-white bg-[#1a1716] ${FOCUS_RING}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-4 space-y-3 text-xs">
            <div>
              <label htmlFor="edit-topic-title" className="font-medium text-[#d6cebf] block mb-1">{labels.title} *</label>
              <input
                id="edit-topic-title"
                type="text"
                required
                minLength={limits.titleMin}
                maxLength={limits.titleMax}
                value={title}
                onChange={e => setTitle(e.target.value)}
                aria-describedby="edit-topic-title-hint"
                className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
              />
              <p id="edit-topic-title-hint" className="mt-1 flex justify-between gap-2 text-[11px] text-[#9e948c]">
                <span>{labels.titleHint}</span>
                <span className="font-mono" aria-hidden="true">{title.length}/{limits.titleMax}</span>
              </p>
            </div>
            <div>
              <label htmlFor="edit-topic-content" className="font-medium text-[#d6cebf] block mb-1">{labels.text} *</label>
              <textarea
                id="edit-topic-content"
                rows={6}
                required
                maxLength={limits.contentMax}
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-[#f5f2eb] focus:outline-none focus:border-[#dfcfb3]"
              />
            </div>
          </div>
          <div className="px-5 sm:px-6 py-3 border-t border-[#302a28] space-y-2 safe-area-pb">
            {error && (
              <p role="alert" className="text-[12px] text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2" data-edit-error>
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={`px-3 min-h-10 rounded-lg text-xs text-[#9e948c] hover:text-[#f5f2eb] disabled:opacity-50 ${FOCUS_RING}`}
              >
                {labels.cancel}
              </button>
              <button
                type="submit"
                disabled={busy || !titleOk || !content.trim() || !changed}
                className={`px-4 min-h-10 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a] disabled:opacity-60 ${FOCUS_RING}`}
              >
                {busy ? labels.saving : labels.save}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
