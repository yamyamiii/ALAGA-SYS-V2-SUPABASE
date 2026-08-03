import { OfficialLogo } from "@/components/common/OfficialLogo";

export function DocumentHeader({ title, identifier }) {
  return (
    <header className="document-header">
      <div className="flex items-center gap-4">
        <OfficialLogo className="h-16 w-16 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="font-heading text-xl font-bold tracking-wide text-primary">
            ALAGA-SYS
          </p>
          <p className="text-xs font-semibold">
            Automated Local Appointment and General Assistance System
          </p>
          <p className="text-xs text-muted-foreground">
            Barangay Bagongpook Health Center
          </p>
        </div>
      </div>
      <div className="mt-4 border-t-2 border-primary pt-3">
        <h2 className="font-heading text-2xl font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-xs text-slate-600">Reference: {identifier}</p>
      </div>
    </header>
  );
}
