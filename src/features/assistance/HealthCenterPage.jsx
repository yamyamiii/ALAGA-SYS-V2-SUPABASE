import { Clock, Mail, MapPin, Pencil, Phone, Stethoscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatList,
  healthCenterSchema,
  parseList,
} from "@/features/assistance/schemas";
import {
  useAssistanceMutation,
  useHealthCenter,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { assistanceService } from "@/services/assistanceService";

function ListCard({ title, items }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items?.length ? (
          <ul className="space-y-2 text-sm">
            {items.map((item) => (
              <li key={item} className="rounded-lg bg-muted/40 px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not yet provided.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Editor({ open, onOpenChange, data, mutation }) {
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  const dataRef = useRef(data);
  dataRef.current = data;
  useEffect(() => {
    const data = dataRef.current;
    if (!open || !data) return;
    setError("");
    setValues({
      ...data,
      emergency_contacts: formatList(data.emergency_contacts),
      services_offered: formatList(data.services_offered),
      doctors: formatList(data.doctors),
      midwives: formatList(data.midwives),
      nurses: formatList(data.nurses),
      bhws: formatList(data.bhws),
    });
  }, [open]);
  if (!values) return null;
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      ...values,
      ...Object.fromEntries(
        [
          "emergency_contacts",
          "services_offered",
          "doctors",
          "midwives",
          "nurses",
          "bhws",
        ].map((key) => [key, parseList(values[key])]),
      ),
    };
    const parsed = healthCenterSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      toast.success("Health center information updated");
      onOpenChange(false);
    } catch (nextError) {
      setError(nextError.message);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-w-3xl">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit health center information</DialogTitle>
            <DialogDescription>
              Enter one service, contact, or team member per line in list
              fields.
            </DialogDescription>
          </DialogHeader>
          {[
            "health_center_name",
            "address",
            "contact_number",
            "email",
            "operating_hours",
          ].map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`center-${key}`}>
                {key
                  .replaceAll("_", " ")
                  .replace(/\b\w/g, (letter) => letter.toUpperCase())}
              </Label>
              <Input
                id={`center-${key}`}
                value={values[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "emergency_contacts",
              "services_offered",
              "doctors",
              "midwives",
              "nurses",
              "bhws",
            ].map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`center-${key}`}>
                  {key
                    .replaceAll("_", " ")
                    .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                </Label>
                <textarea
                  id={`center-${key}`}
                  className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm"
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function HealthCenterPage() {
  const { can } = useAuth();
  const query = useHealthCenter();
  const mutation = useAssistanceMutation(assistanceService.saveHealthCenter);
  const [editing, setEditing] = useState(false);
  const data = query.data;
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Brgy. Bagongpook"
        title="Health center information"
        description="Official contact details, operating hours, services, and care team information."
        actions={
          can(PERMISSIONS.MANAGE_HEALTH_CENTER) ? (
            <Button onClick={() => setEditing(true)}>
              <Pencil />
              Edit information
            </Button>
          ) : null
        }
      />
      {query.isLoading ? (
        <LoadingState title="Loading health center information" />
      ) : query.isError ? (
        <ErrorState
          title="Information unavailable"
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : !data ? (
        <EmptyState
          title="Information unavailable"
          description="The health center record has not been configured."
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Health center</p>
                <p className="mt-1 font-semibold">{data.health_center_name}</p>
              </div>
              <div className="flex gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                <span className="text-sm">
                  {data.address || "Address not yet provided"}
                </span>
              </div>
              <div className="flex gap-2">
                <Phone className="h-5 w-5 text-primary" />
                <span className="text-sm">
                  {data.contact_number || "Contact number not yet provided"}
                </span>
              </div>
              <div className="flex gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <span className="text-sm">
                  {data.email || "Email not yet provided"}
                </span>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Clock className="h-5 w-5 text-primary" />
                <span className="whitespace-pre-wrap text-sm">
                  {data.operating_hours || "Operating hours not yet provided"}
                </span>
              </div>
            </CardContent>
          </Card>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ListCard
              title="Emergency contacts"
              items={data.emergency_contacts}
            />
            <ListCard title="Services offered" items={data.services_offered} />
            <ListCard title="Doctors" items={data.doctors} />
            <ListCard title="Midwives" items={data.midwives} />
            <ListCard title="Nurses" items={data.nurses} />
            <ListCard title="Barangay Health Workers" items={data.bhws} />
          </section>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Stethoscope className="h-4 w-4" />
            For emergencies, use the configured emergency contacts or the
            appropriate emergency service.
          </p>
        </>
      )}
      <Editor
        open={editing}
        onOpenChange={setEditing}
        data={data}
        mutation={mutation}
      />
    </div>
  );
}
