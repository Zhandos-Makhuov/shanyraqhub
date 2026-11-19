/**
 * Live mode only (loaded by App.tsx through a dynamic import): nothing of the club is
 * visible without an account — the database gives anonymous visitors no access at all.
 *
 *   signed out      → sign in / create account / forgot password
 *   e-mail link     → confirmation signs the member in; recovery asks for a new password
 *   signed in       → loads the member's own profile, then renders the app
 */
import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { openedFromRecoveryLink, supabase, supabaseConfigured } from '../data/supabase/client';
import {
  MIN_PASSWORD_LENGTH, loadOwnProfile, requestPasswordReset, resendConfirmation,
  signIn, signOut, signUp, updatePassword, validateEmail,
} from '../data/supabase/auth';
import * as liveApi from '../data/supabase/live';
import type { LiveSnapshot } from '../data/supabase/live';
import { TRANSLATIONS } from '../data/translations';
import type { Language, UserProfile } from '../types';

export interface LiveAccount {
  profile: UserProfile;
  signOut: () => Promise<void>;
  /** The club's data at sign-in (members, events, notifications), read from the server. */
  snapshot: LiveSnapshot;
  /** Server reads and actions (RPCs). */
  api: typeof liveApi;
}

type Mode = 'signin' | 'signup' | 'forgot' | 'check-email' | 'reset-sent';

const LANGS: Language[] = ['ru', 'kz', 'en'];

const useAuthT = () => {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('shanyraq_lang') as Language) || 'ru');
  const t = (key: string) => TRANSLATIONS[language]?.[key] || TRANSLATIONS.ru[key] || key;
  const change = (lang: Language) => {
    localStorage.setItem('shanyraq_lang', lang);
    setLanguage(lang);
  };
  return { language, setLanguage: change, t };
};

/** Errors Supabase puts in the URL when an e-mail link is expired or already used. */
const readLinkError = (): string | null => {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const code = params.get('error_code') || params.get('error');
  if (!code) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return code === 'otp_expired' || code === 'access_denied' ? 'authErrorLinkExpired' : 'authErrorGeneric';
};

const inputClass =
  'w-full p-2.5 rounded-lg bg-[#1a1716] border border-[#3b3430] text-sm text-[#f5f2eb] placeholder:text-[#6f665f] focus:outline-none focus:border-[#dfcfb3]';
const primaryClass =
  'w-full p-2.5 rounded-lg bg-[#dfcfb3] hover:bg-[#ecd9bf] disabled:opacity-60 text-sm font-semibold text-[#1e1b1a] transition-colors flex items-center justify-center gap-2';
const linkClass = 'text-xs text-[#dfcfb3] hover:underline';

