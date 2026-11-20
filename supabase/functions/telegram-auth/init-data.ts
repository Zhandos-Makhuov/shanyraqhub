// Verification of Telegram Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// Pure Web Crypto: runs in Supabase Edge Functions (Deno) and in Node tests.

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

const hmac = async (key: ArrayBuffer | Uint8Array<ArrayBuffer>, data: string) => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
};

/** Constant-time comparison of two hex strings. */
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/**
 * Returns the Telegram user if initData was signed by this bot and is fresh, otherwise throws.
 * secret_key = HMAC_SHA256(key = "WebAppData", data = bot_token); hash = HMAC_SHA256(secret_key, data_check_string).
 */
export const verifyInitData = async (initData: string, botToken: string, maxAgeSeconds = 24 * 3600, now = Date.now()): Promise<TelegramUser> => {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('init_data_invalid');
  params.delete('hash');
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const expected = hex(await hmac(secret, dataCheckString));
  if (!safeEqual(expected, hash)) throw new Error('init_data_invalid');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > maxAgeSeconds) throw new Error('init_data_expired');
  const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null;
  if (!user || typeof user.id !== 'number') throw new Error('init_data_invalid');
  return user;
};

/** Test helper / reference: signs initData the way Telegram does. */
export const signInitData = async (fields: Record<string, string>, botToken: string): Promise<string> => {
  const dataCheckString = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  const hash = hex(await hmac(secret, dataCheckString));
  return new URLSearchParams({ ...fields, hash }).toString();
};
