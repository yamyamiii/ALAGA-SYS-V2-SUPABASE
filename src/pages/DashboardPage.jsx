import { format } from "date-fns";
import {
  CalendarCheck,
  ClipboardPlus,
  HeartPulse,
  Megaphone,
  PackageCheck,
  UsersRound,
} from "lucide-react";

import { EmptyState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { quickActionPreviews } from "@/config/navigation";

const previewStats = [
  { label: "Registered residents", icon: UsersRound },
  { label: "Today's appointments", icon: CalendarCheck },
  { label: "Open care records", icon: HeartPulse },
  { label: "Medicine stock items", icon: PackageCheck },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Foundation dashboard"
        title="Good day, Barangay Health Team"
        description="Your future operational overview will live here. All values and modules are intentionally disconnected during Phase 0."
        actions={
          <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <span className="font-medium text-foreground">
              {format(new Date(), "EEEE")}
            </span>
            <span className="mx-2 text-border">•</span>
            {format(new Date(), "MMMM d, yyyy")}
          </div>
        }
      />

      <section
        aria-label="Preview statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {previewStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <SectionHeading
              title="Appointment trend"
              description="Chart area prepared for verified appointment data"
              action={<Badge variant="outline">No data source</Badge>}
            />
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Trend chart placeholder"
              description="A Recharts visualization will appear after the appointment schema, access policies, and query service are ready."
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <SectionHeading
              title="Service breakdown"
              description="Prepared for real service categories"
              action={<Badge variant="outline">Preview</Badge>}
            />
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              title="Breakdown chart placeholder"
              description="No fabricated healthcare statistics are shown."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Today's schedule"
              description="Appointments will be listed by time"
            />
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              title="No connected schedule"
              description="Scheduling begins in Phase 4."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeading
              title="Announcements"
              description="Updates for healthcare staff"
            />
          </CardHeader>
          <CardContent>
            <EmptyState
              compact
              title="No announcements yet"
              description="Announcement publishing begins in Phase 8."
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <SectionHeading
              title="Quick actions"
              description="Shortcuts are visual placeholders"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {quickActionPreviews.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-start font-medium"
                  disabled
                >
                  <Icon />
                  {action.label}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    Soon
                  </span>
                </Button>
              );
            })}
            <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs leading-5 text-secondary-foreground">
              <ClipboardPlus className="mt-0.5 h-4 w-4 shrink-0" />
              Actions activate only after their data and permission foundations
              are complete.
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        Phase 0 preview — no resident or healthcare records are stored or
        displayed.
      </div>
    </div>
  );
}
