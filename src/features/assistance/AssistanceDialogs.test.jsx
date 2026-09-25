import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AnnouncementDialog,
  InquiryCreateDialog,
} from "@/features/assistance/AssistanceDialogs";

function mutation(overrides = {}) {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({ id: "one" }),
    ...overrides,
  };
}

describe("assistance dialogs", () => {
  it("defaults new announcements to Publish now", () => {
    render(
      <AnnouncementDialog open onOpenChange={vi.fn()} mutation={mutation()} />,
    );

    expect(screen.getByRole("checkbox", { name: "Publish now" })).toBeChecked();
    expect(
      screen.queryByLabelText("Scheduled publication date and time"),
    ).not.toBeInTheDocument();
  });

  it("submits publication and event inputs as Asia/Manila instants", async () => {
    const user = userEvent.setup();
    const save = mutation();
    const onSaved = vi.fn();
    render(
      <AnnouncementDialog
        open
        onOpenChange={vi.fn()}
        mutation={save}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByLabelText("Title"), "Scheduled advisory");
    await user.type(
      screen.getByLabelText("Content"),
      "The health center will publish this advisory later.",
    );
    await user.click(screen.getByRole("checkbox", { name: "Publish now" }));
    fireEvent.change(
      screen.getByLabelText("Scheduled publication date and time"),
      { target: { value: "2026-08-16T09:30" } },
    );
    fireEvent.change(screen.getByLabelText("Event date and time"), {
      target: { value: "2026-08-17T13:45" },
    });
    fireEvent.change(
      screen.getByLabelText("Event end date and time (optional)"),
      { target: { value: "2026-08-17T15:00" } },
    );
    fireEvent.change(screen.getByLabelText("Expiration date and time"), {
      target: { value: "2026-08-17T17:00" },
    });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        publish_now: false,
        publish_at: "2026-08-16T01:30:00.000Z",
        event_start_at: "2026-08-17T05:45:00.000Z",
        event_end_at: "2026-08-17T07:00:00.000Z",
        expires_at: "2026-08-17T09:00:00.000Z",
      }),
    );
    expect(onSaved).toHaveBeenCalledWith({
      isNew: true,
      publishAt: "2026-08-16T01:30:00.000Z",
      publishNow: false,
    });
  });

  it("keeps a published announcement's timestamp during edit", async () => {
    const user = userEvent.setup();
    const save = mutation();
    render(
      <AnnouncementDialog
        open
        onOpenChange={vi.fn()}
        record={{
          id: "announcement-one",
          title: "Published advisory",
          category: "general",
          content: "Already available to Residents.",
          publish_at: "2020-08-16T01:30:00.000Z",
          event_start_at: null,
          event_end_at: null,
          expires_at: null,
          is_pinned: false,
          version: 2,
        }}
        mutation={save}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "Publish now" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "announcement-one",
        publish_now: true,
        publish_at: "2020-08-16T01:30:00.000Z",
      }),
    );
  });

  it("exposes accessible inquiry labels and keeps the draft through focus changes", async () => {
    const user = userEvent.setup();
    render(
      <InquiryCreateDialog open onOpenChange={vi.fn()} mutation={mutation()} />,
    );
    const subject = screen.getByLabelText("Subject");
    await user.type(subject, "Clinic schedule");
    fireEvent.blur(window);
    fireEvent.focus(window);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(subject).toHaveValue("Clinic schedule");
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });

  it("closes only after a successful valid submission", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const save = mutation();
    render(
      <InquiryCreateDialog open onOpenChange={onOpenChange} mutation={save} />,
    );
    await user.type(screen.getByLabelText("Subject"), "Clinic schedule");
    await user.type(
      screen.getByLabelText("Message"),
      "What time does the clinic open?",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Clinic schedule",
        message: "What time does the clinic open?",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
