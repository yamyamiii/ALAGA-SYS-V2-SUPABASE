import { APPOINTMENT_START_TIME_OPTIONS } from "@/features/appointments/constants";

export function AppointmentStartTimeSelect({ id, className = "", ...props }) {
  return (
    <select
      id={id}
      className={`h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`.trim()}
      {...props}
    >
      {APPOINTMENT_START_TIME_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
