import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReportsPage from "@/features/reports/ReportsPage";

const mocks = vi.hoisted(() => ({
  downloadPdfReport: vi.fn(),
  exportRows: vi.fn(),
  print: vi.fn(),
}));

vi.mock("@/features/auth/authContext", () => ({
  useAuth: () => ({ profile: { role: "admin" } }),
}));

vi.mock("@/features/registry/hooks", () => ({
  usePuroks: () => ({ data: [], isError: false }),
}));

vi.mock("@/features/reports/hooks", () => ({
  useReport: () => ({
    data: {
      summary: {
        active_residents: 18,
        total_appointments: 7,
        pending_requests: 2,
        confirmed_appointments: 3,
        completed_appointments: 1,
        cancelled_appointments: 1,
        appointments_today: 2,
        checked_in_queue: 1,
      },
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/services/reportService", () => ({
  reportService: { exportRows: mocks.exportRows },
}));

vi.mock("@/features/reports/exportUtils", () => ({
  downloadPdfReport: mocks.downloadPdfReport,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/reports?category=overview"]}>
      <ReportsPage />
    </MemoryRouter>,
  );
}

describe("Reports PDF and Print actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportRows.mockResolvedValue({
      rows: [{ metric: "Active residents", value: 18 }],
      total: 1,
    });
    Object.defineProperty(window, "print", {
      configurable: true,
      value: mocks.print,
    });
  });

  it("exposes only PDF and Print report actions", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excel" })).toBeNull();
  });

  it("downloads authorized PDF rows with the applied filters without printing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.clear(screen.getByLabelText("Start date"));
    await user.type(screen.getByLabelText("Start date"), "2026-09-01");
    await user.clear(screen.getByLabelText("End date"));
    await user.type(screen.getByLabelText("End date"), "2026-09-27");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await user.click(screen.getByRole("button", { name: "PDF" }));

    await waitFor(() =>
      expect(mocks.exportRows).toHaveBeenCalledWith(
        "overview",
        expect.objectContaining({
          start_date: "2026-09-01",
          end_date: "2026-09-27",
        }),
        "pdf",
      ),
    );
    expect(mocks.downloadPdfReport).toHaveBeenCalledWith(
      [{ metric: "Active residents", value: 18 }],
      {
        category: "overview",
        categoryLabel: "Overview",
        startDate: "2026-09-01",
        endDate: "2026-09-27",
      },
    );
    expect(mocks.print).not.toHaveBeenCalled();
  });

  it("opens the browser print dialog without requesting export rows", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Print" }));

    expect(mocks.print).toHaveBeenCalledOnce();
    expect(mocks.exportRows).not.toHaveBeenCalled();
    expect(mocks.downloadPdfReport).not.toHaveBeenCalled();
  });

  it("prevents duplicate PDF requests while generation is pending", async () => {
    let resolveExport;
    mocks.exportRows.mockReturnValue(
      new Promise((resolve) => {
        resolveExport = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "PDF" }));
    const preparing = screen.getByRole("button", { name: /^Preparing/ });
    expect(preparing).toBeDisabled();
    await user.click(preparing);
    expect(mocks.exportRows).toHaveBeenCalledOnce();

    resolveExport({
      rows: [{ metric: "Active residents", value: 18 }],
      total: 1,
    });
    await waitFor(() => expect(mocks.downloadPdfReport).toHaveBeenCalled());
  });

  it("does not download or print an empty PDF export", async () => {
    mocks.exportRows.mockResolvedValue({ rows: [], total: 0 });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "PDF" }));

    expect(
      await screen.findByText("No report data is available for PDF export."),
    ).toBeInTheDocument();
    expect(mocks.downloadPdfReport).not.toHaveBeenCalled();
    expect(mocks.print).not.toHaveBeenCalled();
  });

  it("shows PDF generation errors without falling back to Print", async () => {
    mocks.downloadPdfReport.mockImplementation(() => {
      throw new Error("The PDF report could not be generated.");
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "PDF" }));

    expect(
      await screen.findByText("The PDF report could not be generated."),
    ).toBeInTheDocument();
    expect(mocks.print).not.toHaveBeenCalled();
  });
});
vi.mock("@/features/health-events/HealthEventSummary", () => ({
  HealthEventSummary: () => null,
}));
