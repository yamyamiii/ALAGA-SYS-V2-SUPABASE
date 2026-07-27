import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveManilaClock } from "@/components/common/LiveManilaClock";

describe("LiveManilaClock", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders a semantic, non-live Manila clock and updates each second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T11:45:12.000Z"));

    render(<LiveManilaClock />);

    const clock = screen.getByTestId("live-manila-clock");
    const time = clock.querySelector("time");
    expect(time).toHaveAttribute("datetime", "2026-07-27T11:45:12.000Z");
    expect(clock).toHaveTextContent("Monday • July 27, 2026");
    expect(clock).toHaveTextContent("7:45:12 PM • Asia/Manila");
    expect(clock).not.toHaveAttribute("aria-live");
    expect(time).not.toHaveAttribute("aria-live");

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(clock).toHaveTextContent("7:45:13 PM • Asia/Manila");
  });

  it("clears its one-second interval when unmounted", () => {
    vi.useFakeTimers();
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<LiveManilaClock />);

    unmount();

    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  it("uses compact, clipping-safe responsive layout classes", () => {
    const { container } = render(<LiveManilaClock />);
    const clock = screen.getByTestId("live-manila-clock");

    expect(clock).toHaveClass("min-w-0", "max-w-full");
    for (const line of container.querySelectorAll("time span")) {
      expect(line).toHaveClass("block", "truncate");
    }
  });
});
