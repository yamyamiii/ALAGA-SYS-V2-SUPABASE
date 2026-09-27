import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "@/features/auth/authContext";
import {
  invalidateRealtimeTopic,
  REALTIME_TOPICS,
  reconcileCriticalQueries,
  rememberRealtimeEvent,
} from "@/features/realtime/realtimeSync";
import { getSupabaseClient } from "@/lib/supabase/client";

const RECONCILE_THROTTLE_MS = 30_000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const SCHEDULED_EVENT_REPLAY_LIMIT = 256;

export function RealtimeSyncProvider({ children }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const seenEventIds = useRef(new Set());
  const scheduledTimers = useRef(new Map());
  const sessionRefreshPending = useRef(false);
  const sessionRefreshQueued = useRef(false);
  const lastReconciledAt = useRef(0);
  const profileId = auth.profile?.id ?? auth.pendingProfileId ?? null;
  const refreshProfile = auth.refreshProfile;

  const refreshCurrentSession = useCallback(async () => {
    if (sessionRefreshPending.current) {
      sessionRefreshQueued.current = true;
      return;
    }
    sessionRefreshPending.current = true;
    try {
      await refreshProfile();
    } finally {
      sessionRefreshPending.current = false;
      if (sessionRefreshQueued.current) {
        sessionRefreshQueued.current = false;
        void refreshCurrentSession();
      }
    }
  }, [refreshProfile]);

  const reconcile = useCallback(
    ({ force = false } = {}) => {
      const now = Date.now();
      if (!force && now - lastReconciledAt.current < RECONCILE_THROTTLE_MS) {
        return;
      }
      lastReconciledAt.current = now;
      void reconcileCriticalQueries(queryClient);
      void refreshCurrentSession();
    },
    [queryClient, refreshCurrentSession],
  );

  useEffect(() => {
    if (!profileId) return undefined;
    const onFocus = () => reconcile();
    const onOnline = () => reconcile({ force: true });
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reconcile();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [profileId, reconcile]);

  useEffect(() => {
    if (!profileId) return undefined;

    const supabase = getSupabaseClient();
    const eventIds = seenEventIds.current;
    const timers = scheduledTimers.current;
    let connectedBefore = false;
    let active = true;

    function applyEvent(record) {
      if (!active) return;
      void invalidateRealtimeTopic(queryClient, record.topic);
      if (
        record.audience_profile_id === profileId &&
        [REALTIME_TOPICS.PROFILE, REALTIME_TOPICS.REGISTRATION].includes(
          record.topic,
        )
      ) {
        void refreshCurrentSession();
      }
    }

    function scheduleEvent(record) {
      const targetTime = new Date(record.available_at).getTime();
      const delay = Number.isFinite(targetTime)
        ? Math.max(0, targetTime - Date.now())
        : 0;
      if (delay === 0) {
        applyEvent(record);
        return;
      }

      const scheduleNext = (remaining) => {
        const timerId = window.setTimeout(
          () => {
            if (remaining > MAX_TIMER_DELAY_MS) {
              scheduleNext(remaining - MAX_TIMER_DELAY_MS);
            } else {
              timers.delete(record.id);
              applyEvent(record);
            }
          },
          Math.min(remaining, MAX_TIMER_DELAY_MS),
        );
        timers.set(record.id, timerId);
      };
      scheduleNext(delay);
    }

    async function replayScheduledEvents() {
      const { data, error } = await supabase
        .from("realtime_sync_events")
        .select(
          "id, topic, entity_id, audience_profile_id, audience_role, available_at",
        )
        .gt("available_at", new Date().toISOString())
        .order("available_at", { ascending: true })
        .limit(SCHEDULED_EVENT_REPLAY_LIMIT);

      if (!active) return;
      if (error) {
        console.warn("[ALAGA-SYS realtime diagnostic]", {
          operation: "scheduled_event_replay",
          code: error.code ?? "unknown",
        });
        return;
      }

      for (const record of data ?? []) {
        if (rememberRealtimeEvent(eventIds, record.id)) {
          scheduleEvent(record);
        }
      }
    }

    const channel = supabase
      .channel(`alaga-state-sync:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "realtime_sync_events",
        },
        ({ new: record }) => {
          if (rememberRealtimeEvent(eventIds, record?.id)) {
            scheduleEvent(record);
          }
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        void replayScheduledEvents();
        reconcile({ force: connectedBefore });
        connectedBefore = true;
      });

    return () => {
      active = false;
      for (const timerId of timers.values()) {
        window.clearTimeout(timerId);
      }
      timers.clear();
      eventIds.clear();
      void supabase.removeChannel(channel);
    };
  }, [profileId, queryClient, reconcile, refreshCurrentSession]);

  return children;
}
