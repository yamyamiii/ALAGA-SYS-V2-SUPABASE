import { zodResolver } from "@hookform/resolvers/zod";
import {
  ImagePlus,
  LoaderCircle,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { SectionHeading } from "@/components/common/SectionHeading";
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
import {
  BLOOD_TYPES,
  CIVIL_STATUSES,
  PREGNANCY_STATUSES,
  PREGNANCY_STATUS_LABELS,
  RESIDENT_STATUS_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
} from "@/features/registry/constants";
import {
  useDeploymentContext,
  usePuroks,
  useRegistryMutation,
} from "@/features/registry/hooks";
import { DeploymentBarangayContext } from "@/features/registry/DeploymentBarangayContext";
import { HouseholdSearchField } from "@/features/registry/HouseholdSearchField";
import { ResidentPhoto } from "@/features/registry/ResidentPhoto";
import {
  residentSchema,
  validateLocalityConsistency,
} from "@/features/registry/schemas";
import {
  registryService,
  validateResidentPhoto,
} from "@/services/registryService";

const defaults = {
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  date_of_birth: "",
  sex: "",
  civil_status: "",
  blood_type: "",
  nationality: "",
  religion: "",
  phone_number: "",
  email: "",
  occupation: "",
  purok_id: "",
  household_id: "",
  address_line: "",
  philhealth_number: "",
  emergency_contact_name: "",
  emergency_contact_number: "",
  emergency_contact_relationship: "",
  is_senior_citizen: false,
  is_pwd: false,
  pregnancy_status: "",
  status: "active",
};

function Field({ label, htmlFor, error, children, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error.message}</p>
      ) : null}
    </div>
  );
}

function Select({ id, register, children, disabled = false, onChange }) {
  return (
    <select
      id={id}
      {...register}
      onChange={onChange ?? register.onChange}
      disabled={disabled}
      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
    >
      {children}
    </select>
  );
}

