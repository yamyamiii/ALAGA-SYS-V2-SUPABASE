import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWithTimeout, NETWORK_TIMEOUT_MS } from "@/lib/supabase/client";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function pendingFetch(_input, init) {
  return new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), {
      once: true,
    });
  });
}

describe("Supabase fetch boundary", () => {
  it("aborts a stalled request at the shared timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(pendingFetch));

    const request = expect(fetchWithTimeout("/stalled")).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);

    await request;
  });

  it("preserves cancellation requested by a caller", async () => {
    vi.stubGlobal("fetch", vi.fn(pendingFetch));
    const caller = new AbortController();
    const reason = new DOMException("Cancelled by caller.", "AbortError");

    const request = expect(
      fetchWithTimeout("/cancelled", { signal: caller.signal }),
    ).rejects.toBe(reason);
    caller.abort(reason);

    await request;
  });
});
