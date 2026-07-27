import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccessibleBarChart } from "@/features/reports/AccessibleBarChart";

describe("AccessibleBarChart", () => {
  it("provides a text alternative and equivalent data table", () => {
    render(
      <AccessibleBarChart
        title="Residents by purok"
        data={[
          { label: "Purok 1", value: 12 },
          { label: "Purok 2", value: 8 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /Residents by purok.*Purok 1: 12.*Purok 2: 8/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Category", hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Purok 1")).toHaveLength(2);
  });
});
