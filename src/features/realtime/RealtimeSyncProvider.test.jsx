import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appointmentKeys } from "@/features/appointments/hooks";
import { assistanceKeys } from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { RealtimeSyncProvider } from "@/features/realtime/RealtimeSyncProvider";
import {
  invalidateRealtimeTopic,
  REALTIME_TOPICS,
  rememberRealtimeEvent,
} from "@/features/realtime/realtimeSync";
import { reportKeys } from "@/features/reports/hooks";
import { getSupabaseClient } from "@/lib/supabase/client";

vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));

function realtimeClient() {
  let eventHandler;
  let statusHandler;
  const channel = {
    on: vi.fn((_kind, _filter, handler) => {
      eventHandler = handler;
      return channel;
    }),
    subscribe: vi.fn((handler) => {
      statusHandler = handler;
      return channel;
    }),
  };
  const scheduledEvents = [];
  const scheduledQuery = {
    select: vi.fn(() => scheduledQuery),
    gt: vi.fn(() => scheduledQuery),
    order: vi.fn(() => scheduledQuery),
    limit: vi.fn(() => Promise.resolve({ data: scheduledEvents, error: null })),
  };
  return {
    channel,
    scheduledEvents,
    scheduledQuery,
    client: {
      channel: vi.fn(() => channel),
      from: vi.fn(() => scheduledQuery),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    },
    emit(record) {
      eventHandler({ new: record });
    },
    connect() {
      statusHandler("SUBSCRIBED");
    },
  };
}

function renderProvider(auth, realtime) {
  useAuth.mockReturnValue(auth);
  getSupabaseClient.mockReturnValue(realtime.client);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RealtimeSyncProvider>
        <div>Realtime child</div>
      </RealtimeSyncProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, invalidate };
}

