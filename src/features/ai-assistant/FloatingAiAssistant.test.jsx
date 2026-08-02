import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingAiAssistant } from "@/features/ai-assistant/FloatingAiAssistant";
import { USER_ROLES } from "@/features/auth/permissions";
import {
  AiAssistantServiceError,
  aiAssistantService,
} from "@/services/aiAssistantService";

const resident = {
  id: "11111111-1111-4111-8111-111111111111",
  role: USER_ROLES.RESIDENT,
};

function renderAssistant(profile = resident) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FloatingAiAssistant
          key={`${profile.id}:${profile.role}`}
          profile={profile}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current route">{location.pathname}</output>;
}

describe("floating ALAGA AI assistant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("opens accessibly, focuses the input, and renders role guidance", async () => {
    const user = userEvent.setup();
    renderAssistant();
    const opener = screen.getByRole("button", {
      name: "Open ALAGA AI Assistant",
    });
    await user.click(opener);
    expect(
      screen.getByRole("dialog", { name: "ALAGA AI Assistant" }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Message ALAGA AI Assistant");
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByText(/appointment requests/i)).toBeInTheDocument();
    expect(screen.getByText(/do not enter names/i)).toBeInTheDocument();
  });

  it("shows loading, appends plain-text responses, and clears explicitly", async () => {
    let resolveRequest;
    vi.spyOn(aiAssistantService, "send").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const user = userEvent.setup();
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Where is the FAQ?",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(screen.getByText("ALAGA AI is typing…")).toBeInTheDocument();
    resolveRequest({
      content: "Open the FAQ module from the navigation menu.",
    });
    expect(
      await screen.findByText("Open the FAQ module from the navigation menu."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.queryByText("Where is the FAQ?")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Open the FAQ module from the navigation menu."),
    ).not.toBeInTheDocument();
  });

  it("keeps an in-memory draft across close and offers safe retry", async () => {
    vi.spyOn(aiAssistantService, "send")
      .mockRejectedValueOnce(
        new AiAssistantServiceError(
          "provider_unavailable",
          "The assistant is temporarily unavailable.",
          { retryable: true },
        ),
      )
      .mockResolvedValueOnce({ content: "Please open Notifications." });
    const user = userEvent.setup();
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    const input = screen.getByLabelText("Message ALAGA AI Assistant");
    await user.type(input, "Draft only");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    expect(screen.getByLabelText("Message ALAGA AI Assistant")).toHaveValue(
      "Draft only",
    );

    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(
      await screen.findByText("The assistant is temporarily unavailable."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByText("Please open Notifications."),
    ).toBeInTheDocument();
  });

  it("clears conversation memory on logout-style unmount and role changes", async () => {
    vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: "Resident response",
    });
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FloatingAiAssistant key="resident" profile={resident} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Resident draft",
    );

    const nurse = { ...resident, role: USER_ROLES.NURSE };
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FloatingAiAssistant key="nurse" profile={nurse} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    expect(screen.getByText(/assigned appointment/i)).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Resident draft"),
    ).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={client}>{null}</QueryClientProvider>,
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FloatingAiAssistant key="resident-new" profile={resident} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    expect(screen.queryByText("Resident draft")).not.toBeInTheDocument();
  });

  it("renders accessible source badges and navigates through a known action ID", async () => {
    vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: "The verified health-center page is available.",
      sources: [
        {
          type: "health_center",
          label: "Health Center Information",
          title: "Brgy. Bagongpook Health Center",
          updatedAt: null,
        },
      ],
      actions: [
        {
          type: "navigate",
          actionId: "open_health_center",
          label: "Untrusted label",
          requiresConfirmation: false,
        },
      ],
    });
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/"]}>
          <FloatingAiAssistant profile={resident} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Show health center information",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(
      await screen.findByLabelText("Source: Health Center Information"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Brgy. Bagongpook Health Center"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Open Health Center Information" }),
    );
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/health-center",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the resident appointments action with its safe local label", async () => {
    vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: "Maaari kong buksan ang iyong appointments page.",
      sources: [],
      actions: [
        {
          type: "navigate",
          actionId: "open_appointments",
          label: "Untrusted server label",
          requiresConfirmation: false,
        },
      ],
    });
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/"]}>
          <FloatingAiAssistant profile={resident} />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Buksan ang appointments ko",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));

    const action = await screen.findByRole("button", {
      name: "Open My Appointments",
    });
    expect(
      screen.queryByRole("button", { name: "Untrusted server label" }),
    ).not.toBeInTheDocument();
    await user.click(action);
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "/appointments",
    );
  });

  it("disables navigation actions while offline", async () => {
    vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: "Open Notifications when you are online.",
      sources: [],
      actions: [
        {
          type: "navigate",
          actionId: "open_notifications",
          label: "Open Notifications",
          requiresConfirmation: true,
        },
      ],
    });
    const user = userEvent.setup();
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Open notifications",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));
    const action = await screen.findByRole("button", {
      name: "Confirm: Open Notifications",
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));

    await waitFor(() => expect(action).toBeDisabled());
  });
});
