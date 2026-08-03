import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResidentAppointmentsPage } from "@/features/appointments/ResidentAppointmentsPage";
import { FloatingAiAssistant } from "@/features/ai-assistant/FloatingAiAssistant";
import {
  APPOINTMENT_REQUEST_FORM_ACTION,
  clearPendingAiUiActions,
  consumeAiUiAction,
  queueAiUiAction,
} from "@/features/ai-assistant/uiActions";
import { USER_ROLES } from "@/features/auth/permissions";
import { aiAssistantService } from "@/services/aiAssistantService";

const requestDialogProps = vi.fn();

vi.mock("@/features/appointments/hooks", () => ({
  useAppointments: () => ({
    data: { items: [], total: 0 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/appointments/ResidentAppointmentRequestDialog", () => ({
  ResidentAppointmentRequestDialog: (props) => {
    requestDialogProps(props);
    return props.open ? (
      <div role="dialog" aria-label="Request appointment">
        Blank resident appointment request form
      </div>
    ) : null;
  },
}));

vi.mock("@/features/appointments/AppointmentDetailDialog", () => ({
  AppointmentDetailDialog: () => null,
}));

vi.mock("@/features/appointments/AppointmentTabs", () => ({
  AppointmentTabs: () => null,
}));

const resident = {
  id: "11111111-1111-4111-8111-111111111111",
  role: USER_ROLES.RESIDENT,
};

const response = {
  content:
    "Narito ang proseso. Maaari ko ring buksan ang request form para sa iyo.",
  sources: [],
  actions: [
    {
      type: "ui_action",
      actionId: "open_appointment_request_form",
      label: "Untrusted label",
      requiresConfirmation: false,
    },
  ],
};

function LocationStateProbe() {
  const location = useLocation();
  return (
    <output aria-label="Current location">
      {location.pathname}|{location.state ? "pending" : "consumed"}
    </output>
  );
}

function Layout() {
  return (
    <>
      <FloatingAiAssistant profile={resident} />
      <LocationStateProbe />
      <Outlet />
    </>
  );
}

function renderFlow(initialEntry = "/") {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<p>Dashboard</p>} />
            <Route
              path="/appointments"
              element={<ResidentAppointmentsPage profile={resident} />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function requestThroughAssistant(user) {
  await user.click(
    screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
  );
  await user.type(
    screen.getByLabelText("Message ALAGA AI Assistant"),
    "Paano mag-request ng appointment?",
  );
  await user.click(screen.getByRole("button", { name: /send/i }));
  await user.click(
    await screen.findByRole("button", { name: "Request an Appointment" }),
  );
}

describe("AI-assisted resident appointment form action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingAiUiActions();
    vi.spyOn(aiAssistantService, "send").mockResolvedValue(response);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    clearPendingAiUiActions();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    vi.restoreAllMocks();
  });

  it("navigates from another page and opens the existing blank form", async () => {
    const user = userEvent.setup();
    renderFlow("/");
    await requestThroughAssistant(user);

    expect(
      await screen.findByRole("dialog", { name: "Request appointment" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Current location")).toHaveTextContent(
        "/appointments|consumed",
      ),
    );
    const props = requestDialogProps.mock.calls.at(-1)[0];
    expect(Object.keys(props).sort()).toEqual([
      "onOpenChange",
      "onSaved",
      "open",
    ]);
    expect(props).not.toHaveProperty("residentId");
    expect(props).not.toHaveProperty("defaultValues");
    expect(props).not.toHaveProperty("onSubmit");
  });

  it("opens the form while already on the appointments page", async () => {
    const user = userEvent.setup();
    renderFlow("/appointments");
    await requestThroughAssistant(user);
    expect(
      await screen.findByRole("dialog", { name: "Request appointment" }),
    ).toBeInTheDocument();
  });

  it("disables the form action while offline", async () => {
    const user = userEvent.setup();
    renderFlow("/");
    await user.click(
      screen.getByRole("button", { name: "Open ALAGA AI Assistant" }),
    );
    await user.type(
      screen.getByLabelText("Message ALAGA AI Assistant"),
      "Request an appointment",
    );
    await user.click(screen.getByRole("button", { name: /send/i }));
    const action = await screen.findByRole("button", {
      name: "Request an Appointment",
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));
    await waitFor(() => expect(action).toBeDisabled());
  });

  it("does not reopen a consumed or reload-cleared action", () => {
    const token = queueAiUiAction(
      APPOINTMENT_REQUEST_FORM_ACTION,
      USER_ROLES.RESIDENT,
    );
    clearPendingAiUiActions();
    renderFlow({
      pathname: "/appointments",
      state: { alagaAiUiActionToken: token },
    });
    expect(
      screen.queryByRole("dialog", { name: "Request appointment" }),
    ).not.toBeInTheDocument();
  });

  it("clears a pending action when the assistant unmounts for logout or role change", () => {
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FloatingAiAssistant key="resident" profile={resident} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const token = queueAiUiAction(
      APPOINTMENT_REQUEST_FORM_ACTION,
      USER_ROLES.RESIDENT,
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <FloatingAiAssistant
            key="nurse"
            profile={{ ...resident, role: USER_ROLES.NURSE }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(consumeAiUiAction(token, USER_ROLES.RESIDENT)).toBeNull();
  });
});
