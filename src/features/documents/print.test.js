import { afterEach, describe, expect, it, vi } from "vitest";

import { printProtectedDocument } from "@/features/documents/print";

describe("protected browser printing", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove("printing-protected-document");
  });

  it("scopes printing and removes the scope after the browser print event", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});

    printProtectedDocument();
    expect(print).toHaveBeenCalledOnce();
    expect(document.body).toHaveClass("printing-protected-document");

    window.dispatchEvent(new Event("afterprint"));
    expect(document.body).not.toHaveClass("printing-protected-document");
  });

  it("cleans up the scope when a browser does not dispatch afterprint", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "print").mockImplementation(() => {});

    printProtectedDocument();
    vi.advanceTimersByTime(1_000);

    expect(document.body).not.toHaveClass("printing-protected-document");
  });
});
