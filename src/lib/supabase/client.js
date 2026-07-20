import { createClient } from "@supabase/supabase-js";

import { authStorage } from "@/lib/supabase/authStorage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export class SupabaseConfigurationError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to a local environment file before using Supabase services.",
    );
    this.name = "SupabaseConfigurationError";
  }
}

const hasSupabaseConfiguration = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = hasSupabaseConfiguration
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: authStorage,
      },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new SupabaseConfigurationError();
  }

  return supabase;
}

export { hasSupabaseConfiguration };
