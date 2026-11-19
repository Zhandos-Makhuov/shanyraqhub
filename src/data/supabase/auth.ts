/**
 * Account actions for live mode (Supabase Auth): sign-up with e-mail confirmation,
 * sign-in, password recovery, sign-out, and loading the signed-in member's profile.
 *
 * Every function returns a translation key for errors (auth*), never raw server text,
 * so the screen stays in the member's language and never leaks internals.
 */
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from './client';
import { profileFromRows } from './adapters';
import type { ProfileRow, UserBalanceRow, UserRoleRow } from './rows';
import type { UserProfile } from '../../types';

export const MIN_PASSWORD_LENGTH = 8;

export type AuthResult = { ok: true } | { ok: false; error: string };

/** Where e-mail links (confirmation, recovery) bring the member back. Must be in Supabase → Auth → URL Configuration. */
const redirectUrl = () => `${window.location.origin}/`;

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

/** Maps Supabase Auth errors to translation keys. */
export const authErrorKey = (error: AuthError | Error | null | undefined): string => {
  if (!error) return 'authErrorGeneric';
  const code = 'code' in error ? (error.code as string | undefined) : undefined;
  const msg = error.message?.toLowerCase() ?? '';
  switch (code) {
    case 'invalid_credentials': return 'authErrorInvalidCredentials';
    case 'email_not_confirmed': return 'authErrorEmailNotConfirmed';
    case 'user_already_exists':
    case 'email_exists': return 'authErrorEmailTaken';
    case 'weak_password': return 'authErrorWeakPassword';
    case 'same_password': return 'authErrorSamePassword';
    case 'email_address_invalid':
    case 'validation_failed': return 'authErrorEmailInvalid';
    case 'email_address_not_authorized': return 'authErrorEmailNotAuthorized';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'authErrorRateLimit';
    case 'signup_disabled': return 'authErrorSignupDisabled';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || error.name === 'AuthRetryableFetchError') return 'authErrorNetwork';
  if (msg.includes('rate limit')) return 'authErrorRateLimit';
  if (msg.includes('error sending')) return 'authErrorEmailSend';
  return 'authErrorGeneric';
};

export const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const signUp = async (name: string, email: string, password: string): Promise<AuthResult> => {
  const { data, error } = await client().auth.signUp({
    email: email.trim(),
    password,
    // display_name is read by the sign-up trigger (private.handle_new_user); the handle is generated.
    options: { emailRedirectTo: redirectUrl(), data: { display_name: name.trim() } },
  });
  if (error) return { ok: false, error: authErrorKey(error) };
  // With e-mail confirmation on, Supabase hides existing accounts: it "succeeds" with no identities.
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { ok: false, error: 'authErrorEmailTaken' };
  return { ok: true };
};

export const signIn = async (email: string, password: string): Promise<AuthResult> => {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
};

export const resendConfirmation = async (email: string): Promise<AuthResult> => {
  const { error } = await client().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectUrl() } });
  return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
};

/** Always reports success for unknown e-mails too (Supabase does the same): no account enumeration. */
export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() });
  return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
};

export const updatePassword = async (password: string): Promise<AuthResult> => {
  const { error } = await client().auth.updateUser({ password });
  return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
};

export const signOut = async (): Promise<void> => {
  // 'local' signs out this browser only; other devices keep their sessions.
  await client().auth.signOut({ scope: 'local' });
};

/** The signed-in member's profile, role and balance (created by the sign-up trigger). */
export const loadOwnProfile = async (userId: string, email: string): Promise<UserProfile> => {
  const db = client();
  const [profile, role, balance] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).single<ProfileRow>(),
    db.from('user_roles').select('user_id, role').eq('user_id', userId).maybeSingle<UserRoleRow>(),
    db.from('user_balances').select('user_id, xp, coins').eq('user_id', userId).maybeSingle<UserBalanceRow>(),
  ]);
  if (profile.error) throw profile.error;
  return profileFromRows(profile.data, {
    email,
    roles: role.data ? [role.data] : [],
    balances: balance.data ? [balance.data] : [],
  });
};
