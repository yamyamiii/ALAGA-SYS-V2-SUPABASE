import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";

describe("StateDisplay accessibility", () => {
  it("announces loading without presenting an error", () => {
    render(<LoadingState title="Loading residents" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("announces service failures assertively", () => {
    render(<ErrorState title="Residents unavailable" />);

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
  });

  it("does not announce a static empty state as a failure", () => {
    render(<EmptyState title="No residents" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
