import { CalendarDays, ClipboardList, List } from "lucide-react";
import { NavLink } from "react-router-dom";

import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Appointments", path: ROUTES.appointments, icon: List, end: true },
  { label: "Calendar", path: ROUTES.appointmentCalendar, icon: CalendarDays },
  { label: "Daily queue", path: ROUTES.appointmentQueue, icon: ClipboardList },
];

export function AppointmentTabs() {
  return (
    <nav aria-label="Appointment views" className="flex flex-wrap gap-2">
      {tabs.map(({ label, path, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          className={({ isActive }) =>
            cn(
              "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