describe("realtime state synchronization", () => {
  it("refreshes pending registration matches when a registry identity is restored", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.REGISTRY);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["resident-registration-requests"],
        exact: false,
      }),
    );
  });
  beforeEach(() => vi.clearAllMocks());

  it("maps appointment events to the whole appointment query family", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.APPOINTMENT);

    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["appointments"], exact: false }),
    );
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["reports"], exact: false }),
    );
  });

  it("invalidates list, detail, schedule, queue, completion, and dashboard views together", async () => {
    const queryClient = new QueryClient();
    const keys = [
      appointmentKeys.list({ page: 1 }),
      appointmentKeys.detail("appointment-id"),
      appointmentKeys.calendar({ month: "2026-09" }),
      appointmentKeys.queue({ date: "2026-09-27" }),
      appointmentKeys.dashboard,
      appointmentKeys.residentRequests,
      reportKeys.dashboard("2026-09-27"),
    ];
    for (const key of keys) queryClient.setQueryData(key, { current: true });

    await invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.APPOINTMENT);

    for (const key of keys) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("reconciles notification and announcement caches independently", async () => {
    const queryClient = new QueryClient();
    const notificationKey = assistanceKeys.notifications({ unread_only: true });
    const announcementKey = assistanceKeys.announcements({ page: 1 });
    queryClient.setQueryData(notificationKey, { unread: 1 });
    queryClient.setQueryData(announcementKey, { items: [] });

    await invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.NOTIFICATION);
    expect(queryClient.getQueryState(notificationKey)?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(announcementKey)?.isInvalidated).toBe(
      false,
    );

    await invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.ANNOUNCEMENT);
    expect(queryClient.getQueryState(announcementKey)?.isInvalidated).toBe(
      true,
    );
  });

  it.each([
    REALTIME_TOPICS.PROFILE,
    REALTIME_TOPICS.REGISTRATION,
    REALTIME_TOPICS.REGISTRY,
    REALTIME_TOPICS.APPOINTMENT,
    REALTIME_TOPICS.NOTIFICATION,
    REALTIME_TOPICS.ANNOUNCEMENT,
  ])(
    "invalidates authoritative query families for %s events",
    async (topic) => {
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      await invalidateRealtimeTopic(queryClient, topic);

      expect(invalidate).toHaveBeenCalled();
      expect(
        invalidate.mock.calls.every(([options]) => options.exact === false),
      ).toBe(true);
    },
  );

  it("deduplicates bounded event identifiers", () => {
    const seen = new Set();
    expect(rememberRealtimeEvent(seen, 1, 2)).toBe(true);
    expect(rememberRealtimeEvent(seen, 1, 2)).toBe(false);
    expect(rememberRealtimeEvent(seen, 2, 2)).toBe(true);
    expect(rememberRealtimeEvent(seen, 3, 2)).toBe(true);
    expect([...seen]).toEqual([2, 3]);
  });

  it("subscribes once, invalidates on an event, and ignores a duplicate", async () => {
    const realtime = realtimeClient();
    const auth = {
      profile: { id: "profile-one" },
      pendingProfileId: null,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
    };
    const view = renderProvider(auth, realtime);
    expect(realtime.client.channel).toHaveBeenCalledTimes(1);
    realtime.connect();
    view.invalidate.mockClear();

    act(() => {
      realtime.emit({
        id: 44,
        topic: REALTIME_TOPICS.APPOINTMENT,
        audience_profile_id: "profile-one",
        available_at: new Date(0).toISOString(),
      });
      realtime.emit({
        id: 44,
        topic: REALTIME_TOPICS.APPOINTMENT,
        audience_profile_id: "profile-one",
        available_at: new Date(0).toISOString(),
      });
    });

    await waitFor(() => expect(view.invalidate).toHaveBeenCalledTimes(2));
    expect(view.invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["appointments"] }),
    );
    expect(view.invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["reports"] }),
    );
    view.unmount();
    expect(realtime.client.removeChannel).toHaveBeenCalledWith(
      realtime.channel,
    );
  });

  it("revalidates a targeted account event without exposing row data", async () => {
    const realtime = realtimeClient();
    const auth = {
      profile: { id: "profile-one" },
      pendingProfileId: null,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
    };
    renderProvider(auth, realtime);
    await act(async () => realtime.connect());
    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled());
    auth.refreshProfile.mockClear();

    act(() => {
      realtime.emit({
        id: 45,
        topic: REALTIME_TOPICS.PROFILE,
        entity_id: "profile-one",
        audience_profile_id: "profile-one",
        available_at: new Date(0).toISOString(),
      });
    });

    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalledOnce());
  });

  it("reconciles authoritative queries after reconnect and window focus", async () => {
    const realtime = realtimeClient();
    const auth = {
      profile: { id: "profile-one" },
      pendingProfileId: null,
      refreshProfile: vi.fn().mockResolvedValue(undefined),
    };
    const view = renderProvider(auth, realtime);
    await act(async () => realtime.connect());
    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled());
    view.invalidate.mockClear();
    auth.refreshProfile.mockClear();

    await act(async () => realtime.connect());
    await waitFor(() => expect(view.invalidate).toHaveBeenCalled());
    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled());

    view.invalidate.mockClear();
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(view.invalidate).toHaveBeenCalled());
  });

  it("uses the pending profile's own authorized channel for approval", () => {
    const realtime = realtimeClient();
    renderProvider(
      {
        profile: null,
        pendingProfileId: "pending-profile",
        refreshProfile: vi.fn().mockResolvedValue(undefined),
      },
      realtime,
    );

    expect(realtime.client.channel).toHaveBeenCalledWith(
      "alaga-state-sync:pending-profile",
    );
  });

  it("replays RLS-filtered future events after subscribing", async () => {
    vi.useFakeTimers();
    const realtime = realtimeClient();
    realtime.scheduledEvents.push({
      id: 46,
      topic: REALTIME_TOPICS.NOTIFICATION,
      audience_profile_id: "profile-one",
      available_at: new Date(Date.now() + 1_000).toISOString(),
    });
    const view = renderProvider(
      {
        profile: { id: "profile-one" },
        pendingProfileId: null,
        refreshProfile: vi.fn().mockResolvedValue(undefined),
      },
      realtime,
    );

    await act(async () => realtime.connect());
    await act(async () => Promise.resolve());
    expect(realtime.client.from).toHaveBeenCalledWith("realtime_sync_events");
    expect(realtime.scheduledQuery.gt).toHaveBeenCalledWith(
      "available_at",
      expect.any(String),
    );

    view.invalidate.mockClear();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(view.invalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["assistance", "notifications"],
      }),
    );
    view.unmount();
    vi.useRealTimers();
  });
});
