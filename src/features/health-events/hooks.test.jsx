import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/authContext";
import { healthEventService } from "@/services/healthEventService";
import { eventKeys, useHealthEventMutation, useHealthEvents } from "./hooks";
vi.mock("@/features/auth/authContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/healthEventService", () => ({
  healthEventService: { list: vi.fn() },
}));
describe("event query isolation and shared realtime prefixes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      profile: { id: "resident-a", role: "resident" },
    });
    healthEventService.list.mockResolvedValue({ items: [], total: 0 });
  });
  function setup() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    return {
      client,
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    };
  }
  it("cache keys are scoped to the logged-in profile", async () => {
    const { wrapper, client } = setup();
    const view = renderHook(() => useHealthEvents(), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(client.getQueryData(eventKeys.list("resident-a", {}))).toEqual({
      items: [],
      total: 0,
    });
    expect(
      client.getQueryData(eventKeys.list("resident-b", {})),
    ).toBeUndefined();
  });
  it("successful booking invalidates events, reports, bell and linked announcements", async () => {
    const { wrapper, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const operation = vi.fn().mockResolvedValue({ state: "confirmed" });
    const { result } = renderHook(() => useHealthEventMutation(operation), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ id: "event" }));
    for (const key of [
      ["appointments"],
      ["reports"],
      ["assistance", "notifications"],
      ["assistance", "announcements"],
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    expect(operation).toHaveBeenCalledTimes(1);
  });
  it("mutation errors are not automatically retried", async () => {
    const { wrapper } = setup();
    const operation = vi.fn().mockRejectedValue(new Error("capacity changed"));
    const { result } = renderHook(() => useHealthEventMutation(operation), {
      wrapper,
    });
    await act(async () => {
      await expect(result.current.mutateAsync({})).rejects.toThrow(
        "capacity changed",
      );
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
