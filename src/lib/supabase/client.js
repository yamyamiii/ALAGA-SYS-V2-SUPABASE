import { createClient } from "@supabase/supabase-js";

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

// The client is intentionally not imported by the UI during Phase 0. No query is made.
export const supabase = hasSupabaseConfiguration
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new SupabaseConfigurationError();
  }

  return supabase;
}

export { hasSupabaseConfiguration };
