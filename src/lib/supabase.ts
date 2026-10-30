import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from './config';

let client: SupabaseClient | null = null;

/** Returns the Supabase client, or null when the backend is not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(supabaseConfig.url!, supabaseConfig.anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Convenience: the client when configured, else null. */
export const supabase = getSupabase();
