import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { HOUSEHOLD_STATUS_LABELS } from "@/features/registry/constants";
import {
  useBarangays,
  usePuroks,
  useRegistryMutation,
} from "@/features/registry/hooks";
import { householdSchema } from "@/features/registry/schemas";
import { registryService } from "@/services/registryService";

const defaults = {
  barangay_id: "",
  purok_id: "",
  address_line: "",
  latitude: "",
  longitude: "",
  status: "active",
};

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export function HouseholdFormDialog({
  open,
  onOpenChange,
  household,
  onSaved,
}) {
  const editing = Boolean(household?.id);
  const barangays = useBarangays();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(householdSchema),
    defaultValues: defaults,
  });
  const barangayId = watch("barangay_id");
  const puroks = usePuroks(barangayId);
  const mutation = useRegistryMutation((values) =>
    editing
      ? registryService.updateHousehold(household.id, values)
      : registryService.createHousehold(values),
  );

  useEffect(() => {
    if (!open) return;
    reset(
      household
        ? {
            barangay_id: household.barangay_id,
            purok_id: household.purok_id,
            address_line: household.address_line,
            latitude: household.latitude ?? "",
            longitude: household.longitude ?? "",
            status:
              household.status === "archived" ? "active" : household.status,
          }
        : defaults,
    );
    mutation.reset();
  }, [household, open, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(values) {
    await mutation.mutateAsync(values);
    toast.success(editing ? "Household updated" : "Household created");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit household" : "Add household"}
          </DialogTitle>
          <DialogDescription>
            The database generates the household number. A household head can be
            assigned after members exist.
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <form
          id="household-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(submit)}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="household-barangay">Barangay</Label>
            <select
              id="household-barangay"
              {...register("barangay_id")}
              onChange={(event) => {
                setValue("barangay_id", event.target.value, {
                  shouldValidate: true,
                });
                setValue("purok_id", "", { shouldValidate: true });
              }}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Select barangay</option>
              {(barangays.data ?? []).map((barangay) => (
                <option key={barangay.id} value={barangay.id}>
                  {barangay.name}
                </option>
              ))}
            </select>
            <FieldError error={errors.barangay_id} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="household-purok">Purok</Label>
            <select
              id="household-purok"
              {...register("purok_id")}
              disabled={!barangayId || puroks.isLoading}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">Select purok</option>
              {(puroks.data ?? []).map((purok) => (
                <option key={purok.id} value={purok.id}>
                  {purok.name}
                </option>
              ))}
            </select>
            <FieldError error={errors.purok_id} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="household-address">Address</Label>
            <textarea
              id="household-address"
              rows={3}
              {...register("address_line")}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <FieldError error={errors.address_line} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="household-latitude">Latitude (optional)</Label>
            <Input
              id="household-latitude"
              type="number"
              step="0.000001"
              {...register("latitude")}
            />
            <FieldError error={errors.latitude} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="household-longitude">Longitude (optional)</Label>
            <Input
              id="household-longitude"
              type="number"
              step="0.000001"
              {...register("longitude")}
            />
            <FieldError error={errors.longitude} />
          </div>
          {editing ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="household-status">Status</Label>
              <select
                id="household-status"
                {...register("status")}
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                {["active", "inactive"].map((status) => (
                  <option key={status} value={status}>
                    {HOUSEHOLD_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="household-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save />
            )}
            {mutation.isPending ? "Saving…" : "Save household"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
