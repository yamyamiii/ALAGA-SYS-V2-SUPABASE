import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      <FloatingAiAssistant
        key={`${profile.id}:${profile.role}`}
        profile={profile}
      />
    </QueryClientProvider>,
  );
}

describe("floating ALAGA AI assistant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
        <FloatingAiAssistant key="resident" profile={resident} />
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
        <FloatingAiAssistant key="nurse" profile={nurse} />
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
        <FloatingAiAssistant key="resident-new" profile={resident} />
      </QueryClientProvider>,
    );
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    expect(screen.queryByText("Resident draft")).not.toBeInTheDocument();
  });
});
