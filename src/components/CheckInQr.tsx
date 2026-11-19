/**
 * Real QR check-in (live mode):
 *   - MyQrModal: a registered member shows a one-time code (issue_checkin_token, valid 5 minutes,
 *     renewed automatically). The modal notices when the visit is confirmed.
 *   - QrScanModal: the event's organizer (or a moderator) scans the code with the phone camera
 *     (check_in_with_token). A pasted code works too, as a fallback.
 * The QR and camera libraries are loaded only when one of these windows is opened.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, QrCode, ScanLine, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { CommunityEvent } from '../types';

const QR_PREFIX = 'shq1:';
const RENEW_BEFORE_MS = 20_000;

const Overlay: React.FC<{ onClose: () => void; title: string; children: React.ReactNode }> = ({ onClose, title, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
    <div className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto bg-[#23201e] border border-[#3f3834] rounded-2xl shadow-2xl p-5 space-y-4">
      <button onClick={onClose} aria-label="Закрыть" className="absolute right-3 top-3 p-1.5 rounded-lg text-[#8c8279] hover:text-[#f5f2eb] hover:bg-[#2d2825]">
        <X className="w-4 h-4" />
      </button>
      <h2 className="font-display text-base font-bold text-[#f5f2eb] pr-8 flex items-center gap-2">
        <QrCode className="w-4 h-4 text-[#dfcfb3]" />
        {title}
      </h2>
      {children}
    </div>
  </div>
);

const Note: React.FC<{ kind: 'ok' | 'error' | 'info'; children: React.ReactNode }> = ({ kind, children }) => (
  <div
    role={kind === 'error' ? 'alert' : 'status'}
    className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
      kind === 'ok'
        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
        : kind === 'error'
          ? 'bg-red-500/10 border-red-500/20 text-red-300'
          : 'bg-[#1a1716] border-[#352f2c] text-[#c7beaf]'
    }`}
  >
    {kind === 'ok' && <CheckCircle className="w-4 h-4 shrink-0" />}
    <span>{children}</span>
  </div>
);

/** Member: shows their one-time QR code for the event. */
export const MyQrModal: React.FC<{ event: CommunityEvent; onClose: () => void }> = ({ event, onClose }) => {
  const { issueCheckInCode, refreshData, events, currentUser, t } = useApp();
  const [image, setImage] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const issuing = useRef(false);
  // Context functions are re-created on every data refresh; keep the latest one in a ref so a refresh
  // never re-issues the code (a new code invalidates the one already on screen).
  const issueRef = useRef(issueCheckInCode);
  issueRef.current = issueCheckInCode;

  const attended = events.find(e => e.id === event.id)?.attendedUserIds.includes(currentUser.id) ?? false;

  const issue = useCallback(async () => {
    const issueCode = issueRef.current;
    if (!issueCode || issuing.current) return;
    issuing.current = true;
    setError(null);
    const r = await issueCode(event.id);
    issuing.current = false;
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const QRCode = (await import('qrcode')).default;
    setImage(await QRCode.toDataURL(r.code, { width: 560, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1e1b1a', light: '#f5f2eb' } }));
    setExpiresAt(new Date(r.expiresAt).getTime());
  }, [event.id]);

  useEffect(() => {
    void issue();
  }, [issue]);

  // Countdown + automatic renewal shortly before the code expires.
  useEffect(() => {
    if (attended) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [attended]);
  useEffect(() => {
    if (!attended && !error && expiresAt && expiresAt - now < RENEW_BEFORE_MS) void issue();
  }, [now, expiresAt, attended, error, issue]);

  // Notice the organizer's scan: refresh server data every few seconds while the code is shown.
  useEffect(() => {
    if (attended || !refreshData) return;
    const id = window.setInterval(() => void refreshData(), 4000);
    return () => window.clearInterval(id);
  }, [attended, refreshData]);

  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));

  return (
    <Overlay onClose={onClose} title={t('qrMyCodeTitle')}>
      <p className="text-xs text-[#a39b94]">{event.title}</p>
      {attended ? (
        <Note kind="ok">{t('qrVisitConfirmed')}</Note>
      ) : error ? (
        <>
          <Note kind="error">{t(error)}</Note>
          <button onClick={() => void issue()} className="w-full p-2.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]">
            {t('authRetry')}
          </button>
        </>
      ) : image ? (
        <>
          <img src={image} alt={t('qrMyCodeTitle')} className="w-full aspect-square rounded-xl bg-[#f5f2eb] p-2" />
          <p className="text-xs text-[#c7beaf] text-center">{t('qrMyCodeHint')}</p>
          <p className="text-[11px] text-[#8c8279] text-center font-mono">
            {t('qrRenewsIn')} {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </p>
        </>
      ) : (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-[#dfcfb3]" />
        </div>
      )}
    </Overlay>
  );
};

type ScanState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok' | 'error'; text: string };

/** Organizer: scans members' codes with the camera (or accepts a pasted code). */
export const QrScanModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { checkInWithCode, allUsers, events, t } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<{ start: () => Promise<void>; stop: () => void; destroy: () => void } | null>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'unavailable'>('starting');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [manual, setManual] = useState('');
  // Codes the camera already sent in this window: the same code stays in view after a scan and must not
  // be sent again (it would only produce "already used"). A pasted code is always sent.
  const seen = useRef(new Set<string>());
  const busy = useRef(false);

  const submit = useCallback(
    async (raw: string, fromCamera: boolean) => {
      const code = raw.trim();
      if (!checkInWithCode || busy.current || !code) return;
      if (fromCamera && seen.current.has(code)) return;
      seen.current.add(code);
      if (!code.startsWith(QR_PREFIX)) {
        setState({ kind: 'error', text: t('qrNotClubCode') });
        return;
      }
      busy.current = true;
      setState({ kind: 'busy' });
      const r = await checkInWithCode(code);
      busy.current = false;
      if (!r.ok) {
        setState({ kind: 'error', text: t(r.error ?? 'authErrorGeneric') });
        return;
      }
      const member = allUsers.find(u => u.id === r.userId)?.name ?? '—';
      const event = events.find(e => e.id === r.eventId)?.title ?? '';
      setState({
        kind: 'ok',
        text: `${member} · ${event} — ${r.newlyCheckedIn ? t('qrCheckedIn') : t('qrAlreadyCheckedIn')}`,
      });
    },
    [checkInWithCode, allUsers, events, t],
  );
  // The camera is started once; it always calls the latest submit (data refreshes must not restart it).
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (cancelled || !video.current) return;
        if (!(await QrScanner.hasCamera())) {
          setCamera('unavailable');
          return;
        }
        const s = new QrScanner(video.current, result => void submitRef.current(result.data, true), {
          preferredCamera: 'environment',
          // Whole frame, not just a centre box: a code held close to the camera is still read.
          calculateScanRegion: v => {
            const size = Math.min(v.videoWidth, v.videoHeight, 720);
            return { x: 0, y: 0, width: v.videoWidth, height: v.videoHeight, downScaledWidth: size, downScaledHeight: size };
          },
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
        });
        scanner.current = s;
        await s.start();
        if (cancelled) s.destroy();
        else setCamera('on');
      } catch {
        if (!cancelled) setCamera('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      scanner.current?.destroy();
      scanner.current = null;
    };
  }, []);

  return (
    <Overlay onClose={onClose} title={t('qrScanTitle')}>
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-[#141110] border border-[#352f2c]">
        <video ref={video} className="w-full h-full object-cover" muted playsInline />
        {camera !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#8c8279] p-4 text-center">
            {camera === 'starting' ? <Loader2 className="w-6 h-6 animate-spin text-[#dfcfb3]" /> : <ScanLine className="w-6 h-6" />}
            <span>{camera === 'starting' ? t('qrCameraStarting') : t('qrCameraUnavailable')}</span>
          </div>
        )}
      </div>

      {state.kind === 'busy' && <Note kind="info">{t('authLoading')}</Note>}
      {(state.kind === 'ok' || state.kind === 'error') && <Note kind={state.kind}>{state.text}</Note>}
      {state.kind !== 'idle' && state.kind !== 'busy' && (
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="w-full p-2.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] text-xs font-semibold text-[#1e1b1a]"
        >
          {t('qrScanNext')}
        </button>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          void submit(manual, false);
          setManual('');
        }}
        className="flex gap-2"
      >
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder={t('qrPasteCode')}
          className="flex-1 min-w-0 p-2 rounded-lg bg-[#1a1716] border border-[#3b3430] text-xs text-[#f5f2eb] placeholder:text-[#6f665f] focus:outline-none focus:border-[#dfcfb3]"
        />
        <button type="submit" className="px-3 py-2 rounded-lg bg-[#2e2927] hover:bg-[#3d3633] border border-[#483f3a] text-xs text-[#dfcfb3]">
          OK
        </button>
      </form>
    </Overlay>
  );
};
