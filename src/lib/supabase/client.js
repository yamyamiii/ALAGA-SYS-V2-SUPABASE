import { createClient } from "@supabase/supabase-js";

import { authStorage } from "@/lib/supabase/authStorage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const NETWORK_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(input, init = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort(new DOMException("Request timed out.", "TimeoutError"));
  }, NETWORK_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) {
    abortFromCaller();
  } else {
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

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
      global: { fetch: fetchWithTimeout },
    })
  : null;

export function getSupabaseClient() {
  if (!supabase) {
    throw new SupabaseConfigurationError();
  }

  return supabase;
}

export { hasSupabaseConfiguration };
