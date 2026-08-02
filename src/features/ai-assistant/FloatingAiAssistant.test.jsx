import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

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
    const opener = screen.getByRole("button", {
      name: "Open ALAGA AI Assistant",
    });
    await user.click(opener);
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
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /^clear$/i,
      }),
    );
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
    const opener = screen.getByRole("button", {
      name: "Open ALAGA AI Assistant",
    });
    await user.click(opener);
    const input = screen.getByLabelText("Message ALAGA AI Assistant");
    await user.type(input, "Draft only");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
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
    expect(screen.getAllByText(/assigned appointment/i)).not.toHaveLength(0);
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
      await screen.findByLabelText(
        "Health Center Information: Brgy. Bagongpook Health Center",
      ),
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
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(action).toBeEnabled());
  });

  it("sends a role-aware starter and starts a new conversation only after confirmation", async () => {
    const send = vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: "Use the resident appointment request form.",
      sources: [],
      actions: [],
    });
    const user = userEvent.setup();
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Paano mag-request ng appointment?",
      }),
    );
    await screen.findByText("Use the resident appointment request form.");
    expect(send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "Paano mag-request ng appointment?",
        }),
      ]),
    );

    await user.click(
      screen.getByRole("button", { name: "Start a new conversation" }),
    );
    const confirmation = screen.getByRole("alertdialog");
    expect(confirmation).toHaveTextContent("Start a new conversation?");
    await user.click(
      within(confirmation).getByRole("button", { name: "Start new" }),
    );
    expect(
      screen.queryByText("Use the resident appointment request form."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Paano mag-request ng appointment?",
      }),
    ).toBeInTheDocument();
  });

  it("copies an assistant response without rendering it as HTML", async () => {
    vi.spyOn(aiAssistantService, "send").mockResolvedValue({
      content: '<script>alert("unsafe")</script>',
      sources: [],
      actions: [],
    });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Explain this safely",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(
      await screen.findByText('<script>alert("unsafe")</script>'),
    ).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Copy response" }));
    expect(writeText).toHaveBeenCalledWith('<script>alert("unsafe")</script>');
    expect(
      screen.getByRole("button", { name: "Response copied" }),
    ).toBeInTheDocument();
  });

  it("prevents duplicate submission while one request is active", async () => {
    let resolveRequest;
    const send = vi.spyOn(aiAssistantService, "send").mockImplementation(
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
    const input = screen.getByLabelText("Message ALAGA AI Assistant");
    await user.type(input, "One request only");
    const sendButton = screen.getByRole("button", { name: /send/i });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    resolveRequest({ content: "Handled once.", sources: [], actions: [] });
    expect(await screen.findByText("Handled once.")).toBeInTheDocument();
  });
});
