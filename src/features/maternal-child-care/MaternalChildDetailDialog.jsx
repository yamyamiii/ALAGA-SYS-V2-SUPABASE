import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { useMaternalChildDetail } from "@/features/maternal-child-care/hooks";
import { MaternalChildEventDialog } from "@/features/maternal-child-care/MaternalChildEventDialog";
import { useAuth } from "@/features/auth/authContext";
import {
  canArchiveMaternalChildCare,
  canCreateMaternalChildProfile,
  canDocumentMaternalChildCare,
  canRecordGrowth,
} from "@/features/maternal-child-care/permissions";
import { useState } from "react";
import { useMaternalChildMutation } from "@/features/maternal-child-care/hooks";
import { maternalChildService } from "@/services/maternalChildService";
import { toast } from "sonner";

function Timeline({ title, items, dateKey, empty }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ol className="mt-2 space-y-2 border-l pl-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border bg-muted/20 p-3 text-sm"
            >
              <p className="font-medium">
                {item[dateKey] ?? "Date unavailable"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.findings ??
                  item.developmental_notes ??
                  item.notes ??
                  item.status ??
                  "Recorded clinical event"}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export function MaternalChildDetailDialog({
  open,
  onOpenChange,
  kind,
  recordId,
  section,
}) {
  const { profile } = useAuth();
  const [eventType, setEventType] = useState(null);
  const query = useMaternalChildDetail(kind, recordId, open);
  const transition = useMaternalChildMutation(({ current, target }) =>
    maternalChildService.transitionPregnancy(current, target),
  );
  const record = query.data;
  const title =
    kind === "pregnancy" ? record?.pregnancy_number : record?.child_number;
  const person =
    kind === "pregnancy" ? record?.resident_name : record?.child_name;
  const sectionEvent = {
    prenatal: "prenatal",
    deliveries: "delivery",
    postnatal: "postnatal",
    growth: "growth",
    immunizations: "immunization",
    children: "visit",
  }[section];
  const canAddEvent =
    sectionEvent &&
    (sectionEvent !== "delivery" ||
      canCreateMaternalChildProfile(profile.role)) &&
    (sectionEvent === "growth"
      ? canRecordGrowth(profile.role)
      : canDocumentMaternalChildCare(profile.role));

  async function changePregnancyStatus(target) {
    try {
      await transition.mutateAsync({ current: record, target });
      toast.success(`Pregnancy marked ${target}.`);
      await query.refetch();
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title ?? "Care record details"}</DialogTitle>
          <DialogDescription>
            Role-shaped details from the trusted maternal and child care
            service.
          </DialogDescription>
        </DialogHeader>
        {record && canAddEvent ? (
          <Button className="w-fit" onClick={() => setEventType(sectionEvent)}>
            Add {sectionEvent === "visit" ? "child visit" : sectionEvent}
          </Button>
        ) : null}
        {record?.type === "pregnancy" ? (
          <div className="flex flex-wrap gap-2">
            {canCreateMaternalChildProfile(profile.role) &&
            record.status === "active" ? (
              <Button
                variant="outline"
                disabled={transition.isPending}
                onClick={() => changePregnancyStatus("delivered")}
              >
                Mark delivered
              </Button>
            ) : null}
            {canCreateMaternalChildProfile(profile.role) &&
            record.status === "delivered" ? (
              <Button
                variant="outline"
                disabled={transition.isPending}
                onClick={() => changePregnancyStatus("completed")}
              >
                Mark completed
              </Button>
            ) : null}
            {canArchiveMaternalChildCare(profile.role) &&
            record.status !== "archived" ? (
              <Button
                variant="destructive"
                disabled={transition.isPending}
                onClick={() => changePregnancyStatus("archived")}
              >
                Archive pregnancy
              </Button>
            ) : null}
          </div>
        ) : null}
        {query.isLoading ? (
          <LoadingState
            compact
            title="Loading care record"
            description="Checking your clinical access…"
          />
        ) : query.isError ? (
          <ErrorState
            compact
            title={
              query.error.code === "not_found"
                ? "Record not found"
                : "Care record unavailable"
            }
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : record ? (
          <div className="space-y-6">
            <section className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Resident</p>
                <p className="font-semibold">{person}</p>
                <p className="text-xs text-muted-foreground">
                  {record.resident_number}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">{record.status ?? "Active"}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {kind === "pregnancy" ? "Expected delivery" : "Birth date"}
                </p>
                <p>
                  {kind === "pregnancy"
                    ? record.estimated_delivery_date
                    : record.birth_date}
                </p>
              </div>
            </section>
            {kind === "pregnancy" ? (
              <>
                <Timeline
                  title="Prenatal timeline"
                  items={record.prenatal_visits ?? []}
                  dateKey="visit_date"
                  empty="No prenatal visits are available for your role."
                />
                <Timeline
                  title="Postnatal timeline"
                  items={record.postnatal_visits ?? []}
                  dateKey="visit_date"
                  empty="No postnatal visits are available for your role."
                />
              </>
            ) : (
              <>
                <Timeline
                  title="Growth timeline"
                  items={record.growth_measurements ?? []}
                  dateKey="measured_at"
                  empty="No growth measurements are available for your role."
                />
                <Timeline
                  title="Immunization timeline"
                  items={record.immunizations ?? []}
                  dateKey="administered_date"
                  empty="No immunizations are available for your role."
                />
                <Timeline
                  title="Child visit timeline"
                  items={record.child_visits ?? []}
                  dateKey="visit_date"
                  empty="No child visits are available for your role."
                />
              </>
            )}
          </div>
        ) : null}
        <MaternalChildEventDialog
          key={eventType}
          open={Boolean(eventType)}
          onOpenChange={(next) => !next && setEventType(null)}
          type={eventType ?? "prenatal"}
          parentId={recordId}
        />
      </DialogContent>
    </Dialog>
  );
}
