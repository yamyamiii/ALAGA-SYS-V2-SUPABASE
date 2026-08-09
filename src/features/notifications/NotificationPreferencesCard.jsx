import { BellRing, Mail, MessageSquareText, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  useNotificationPreferences,
  useNotificationSettingsMutation,
} from "@/features/notifications/hooks";
import { notificationService } from "@/services/notificationService";

const CHANNELS = [
  ["in_app_enabled", "In-app notifications", BellRing],
  ["email_enabled", "Email", Mail],
  ["sms_enabled", "SMS", MessageSquareText],
];

const TOPICS = [
  ["appointment_updates_enabled", "Appointment updates"],
  ["appointment_reminders_enabled", "Appointment reminders"],
  ["announcement_enabled", "Important announcements"],
  ["inquiry_updates_enabled", "Inquiry updates"],
  ["document_updates_enabled", "Signed document availability"],
];
const PRESERVED_INACTIVE_TOPIC_KEYS = ["maternal_child_reminders_enabled"];

function preferenceValues(preference) {
  return Object.fromEntries(
    [
      ...CHANNELS.map(([key]) => key),
      ...TOPICS.map(([key]) => key),
      ...PRESERVED_INACTIVE_TOPIC_KEYS,
    ].map((key) => [key, preference[key]]),
  );
}

function SwitchField({
  id,
  label,
  checked,
  onChange,
  disabled,
  description,
  Icon,
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${disabled ? "opacity-65" : "cursor-pointer"}`}
    >
      <span className="flex min-w-0 gap-3">
        {Icon ? (
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        ) : null}
        <span>
          <span className="block text-sm font-medium">{label}</span>
          {description ? (
            <span className="mt-1 block text-xs text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
      />
    </label>
  );
}

function PreferencesForm({ preference }) {
  const [values, setValues] = useState(() => ({
    ...preferenceValues(preference),
    locale: preference.locale,
    version: preference.version,
  }));
  const mutation = useNotificationSettingsMutation(
    notificationService.updatePreferences,
  );
  const emailUsable =
    preference.email_contact_available && preference.email_provider_configured;
  const smsUsable =
    preference.sms_contact_available && preference.sms_provider_configured;
  const changed = useMemo(
    () =>
      [...CHANNELS, ...TOPICS].some(
        ([key]) => values[key] !== preference[key],
      ) || values.locale !== preference.locale,
    [preference, values],
  );

  function update(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      await mutation.mutateAsync(values);
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error("Preferences could not be saved", {
        description: error.message,
      });
    }
  }

  const emailDescription = !preference.email_contact_available
    ? "No verified account email is available."
    : !preference.email_provider_configured
      ? `Email delivery is not configured. Destination: ${preference.email_destination}`
      : `Messages will be sent to ${preference.email_destination}.`;
  const smsDescription = !preference.sms_contact_available
    ? "No verified Philippine mobile number is available."
    : !preference.sms_provider_configured
      ? `SMS is disabled or unconfigured. Destination: ${preference.sms_destination}`
      : `Messages will be sent to ${preference.sms_destination}. Carrier charges may apply.`;

  return (
    <CardContent className="space-y-6">
      <section
        className="space-y-3"
        aria-labelledby="notification-channels-heading"
      >
        <h3
          id="notification-channels-heading"
          className="font-heading text-sm font-semibold"
        >
          Delivery channels
        </h3>
        <div className="grid gap-3 lg:grid-cols-3">
          {CHANNELS.map(([key, label, Icon]) => {
            const disabled =
              key === "email_enabled"
                ? !emailUsable && !values[key]
                : key === "sms_enabled"
                  ? !smsUsable && !values[key]
                  : false;
            const description =
              key === "email_enabled"
                ? emailDescription
                : key === "sms_enabled"
                  ? smsDescription
                  : "Secure updates remain available inside ALAGA-SYS.";
            return (
              <SwitchField
                key={key}
                id={`notification-${key}`}
                label={label}
                Icon={Icon}
                checked={values[key]}
                disabled={disabled}
                description={description}
                onChange={(checked) => update(key, checked)}
              />
            );
          })}
        </div>
      </section>

      <section
        className="space-y-3"
        aria-labelledby="notification-topics-heading"
      >
        <h3
          id="notification-topics-heading"
          className="font-heading text-sm font-semibold"
        >
          Update types
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map(([key, label]) => (
            <SwitchField
              key={key}
              id={`notification-${key}`}
              label={label}
              checked={values[key]}
              onChange={(checked) => update(key, checked)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Label htmlFor="notification-locale">Message language</Label>
          <select
            id="notification-locale"
            value={values.locale}
            onChange={(event) => update("locale", event.target.value)}
            className="flex h-10 w-full rounded-lg border bg-background px-3 text-sm sm:w-56"
          >
            <option value="en">English</option>
            <option value="fil">Filipino</option>
          </select>
        </div>
        <Button
          type="button"
          disabled={!changed || mutation.isPending}
          onClick={save}
        >
          <Save /> {mutation.isPending ? "Saving…" : "Save preferences"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        External messages contain only minimized operational information.
        Clinical details and protected documents are available only after
        authenticated sign-in.
      </p>
    </CardContent>
  );
}

export function NotificationPreferencesCard() {
  const query = useNotificationPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
      </CardHeader>
      {query.isLoading ? (
        <LoadingState compact title="Loading notification preferences" />
      ) : query.isError ? (
        <ErrorState
          compact
          title="Preferences unavailable"
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : query.data ? (
        <PreferencesForm key={query.data.version} preference={query.data} />
      ) : (
        <EmptyState compact title="Preferences unavailable" />
      )}
    </Card>
  );
}
