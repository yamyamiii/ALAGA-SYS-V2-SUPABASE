import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  assistanceKeys,
  useAssistanceMutation,
} from "@/features/assistance/hooks";

describe("assistance query consistency", () => {
  it("invalidates dashboard, bell, and page notification variants after marking one read", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const dashboardKey = assistanceKeys.notifications({
      unread_only: false,
      page: 1,
      page_size: 10,
    });
    const bellKey = assistanceKeys.notifications({
      unread_only: false,
      page: 1,
      page_size: 1,
    });
    const unreadPageKey = assistanceKeys.notifications({
      unread_only: true,
      page: 1,
      page_size: 20,
    });
    for (const key of [dashboardKey, bellKey, unreadPageKey]) {
      client.setQueryData(key, { items: [], unread: 2 });
    }

    const mutation = vi.fn().mockResolvedValue(undefined);
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssistanceMutation(mutation), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync("notification-one");
    });

    expect(mutation).toHaveBeenCalledWith(
      "notification-one",
      expect.anything(),
    );
    for (const key of [dashboardKey, bellKey, unreadPageKey]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("invalidates normal announcement lists after a successful archive", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const currentAnnouncements = assistanceKeys.announcements({
      search: "",
      category: "",
      include_archived: false,
      page: 1,
      page_size: 20,
    });
    const archivedAnnouncements = assistanceKeys.announcements({
      search: "",
      category: "",
      include_archived: true,
      page: 1,
      page_size: 20,
    });
    const bellNotifications = assistanceKeys.notifications({
      unread_only: false,
      page: 1,
      page_size: 1,
    });
    client.setQueryData(currentAnnouncements, { items: [{ id: "one" }] });
    client.setQueryData(archivedAnnouncements, { items: [{ id: "one" }] });
    client.setQueryData(bellNotifications, { items: [], unread: 1 });

    const archive = vi.fn().mockResolvedValue(2);
    const wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAssistanceMutation(archive), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ id: "one", version: 1 });
    });

    expect(client.getQueryState(currentAnnouncements)?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(archivedAnnouncements)?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(bellNotifications)?.isInvalidated).toBe(true);
  });
});
