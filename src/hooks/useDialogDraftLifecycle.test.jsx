import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";

function DraftHarness({ open, draftKey, source, onReset = vi.fn() }) {
  const [value, setValue] = useState(source);

  useDialogDraftLifecycle({
    open,
    draftKey,
    resetDraft: () => {
      setValue(source);
      onReset();
    },
  });

  return open ? (
    <label>
      Draft
      <input
        aria-label="Draft"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </label>
  ) : null;
}

describe("useDialogDraftLifecycle", () => {
  it("preserves an open draft across focus changes and source refetches", async () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <DraftHarness
        open
        draftKey="record-1"
        source="Original"
        onReset={onReset}
      />,
    );
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "Unsaved work" },
    });

    fireEvent.blur(window);
    fireEvent.focus(window);
    rerender(
      <DraftHarness
        open
        draftKey="record-1"
        source="Refetched record"
        onReset={onReset}
      />,
    );

    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved work");
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("clears on close and resets when switching edit targets", async () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <DraftHarness
        open
        draftKey="record-1"
        source="First record"
        onReset={onReset}
      />,
    );
    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "Unsaved first edit" },
    });

    rerender(
      <DraftHarness
        open
        draftKey="record-2"
        source="Second record"
        onReset={onReset}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Draft")).toHaveValue("Second record"),
    );

    fireEvent.change(screen.getByLabelText("Draft"), {
      target: { value: "Unsaved second edit" },
    });
    rerender(
      <DraftHarness
        open={false}
        draftKey="record-2"
        source="Second record"
        onReset={onReset}
      />,
    );
    rerender(
      <DraftHarness
        open
        draftKey="record-2"
        source="Second record"
        onReset={onReset}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Draft")).toHaveValue("Second record"),
    );
  });
});
