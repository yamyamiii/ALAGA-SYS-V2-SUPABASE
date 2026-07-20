import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectivityBanner } from "@/components/common/ConnectivityBanner";

function setOnline(value) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("ConnectivityBanner", () => {
  it("appears when the browser goes offline and clears after reconnecting", () => {
    setOnline(true);
    render(<ConnectivityBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("You are offline");

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
