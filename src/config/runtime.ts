/**
 * Runtime mode of the app. Two strictly separated data worlds:
 *
 *   VITE_DATA_SOURCE=demo (default)
 *     Fictional members, events, books, forum and chats for development and
 *     presentations. Clearly labelled "Демо" in the UI. Stored in the browser
 *     under its own keys.
 *
 *   VITE_DATA_SOURCE=live
 *     Real community data only. No demo record is ever loaded (the demo module
 *     is not even included in the build). Until the Supabase data layer is
 *     connected, live data lives in this browser only, under separate keys.
 *
 * Demo and live data never mix: different code path, different storage keys.
 */
export type DataSource = 'demo' | 'live';

// A plain comparison on purpose: Vite inlines the env value at build time, so a
// live build constant-folds this and drops the demo module entirely.
export const DATA_SOURCE: DataSource = import.meta.env.VITE_DATA_SOURCE === 'live' ? 'live' : 'demo';
export const isDemoData = DATA_SOURCE === 'demo';

/**
 * Test-account switcher (header → "Сменить тестовую роль"). Only with demo data:
 * on by default in local development, off in production builds unless
 * VITE_DEMO_MODE=true. Never available with live data.
 */
const switcherFlag = import.meta.env.VITE_DEMO_MODE as string | undefined;
export const canSwitchTestAccounts: boolean =
  isDemoData && (switcherFlag !== undefined ? switcherFlag === 'true' : import.meta.env.DEV);

/** Browser storage namespace per data source, so demo and live never share records. */
export const STORAGE_KEY = isDemoData ? 'shanyraq_hub_app_state_v1' : 'shanyraq_hub_live_v1';
