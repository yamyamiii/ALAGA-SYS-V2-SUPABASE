import { getSupabaseClient } from "@/lib/supabase/client";

export function createHealthEventService(getClient = getSupabaseClient) {
  async function rpc(name, parameters) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await getClient()
        .rpc(name, parameters)
        .abortSignal(controller.signal);
      if (error) throw error;
      return data;
    } catch (error) {
      const messages = {
        42501:
          "You do not have permission to perform this event action. An active linked Resident record is required for booking.",
        40001: "This event or booking changed. Refresh and try again.",
        "23P01":
          "Participating staff have a conflicting schedule. Choose another window or team.",
        P0001:
          "The event is full or staff capacity is unavailable. You may join the waitlist.",
        P0002: "This event or booking is no longer available.",
        23514:
          "The event action is not eligible. Check the schedule, staff, capacity and booking status.",
      };
      const failure = new Error(
        controller.signal.aborted
          ? "The request timed out. Refresh before retrying."
          : (messages[error.code] ??
              "The event request could not be completed. Check your connection and try again."),
      );
      failure.code = error.code;
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    list: ({
      page = 1,
      page_size = 20,
      include_archived = false,
      event_id = null,
    } = {}) => {
      const size = Math.min(
        50,
        Math.max(1, Math.trunc(Number(page_size) || 20)),
      );
      return rpc("health_event_list", {
        p_include_archived: include_archived,
        p_event_id: event_id,
        p_limit: size,
        p_offset: (Math.max(1, Math.trunc(Number(page) || 1)) - 1) * size,
      });
    },
    save: (record, values, requestKey) =>
      rpc("health_event_save", {
        p_id: record?.id ?? null,
        p_expected_version: record?.version ?? null,
        p_title: values.title.trim(),
        p_service_type: values.service_type,
        p_event_date: values.event_date,
        p_start_time: values.start_time,
        p_end_time: values.end_time,
        p_capacity: Number(values.capacity),
        p_staff_ids: values.staff_ids,
        p_publish: values.publish,
        p_notify: values.notify,
        p_request_key: requestKey,
      }),
    book: (id, requestKey, waitlist = false) =>
      rpc("health_event_book", {
        p_event_id: id,
        p_request_key: requestKey,
        p_join_waitlist: waitlist,
      }),
    cancelBooking: (booking, reason) =>
      rpc("health_event_cancel_booking", {
        p_booking_id: booking.id,
        p_expected_version: booking.version,
        p_reason: reason?.trim() || null,
      }),
    setStatus: (event, action) =>
      rpc("health_event_set_status", {
        p_event_id: event.id,
        p_expected_version: event.version,
        p_action: action,
      }),
    queue: (id) => rpc("health_event_queue", { p_event_id: id }),
    transition: (booking, action) =>
      rpc("health_event_transition_booking", {
        p_booking_id: booking.id,
        p_expected_version: booking.version,
        p_action: action,
      }),
    announcementLinks: (ids) =>
      rpc("health_event_announcement_links", { p_ids: ids }),
    report: (from, to) =>
      rpc("health_event_report", { p_date_from: from, p_date_to: to }),
    history: (id) => rpc("health_event_history_list", { p_event_id: id }),
  };
}
export const healthEventService = createHealthEventService();
