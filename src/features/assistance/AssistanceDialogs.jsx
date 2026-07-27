import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  ANNOUNCEMENT_CATEGORIES,
  FAQ_CATEGORIES,
  INQUIRY_CATEGORIES,
  INQUIRY_STATUSES,
} from "@/features/assistance/constants";
import {
  announcementSchema,
  faqSchema,
  inquirySchema,
  inquiryUpdateSchema,
} from "@/features/assistance/schemas";

function Field({ id, label, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Select({ id, value, onChange, options }) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Footer({ pending, onCancel }) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={pending}
      >
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {pending ? "Saving…" : "Save"}
      </Button>
    </DialogFooter>
  );
}

function localDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function AnnouncementDialog({ open, onOpenChange, record, mutation }) {
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    if (!open) return;
    const record = recordRef.current;
    setError("");
    setValues({
      id: record?.id ?? "",
      title: record?.title ?? "",
      category: record?.category ?? "general",
      content: record?.content ?? "",
      publish_at: localDateTime(record?.publish_at ?? new Date()),
      expires_at: localDateTime(record?.expires_at),
      is_pinned: record?.is_pinned ?? false,
      version: record?.version ?? null,
      request_key: record ? null : crypto.randomUUID(),
    });
  }, [open, record?.id]);
  if (!values) return null;
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const parsed = announcementSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    try {
      await mutation.mutateAsync({
        ...values,
        publish_at: new Date(values.publish_at).toISOString(),
        expires_at: values.expires_at
          ? new Date(values.expires_at).toISOString()
          : "",
      });
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
      <DialogContent className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {record ? "Edit announcement" : "Create announcement"}
            </DialogTitle>
            <DialogDescription>
              Publish PHI-free information for the Bagongpook community.
            </DialogDescription>
          </DialogHeader>
          <Field id="announcement-title" label="Title">
            <Input
              id="announcement-title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </Field>
          <Field id="announcement-category" label="Category">
            <Select
              id="announcement-category"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              options={ANNOUNCEMENT_CATEGORIES}
            />
          </Field>
          <Field id="announcement-content" label="Content">
            <textarea
              id="announcement-content"
              className="min-h-40 w-full rounded-lg border bg-background p-3 text-sm"
              value={values.content}
              onChange={(e) => set("content", e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="announcement-publish" label="Publish date and time">
              <Input
                id="announcement-publish"
                type="datetime-local"
                value={values.publish_at}
                onChange={(e) => set("publish_at", e.target.value)}
              />
            </Field>
            <Field id="announcement-expiry" label="Expiration date and time">
              <Input
                id="announcement-expiry"
                type="datetime-local"
                value={values.expires_at}
                onChange={(e) => set("expires_at", e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.is_pinned}
              onChange={(e) => set("is_pinned", e.target.checked)}
            />
            Pin this announcement
          </label>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Footer
            pending={mutation.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FaqDialog({ open, onOpenChange, record, mutation }) {
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    if (!open) return;
    const record = recordRef.current;
    setError("");
    setValues({
      id: record?.id ?? "",
      category: record?.category ?? "general",
      question: record?.question ?? "",
      answer: record?.answer ?? "",
      display_order: record?.display_order ?? 0,
      version: record?.version ?? null,
      request_key: record ? null : crypto.randomUUID(),
    });
  }, [open, record?.id]);
  if (!values) return null;
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const parsed = faqSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    try {
      await mutation.mutateAsync(values);
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
      <DialogContent className="max-w-2xl">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{record ? "Edit FAQ" : "Create FAQ"}</DialogTitle>
            <DialogDescription>
              Provide concise, non-clinical guidance.
            </DialogDescription>
          </DialogHeader>
          <Field id="faq-category" label="Category">
            <Select
              id="faq-category"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              options={FAQ_CATEGORIES}
            />
          </Field>
          <Field id="faq-question" label="Question">
            <Input
              id="faq-question"
              value={values.question}
              onChange={(e) => set("question", e.target.value)}
            />
          </Field>
          <Field id="faq-answer" label="Answer">
            <textarea
              id="faq-answer"
              className="min-h-40 w-full rounded-lg border bg-background p-3 text-sm"
              value={values.answer}
              onChange={(e) => set("answer", e.target.value)}
            />
          </Field>
          <Field id="faq-order" label="Display order">
            <Input
              id="faq-order"
              type="number"
              min="0"
              value={values.display_order}
              onChange={(e) => set("display_order", e.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Footer
            pending={mutation.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InquiryCreateDialog({ open, onOpenChange, mutation }) {
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    setValues({
      subject: "",
      category: "general",
      message: "",
      request_key: crypto.randomUUID(),
    });
  }, [open]);
  if (!values) return null;
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const parsed = inquirySchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    try {
      await mutation.mutateAsync(values);
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
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Submit inquiry</DialogTitle>
            <DialogDescription>
              This is a simple ticket, not live chat. Do not include urgent or
              highly sensitive clinical details.
            </DialogDescription>
          </DialogHeader>
          <Field id="inquiry-subject" label="Subject">
            <Input
              id="inquiry-subject"
              value={values.subject}
              onChange={(e) => set("subject", e.target.value)}
            />
          </Field>
          <Field id="inquiry-category" label="Category">
            <Select
              id="inquiry-category"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              options={INQUIRY_CATEGORIES}
            />
          </Field>
          <Field id="inquiry-message" label="Message">
            <textarea
              id="inquiry-message"
              className="min-h-36 w-full rounded-lg border bg-background p-3 text-sm"
              value={values.message}
              onChange={(e) => set("message", e.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Footer
            pending={mutation.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InquiryUpdateDialog({ open, onOpenChange, record, mutation }) {
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    const record = recordRef.current;
    if (!open || !record) return;
    setError("");
    setValues({
      id: record.id,
      status: record.status,
      staff_response: record.staff_response ?? "",
      version: record.version,
    });
  }, [open, record?.id]);
  if (!values || !record) return null;
  const set = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const parsed = inquiryUpdateSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    try {
      await mutation.mutateAsync(values);
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
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Update inquiry</DialogTitle>
            <DialogDescription>
              {record.inquiry_number} · {record.subject}
            </DialogDescription>
          </DialogHeader>
          <Field id="inquiry-status" label="Status">
            <Select
              id="inquiry-status"
              value={values.status}
              onChange={(e) => set("status", e.target.value)}
              options={INQUIRY_STATUSES}
            />
          </Field>
          <Field id="inquiry-response" label="Staff response">
            <textarea
              id="inquiry-response"
              className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm"
              value={values.staff_response}
              onChange={(e) => set("staff_response", e.target.value)}
            />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Footer
            pending={mutation.isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
