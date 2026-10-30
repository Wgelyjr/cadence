/**
 * Client configuration.
 *
 * Supabase is OPTIONAL. When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
 * are not set, BabyApp runs fully local (data lives in IndexedDB on this
 * device). When they are set, the app syncs across devices and caregivers.
 */
export const supabaseConfig = {
  url: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || undefined,
  anonKey:
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || undefined,
};

export const isSupabaseConfigured = Boolean(
  supabaseConfig.url && supabaseConfig.anonKey,
);

/** Barry is only usable when a backend (edge function) is configured. */
export const isBarryAvailable = isSupabaseConfigured;