export function ResidentFormDialog({ open, onOpenChange, resident, onSaved }) {
  const editing = Boolean(resident?.id);
  const [localityError, setLocalityError] = useState("");
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [duplicateReview, setDuplicateReview] = useState(null);
  const deploymentContext = useDeploymentContext();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(residentSchema),
    defaultValues: defaults,
  });
  const purokId = watch("purok_id");
  const sex = watch("sex");
  const puroks = usePuroks();
  const mutation = useRegistryMutation(async ({ values, duplicateMatches }) => {
    const options = { duplicateMatchCount: duplicateMatches.length };
    let saved;
    try {
      saved = editing
        ? await registryService.updateResident(resident.id, values, options)
        : await registryService.createResident(values, options);
    } catch (error) {
      if (error.code === "duplicate_audit_failed_after_save") {
        return { savedWithAuditWarning: true, warning: error.message };
      }
      throw error;
    }

    if (removePhoto && resident?.photo_path && !photoFile) {
      const result = await registryService.removeResidentPhoto(
        saved.id,
        resident.photo_path,
      );
      if (result.cleanupWarning) toast.warning(result.cleanupWarning);
    }
    if (photoFile) {
      try {
        const result = await registryService.uploadResidentPhoto(
          saved.id,
          photoFile,
          resident?.photo_path,
          setUploadProgress,
        );
        if (result.cleanupWarning) toast.warning(result.cleanupWarning);
      } catch (error) {
        if (!editing) {
          return {
            ...saved,
            photoWarning:
              "The resident was created, but the photo upload failed. Open the resident again to retry the photo.",
          };
        }
        throw error;
      }
    }
    return saved;
  });

  useEffect(() => {
    if (!open) return;
    const source = resident ?? defaults;
    reset(
      Object.fromEntries(
        Object.keys(defaults).map((field) => [
          field,
          source[field] ?? defaults[field],
        ]),
      ),
    );
    setLocalityError("");
    setSelectedHousehold(
      source.household_id && source.household
        ? {
            ...source.household,
            id: source.household_id,
            barangay_id: source.barangay_id,
            purok_id: source.purok_id,
          }
        : null,
    );
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setPhotoError("");
    setUploadProgress(null);
    setDuplicateReview(null);
    mutation.reset();
  }, [open, resident, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  async function choosePhoto(event) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    try {
      await validateResidentPhoto(file);
      setPhotoFile(file);
      setRemovePhoto(false);
      setPhotoError("");
    } catch (error) {
      setPhotoError(error.message);
      setPhotoFile(null);
    }
  }

  async function save(values, duplicateMatches = []) {
    const mismatch = validateLocalityConsistency(values, {
      puroks: puroks.data,
      households: selectedHousehold ? [selectedHousehold] : [],
    });
    if (mismatch) {
      setLocalityError(mismatch);
      return;
    }
    setLocalityError("");
    const result = await mutation.mutateAsync({ values, duplicateMatches });
    if (result.savedWithAuditWarning) {
      toast.error(result.warning);
    } else if (result.photoWarning) {
      toast.warning(result.photoWarning);
    } else {
      toast.success(editing ? "Resident updated" : "Resident created");
    }
    onOpenChange(false);
    onSaved?.();
  }

  async function submit(values) {
    setDuplicateReview(null);
    try {
      const matches = await registryService.findResidentDuplicates(
        values,
        resident?.id,
      );
      if (matches.length > 0) {
        setDuplicateReview({ values, matches });
        return;
      }
      await save(values);
    } catch (error) {
      setLocalityError(error.message);
    }
  }

  async function confirmDuplicateSave() {
    if (!duplicateReview) return;
    try {
      await save(duplicateReview.values, duplicateReview.matches);
    } catch {
      // The mapped mutation error remains visible in the dialog.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit resident" : "Add resident"}
          </DialogTitle>
          <DialogDescription>
            Resident numbers are generated by the database. Age is calculated
            from date of birth and is never stored.
          </DialogDescription>
        </DialogHeader>
        {mutation.error || localityError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {localityError || mutation.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}
        {duplicateReview ? (
          <Alert>
            <TriangleAlert className="h-4 w-4 text-warning-foreground" />
            <AlertDescription className="space-y-3">
              <p className="font-semibold">Possible duplicate resident found</p>
              <p>
                Review the matching active record
                {duplicateReview.matches.length > 1 ? "s" : ""} before saving.
                This warning does not block a legitimate resident.
              </p>
              <ul className="space-y-1 text-xs">
                {duplicateReview.matches.map((match) => (
                  <li key={match.id}>
                    {match.resident_number} · {match.display_name} ·{" "}
                    {match.purok_name}
                    {match.phone_match ? " · phone also matches" : ""}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDuplicateReview(null)}
                >
                  Review form
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmDuplicateSave}
                  disabled={mutation.isPending}
                >
                  Save anyway and record override
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        <DeploymentBarangayContext query={deploymentContext} />
        <form
          id="resident-form"
          className="space-y-7"
          onSubmit={handleSubmit(submit)}
          noValidate
        >
          <section className="space-y-4">
            <SectionHeading
              title="Resident photo"
              description="Private JPEG, PNG, or WebP up to 5 MB"
            />
            <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Selected resident preview"
                  className="h-20 w-20 rounded-full border object-cover"
                />
              ) : resident && !removePhoto ? (
                <ResidentPhoto resident={resident} className="h-20 w-20" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-muted text-lg font-semibold text-muted-foreground">
                  {watch("first_name")?.[0] ?? ""}
                  {watch("last_name")?.[0] ?? ""}
                </div>
              )}
              <div className="space-y-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold hover:bg-accent">
                  <ImagePlus className="h-4 w-4" />
                  {resident?.photo_path ? "Replace photo" : "Choose photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={choosePhoto}
                  />
                </label>
                {resident?.photo_path && !removePhoto ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoFile(null);
                      setRemovePhoto(true);
                      setPhotoError("");
                    }}
                  >
                    <Trash2 /> Remove photo
                  </Button>
                ) : null}
                {photoFile ? (
                  <p className="text-xs text-muted-foreground">
                    Selected: {photoFile.name}
                  </p>
                ) : null}
                {removePhoto ? (
                  <p className="text-xs text-muted-foreground">
                    The current photo will be removed when saved.
                  </p>
                ) : null}
                {photoError ? (
                  <p className="text-xs text-destructive">{photoError}</p>
                ) : null}
              </div>
            </div>
            {uploadProgress ? (
              <div className="space-y-1" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Photo {uploadProgress.stage}… {uploadProgress.percent}%
                </p>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <SectionHeading
              title="Personal information"
              description="Required identity and demographic fields"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field
                label="First name"
                htmlFor="resident-first"
                error={errors.first_name}
              >
                <Input id="resident-first" {...register("first_name")} />
              </Field>
              <Field
                label="Middle name"
                htmlFor="resident-middle"
                error={errors.middle_name}
              >
                <Input id="resident-middle" {...register("middle_name")} />
              </Field>
              <Field
                label="Last name"
                htmlFor="resident-last"
                error={errors.last_name}
              >
                <Input id="resident-last" {...register("last_name")} />
              </Field>
              <Field
                label="Suffix"
                htmlFor="resident-suffix"
                error={errors.suffix}
              >
                <Input id="resident-suffix" {...register("suffix")} />
              </Field>
              <Field
                label="Date of birth"
                htmlFor="resident-dob"
                error={errors.date_of_birth}
              >
                <Input
                  id="resident-dob"
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  {...register("date_of_birth")}
                />
              </Field>
              <Field label="Sex" htmlFor="resident-sex" error={errors.sex}>
                <Select
                  id="resident-sex"
                  register={register("sex")}
                  onChange={(event) => {
                    setValue("sex", event.target.value, {
                      shouldValidate: true,
                    });
                    if (event.target.value !== "female")
                      setValue("pregnancy_status", "", {
                        shouldValidate: true,
                      });
                  }}
                >
                  <option value="">Select sex</option>
                  {SEX_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {SEX_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Civil status"
                htmlFor="resident-civil"
                error={errors.civil_status}
              >
                <Select id="resident-civil" register={register("civil_status")}>
                  <option value="">Not provided</option>
                  {CIVIL_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {RESIDENT_STATUS_LABELS[value] ??
                        value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Blood type"
                htmlFor="resident-blood"
                error={errors.blood_type}
              >
                <Select id="resident-blood" register={register("blood_type")}>
                  <option value="">Not provided</option>
                  {BLOOD_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Nationality"
                htmlFor="resident-nationality"
                error={errors.nationality}
              >
                <Input id="resident-nationality" {...register("nationality")} />
              </Field>
              <Field
                label="Religion"
                htmlFor="resident-religion"
                error={errors.religion}
              >
                <Input id="resident-religion" {...register("religion")} />
              </Field>
              <Field
                label="Occupation"
                htmlFor="resident-occupation"
                error={errors.occupation}
              >
                <Input id="resident-occupation" {...register("occupation")} />
              </Field>
              <Field
                label="Status"
                htmlFor="resident-status"
                error={errors.status}
              >
                <Select id="resident-status" register={register("status")}>
                  {["active", "inactive"].map((value) => (
                    <option key={value} value={value}>
                      {RESIDENT_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <SectionHeading
              title="Locality and household"
              description="Brgy. Bagongpook purok and optional household relationships"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Purok"
                htmlFor="resident-purok"
                error={errors.purok_id}
              >
                <Select
                  id="resident-purok"
                  register={register("purok_id")}
                  disabled={puroks.isLoading || deploymentContext.isError}
                  onChange={(event) => {
                    setValue("purok_id", event.target.value, {
                      shouldValidate: true,
                    });
                    setValue("household_id", "", { shouldValidate: true });
                    setSelectedHousehold(null);
                  }}
                >
                  <option value="">Select purok</option>
                  {(puroks.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Household"
                htmlFor="resident-household"
                error={errors.household_id}
              >
                <HouseholdSearchField
                  purokId={purokId}
                  value={watch("household_id")}
                  selectedHousehold={selectedHousehold}
                  onChange={(household) => {
                    setSelectedHousehold(household);
                    setValue("household_id", household?.id ?? "", {
                      shouldValidate: true,
                    });
                  }}
                  disabled={mutation.isPending}
                />
              </Field>
              <Field
                label="Address (optional)"
                htmlFor="resident-address"
                error={errors.address_line}
                className="sm:col-span-2 lg:col-span-3"
              >
                <textarea
                  id="resident-address"
                  rows={3}
                  {...register("address_line")}
                  className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <SectionHeading title="Contact and administrative information" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Phone number"
                htmlFor="resident-phone"
                error={errors.phone_number}
              >
                <Input
                  id="resident-phone"
                  type="tel"
                  {...register("phone_number")}
                />
              </Field>
              <Field
                label="Email"
                htmlFor="resident-email"
                error={errors.email}
              >
                <Input
                  id="resident-email"
                  type="email"
                  {...register("email")}
                />
              </Field>
              <Field
                label="PhilHealth number"
                htmlFor="resident-philhealth"
                error={errors.philhealth_number}
              >
                <Input
                  id="resident-philhealth"
                  {...register("philhealth_number")}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <SectionHeading title="Emergency contact" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Name"
                htmlFor="emergency-name"
                error={errors.emergency_contact_name}
              >
                <Input
                  id="emergency-name"
                  {...register("emergency_contact_name")}
                />
              </Field>
              <Field
                label="Phone number"
                htmlFor="emergency-phone"
                error={errors.emergency_contact_number}
              >
                <Input
                  id="emergency-phone"
                  type="tel"
                  {...register("emergency_contact_number")}
                />
              </Field>
              <Field
                label="Relationship"
                htmlFor="emergency-relationship"
                error={errors.emergency_contact_relationship}
              >
                <Input
                  id="emergency-relationship"
                  {...register("emergency_contact_relationship")}
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <SectionHeading
              title="Classification"
              description="Administrative indicators only; no clinical record is created"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  {...register("is_senior_citizen")}
                />{" "}
                Senior Citizen
              </label>
              <label className="flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  {...register("is_pwd")}
                />{" "}
                PWD
              </label>
              {sex === "female" ? (
                <Field
                  label="Pregnancy status"
                  htmlFor="resident-pregnancy"
                  error={errors.pregnancy_status}
                >
                  <Select
                    id="resident-pregnancy"
                    register={register("pregnancy_status")}
                  >
                    <option value="">Not captured</option>
                    {PREGNANCY_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {PREGNANCY_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </section>
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
            form="resident-form"
            disabled={
              mutation.isPending ||
              deploymentContext.isLoading ||
              deploymentContext.isError
            }
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Save />
            )}
            {mutation.isPending ? "Saving…" : "Save resident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
