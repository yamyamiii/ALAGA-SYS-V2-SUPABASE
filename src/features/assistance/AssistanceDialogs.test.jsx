import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InquiryCreateDialog } from "@/features/assistance/AssistanceDialogs";

function mutation(overrides = {}) {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({ id: "one" }),
    ...overrides,
  };
}

describe("assistance dialogs", () => {
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
