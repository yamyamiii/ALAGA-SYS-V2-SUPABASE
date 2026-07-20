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
        eyebrow="Operations overview"
        title="Good day, Barangay Health Team"
        description="Use the available registry and account tools from the navigation. Unavailable healthcare services remain clearly marked until they are ready."
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
              title="No appointment data"
              description="Verified appointment activity will appear here when scheduling becomes available."
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
              title="No service data"
              description="Only verified healthcare statistics will be shown here."
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
              description="Appointment scheduling is not available yet."
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
              description="Announcement publishing is not available yet."
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
        Only verified, connected information is displayed. Unavailable modules
        remain disabled.
      </div>
    </div>
  );
}
