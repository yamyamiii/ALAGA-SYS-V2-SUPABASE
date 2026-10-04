import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/authContext";
import {
  invalidateRealtimeTopic,
  REALTIME_TOPICS,
  reconcileCriticalQueries,
} from "@/features/realtime/realtimeSync";
import {
  residentHealthHistoryKeys,
  useResidentHealthHistory,
  useResidentHealthHistoryEntry,
} from "@/features/resident-health-history/hooks";
import { residentHealthHistoryService } from "@/services/residentHealthHistoryService";

vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/residentHealthHistoryService", () => ({
  residentHealthHistoryService: { list: vi.fn(), get: vi.fn() },
}));
const id = "30000000-0000-4000-8000-000000000001";
const filters = { page: 1, page_size: 20 };
function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}
beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    isAuthenticated: true,
    profile: { id: "profile-one", role: "resident" },
  });
  residentHealthHistoryService.list.mockResolvedValue({ items: [], total: 0 });
  residentHealthHistoryService.get.mockResolvedValue({
    status: "finalized",
    summary: {},
  });
});
describe("private Resident health history cache", () => {
  it("keys reads by current account and never forwards it as identity authority", async () => {
    const { wrapper, queryClient } = setup();
    const view = renderHook(() => useResidentHealthHistory(filters), {
      wrapper,
    });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(residentHealthHistoryService.list).toHaveBeenCalledExactlyOnceWith(
      filters,
    );
    expect(
      queryClient.getQueryData(
        residentHealthHistoryKeys.list("profile-one", filters),
      ),
    ).toEqual({ items: [], total: 0 });
    view.unmount();
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
    );
  });
  it("enables list and detail for the validated normalized Resident profile", async () => {
    expect(useAuth().profile).not.toHaveProperty("account_status");
    expect(useAuth().profile).not.toHaveProperty("retired_at");
    const { wrapper } = setup();
    const view = renderHook(
      () => ({
        list: useResidentHealthHistory(filters),
        detail: useResidentHealthHistoryEntry(id),
      }),
      { wrapper },
    );
    await waitFor(() => {
      expect(view.result.current.list.isSuccess).toBe(true);
      expect(view.result.current.detail.isSuccess).toBe(true);
    });
    expect(residentHealthHistoryService.list).toHaveBeenCalledExactlyOnceWith(
      filters,
    );
    expect(residentHealthHistoryService.get).toHaveBeenCalledExactlyOnceWith(
      id,
    );
  });
  it.each([null, { id: "profile-one", role: "resident" }])(
    "does not request history without validated authentication (profile %j)",
    (profile) => {
      useAuth.mockReturnValue({ isAuthenticated: false, profile });
      const { wrapper } = setup();
      renderHook(
        () => {
          useResidentHealthHistory(filters);
          useResidentHealthHistoryEntry(id);
        },
        { wrapper },
      );
      expect(residentHealthHistoryService.list).not.toHaveBeenCalled();
      expect(residentHealthHistoryService.get).not.toHaveBeenCalled();
    },
  );
  it("does not reuse another account's data during an account change", async () => {
    const { wrapper } = setup();
    residentHealthHistoryService.list.mockResolvedValueOnce({
      items: [{ id }],
      total: 1,
    });
    const view = renderHook(() => useResidentHealthHistory(filters), {
      wrapper,
    });
    await waitFor(() => expect(view.result.current.data.total).toBe(1));
    useAuth.mockReturnValue({
      isAuthenticated: true,
      profile: {
        id: "profile-two",
        role: "resident",
      },
    });
    residentHealthHistoryService.list.mockReturnValue(new Promise(() => {}));
    view.rerender();
    expect(view.result.current.data).toBeUndefined();
  });
  it.each(["admin", "nurse", "midwife", "barangay_health_worker"])(
    "does not send personal-history requests for %s",
    (role) => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        profile: { id: "profile-one", role },
      });
      const { wrapper } = setup();
      renderHook(
        () => {
          useResidentHealthHistory(filters);
          useResidentHealthHistoryEntry(id);
        },
        { wrapper },
      );
      expect(residentHealthHistoryService.list).not.toHaveBeenCalled();
      expect(residentHealthHistoryService.get).not.toHaveBeenCalled();
    },
  );
  it("does not retry permission errors or convert them to empty history", async () => {
    residentHealthHistoryService.list.mockRejectedValue(
      Object.assign(new Error("Access unavailable"), {
        code: "permission_denied",
      }),
    );
    const { wrapper } = setup();
    const view = renderHook(() => useResidentHealthHistory(filters), {
      wrapper,
    });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.data).toBeUndefined();
    expect(residentHealthHistoryService.list).toHaveBeenCalledOnce();
  });
  it("private finalization invalidation refetches list/detail without clinical event content", async () => {
    const { wrapper, queryClient } = setup();
    const view = renderHook(
      () => ({
        list: useResidentHealthHistory(filters),
        detail: useResidentHealthHistoryEntry(id),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(view.result.current.detail.isSuccess).toBe(true),
    );
    const invalidated = vi.spyOn(queryClient, "invalidateQueries");
    await act(async () =>
      invalidateRealtimeTopic(queryClient, REALTIME_TOPICS.HEALTH_HISTORY),
    );
    expect(invalidated).toHaveBeenCalledExactlyOnceWith({
      queryKey: ["resident-health-history"],
      exact: false,
      refetchType: "active",
    });
    expect(residentHealthHistoryService.list).toHaveBeenCalledTimes(2);
    expect(residentHealthHistoryService.get).toHaveBeenCalledTimes(2);
  });
  it.each([
    REALTIME_TOPICS.REGISTRY,
    REALTIME_TOPICS.PROFILE,
    REALTIME_TOPICS.APPOINTMENT,
  ])("reconciles identity/completed-service changes for %s", async (topic) => {
    const { queryClient } = setup();
    queryClient.setQueryData(
      residentHealthHistoryKeys.list("profile-one", filters),
      { total: 1 },
    );
    await invalidateRealtimeTopic(queryClient, topic);
    expect(
      queryClient.getQueryState(
        residentHealthHistoryKeys.list("profile-one", filters),
      ).isInvalidated,
    ).toBe(true);
  });
  it("focus/reconnect reconciliation includes health history", async () => {
    const { queryClient } = setup();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    await reconcileCriticalQueries(queryClient);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: residentHealthHistoryKeys.all }),
    );
  });
});
