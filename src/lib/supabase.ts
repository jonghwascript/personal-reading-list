import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * supabase-js wants the project root URL. Accept the REST endpoint too ("…/rest/v1/"), which is
 * what the dashboard's API page shows next to the key and is easy to paste by mistake.
 */
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  ?.trim()
  .replace(/\/rest\/v1\/?$/, '')
  .replace(/\/+$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the project isn't configured; the app then runs guest-only. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * The Supabase SDK is ~270 KB, so it's loaded on demand in its own chunk. The landing page and
 * guest library render without waiting for it; the session check runs in the background.
 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!isSupabaseConfigured) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } }),
  );
  return clientPromise;
}