const Shell: React.FC<{ t: (k: string) => string; language: Language; setLanguage: (l: Language) => void; children: React.ReactNode }> = ({
  t, language, setLanguage, children,
}) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-[#191615] text-[#f5f2eb] px-4 py-10">
    <div className="w-full max-w-sm">
      <div className="flex flex-col items-center gap-3 mb-6 text-center">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-[#24201e] ring-1 ring-[#dfcfb3]/40 p-1 flex items-center justify-center">
          <img src="/icons/icon-192.png" alt="Shanyraq Hub" className="w-full h-full object-contain rounded-full" />
        </div>
        <div>
          <div className="font-display text-xl font-bold tracking-wide">{t('brandName')}</div>
          <div className="text-xs text-[#9e948c] mt-1">{t('brandTagline')}</div>
        </div>
      </div>
      <div className="bg-[#25211f] border border-[#3f3834] rounded-2xl p-5 shadow-2xl">{children}</div>
      <div className="flex justify-center gap-1 mt-5">
        {LANGS.map(l => (
          <button
            key={l}
            onClick={() => setLanguage(l)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono uppercase ${
              l === language ? 'bg-[#dfcfb3]/15 text-[#dfcfb3]' : 'text-[#8c8279] hover:text-[#d6cebf]'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  </div>
);

const PasswordInput: React.FC<{
  value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; t: (k: string) => string;
}> = ({ value, onChange, placeholder, autoComplete, t }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? t('authHidePassword') : t('authShowPassword')}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#8c8279] hover:text-[#d6cebf]"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

const Message: React.FC<{ kind: 'error' | 'info'; children: React.ReactNode }> = ({ kind, children }) => (
  <div
    role={kind === 'error' ? 'alert' : 'status'}
    className={`text-xs rounded-lg px-3 py-2 ${
      kind === 'error' ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-[#dfcfb3]/10 text-[#dfcfb3] border border-[#dfcfb3]/20'
    }`}
  >
    {children}
  </div>
);

/** Sign in / sign up / forgot password. */
const AuthScreen: React.FC<{ initialError: string | null }> = ({ initialError }) => {
  const { t, language, setLanguage } = useAuthT();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch {
      setError('authErrorNetwork');
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return setError('authErrorEmailInvalid');
    if (mode === 'signup') {
      if (name.trim().length < 2) return setError('authErrorNameRequired');
      if (password.length < MIN_PASSWORD_LENGTH) return setError('authErrorWeakPassword');
      return run(async () => {
        const r = await signUp(name, email, password);
        if (r.ok) go('check-email');
        else setError(r.error);
      });
    }
    if (mode === 'signin') {
      return run(async () => {
        const r = await signIn(email, password);
        if (!r.ok) setError(r.error);
        // On success onAuthStateChange in AuthGate takes over.
      });
    }
    if (mode === 'forgot') {
      return run(async () => {
        const r = await requestPasswordReset(email);
        if (r.ok) go('reset-sent');
        else setError(r.error);
      });
    }
  };

  const resend = () =>
    run(async () => {
      const r = await resendConfirmation(email);
      if (r.ok) setInfo('authConfirmationResent');
      else setError(r.error);
    });

  if (mode === 'check-email' || mode === 'reset-sent') {
    return (
      <Shell t={t} language={language} setLanguage={setLanguage}>
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#dfcfb3]/10 flex items-center justify-center">
            <Mail className="w-6 h-6 text-[#dfcfb3]" />
          </div>
          <h1 className="text-base font-semibold">{t(mode === 'check-email' ? 'authCheckEmailTitle' : 'authResetSentTitle')}</h1>
          <p className="text-xs text-[#c7beaf] leading-relaxed">
            {t(mode === 'check-email' ? 'authCheckEmailText' : 'authResetSentText')} <span className="text-[#f5f2eb] font-medium break-all">{email.trim()}</span>
          </p>
          <p className="text-[11px] text-[#8c8279]">{t('authCheckSpam')}</p>
          {error && <Message kind="error">{t(error)}</Message>}
          {info && <Message kind="info">{t(info)}</Message>}
          {mode === 'check-email' && (
            <button onClick={resend} disabled={busy} className={linkClass}>
              {t('authResendConfirmation')}
            </button>
          )}
          <button onClick={() => go('signin')} className={primaryClass}>
            {t('authBackToSignIn')}
          </button>
        </div>
      </Shell>
    );
  }

  const titleKey = mode === 'signup' ? 'authSignUpTitle' : mode === 'forgot' ? 'authForgotTitle' : 'authSignInTitle';
  const submitKey = mode === 'signup' ? 'authSignUpButton' : mode === 'forgot' ? 'authSendResetLink' : 'authSignInButton';

  return (
    <Shell t={t} language={language} setLanguage={setLanguage}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <h1 className="text-base font-semibold text-center">{t(titleKey)}</h1>
        {mode === 'forgot' && <p className="text-xs text-[#9e948c] text-center">{t('authForgotText')}</p>}

        {mode === 'signup' && (
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('authNamePlaceholder')}
            autoComplete="name"
            maxLength={80}
            required
            className={inputClass}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={t('authEmailPlaceholder')}
          autoComplete="email"
          required
          className={inputClass}
        />
        {mode !== 'forgot' && (
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder={mode === 'signup' ? t('authPasswordNewPlaceholder') : t('authPasswordPlaceholder')}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            t={t}
          />
        )}

        {error && (
          <Message kind="error">
            {t(error)}
            {error === 'authErrorEmailNotConfirmed' && (
              <button type="button" onClick={resend} disabled={busy} className="block mt-1 underline">
                {t('authResendConfirmation')}
              </button>
            )}
          </Message>
        )}
        {info && <Message kind="info">{t(info)}</Message>}

        <button type="submit" disabled={busy} className={primaryClass}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t(submitKey)}
        </button>

        <div className="flex flex-col items-center gap-2 pt-1">
          {mode === 'signin' && (
            <>
              <button type="button" onClick={() => go('forgot')} className={linkClass}>
                {t('authForgotLink')}
              </button>
              <span className="text-xs text-[#8c8279]">
                {t('authNoAccount')}{' '}
                <button type="button" onClick={() => go('signup')} className={linkClass}>
                  {t('authSignUpLink')}
                </button>
              </span>
            </>
          )}
          {mode !== 'signin' && (
            <span className="text-xs text-[#8c8279]">
              {mode === 'signup' && `${t('authHaveAccount')} `}
              <button type="button" onClick={() => go('signin')} className={linkClass}>
                {mode === 'signup' ? t('authSignInLink') : t('authBackToSignIn')}
              </button>
            </span>
          )}
        </div>
      </form>
    </Shell>
  );
};

/** Shown after following a password-recovery link. */
const NewPasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { t, language, setLanguage } = useAuthT();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError('authErrorWeakPassword');
    setBusy(true);
    setError(null);
    const r = await updatePassword(password).catch(() => ({ ok: false as const, error: 'authErrorNetwork' }));
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.error);
  };

  return (
    <Shell t={t} language={language} setLanguage={setLanguage}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <h1 className="text-base font-semibold text-center">{t('authNewPasswordTitle')}</h1>
        <PasswordInput value={password} onChange={setPassword} placeholder={t('authPasswordNewPlaceholder')} autoComplete="new-password" t={t} />
        {error && <Message kind="error">{t(error)}</Message>}
        <button type="submit" disabled={busy} className={primaryClass}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t('authSavePassword')}
        </button>
      </form>
    </Shell>
  );
};

const CenterNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#191615] text-[#8c8279] px-6 text-center text-xs">
    <div className="w-14 h-14 rounded-full overflow-hidden bg-[#24201e] ring-1 ring-[#dfcfb3]/40 p-1 flex items-center justify-center">
      <img src="/icons/icon-192.png" alt="Shanyraq Hub" className="w-full h-full object-contain rounded-full" />
    </div>
    {children}
  </div>
);

export const AuthGate: React.FC<{ children: (account: LiveAccount) => React.ReactNode }> = ({ children }) => {
  const { t } = useAuthT();
  const [linkError] = useState(readLinkError);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(openedFromRecoveryLink);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(prev => (prev === undefined ? data.session : prev)));
    // Keep this callback synchronous: calling Supabase inside it can deadlock the auth client.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const email = session?.user.email ?? '';
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setProfileError(false);
    setSnapshot(null);
    loadOwnProfile(userId, email)
      .then(async p => {
        await liveApi.loadCatalog(); // tiers, shop, achievements from the database (before profiles are built)
        const snap = await liveApi.loadSnapshot(email, userId);
        if (cancelled) return;
        setProfile(p);
        setSnapshot(snap);
      })
      .catch(() => !cancelled && setProfileError(true));
    return () => {
      cancelled = true;
    };
  }, [userId, email, attempt]);

  if (!supabaseConfigured) return <CenterNote>{t('authNotConfigured')}</CenterNote>;
  if (session === undefined) return <CenterNote>{t('authLoading')}</CenterNote>;
  if (recovery && session) return <NewPasswordScreen onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen initialError={linkError} />;
  if (profileError) {
    return (
      <CenterNote>
        <span>{t('authProfileLoadFailed')}</span>
        <div className="flex gap-4">
          <button onClick={() => setAttempt(a => a + 1)} className={linkClass}>{t('authRetry')}</button>
          <button onClick={() => signOut()} className={linkClass}>{t('authSignOut')}</button>
        </div>
      </CenterNote>
    );
  }
  if (!profile || !snapshot || profile.id !== userId) return <CenterNote>{t('authLoading')}</CenterNote>;
  // key: a different account gets a fresh app state (its own local storage namespace).
  return <React.Fragment key={profile.id}>{children({ profile, signOut, snapshot, api: liveApi })}</React.Fragment>;
};

export default AuthGate;
