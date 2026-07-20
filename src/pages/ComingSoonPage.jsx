import { ArrowLeft, Blocks } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { PageHeading } from "@/components/common/PageHeading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { navigationItems } from "@/config/navigation";
import { ROUTES } from "@/config/routes";

export default function ComingSoonPage() {
  const { pathname } = useLocation();
  const item = navigationItems.find(
    (navigationItem) => navigationItem.path === pathname,
  );
  const title = item?.label ?? "Module";
  const Icon = item?.icon ?? Blocks;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Service unavailable"
        title={title}
        description="This service is not available yet. Existing account and registry tools remain available from the navigation."
        actions={<Badge variant="secondary">Coming soon</Badge>}
      />
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-xl font-semibold">Coming soon</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {title} will appear here once its secure data and workflows are
            ready for use.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to={ROUTES.dashboard}>
              <ArrowLeft /> Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
