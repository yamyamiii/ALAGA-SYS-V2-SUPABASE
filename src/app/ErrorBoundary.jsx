import { Component } from "react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    if (import.meta.env.DEV) {
      // Never write application data, clinical narratives, or stack contents
      // to the browser console. Detailed diagnostics belong in a reviewed,
      // redacted monitoring boundary.
      console.error("ALAGA-SYS encountered a redacted render error.");
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-dvh items-center justify-center p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-xl font-semibold text-destructive">
              !
            </div>
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The application could not display this page. Reload it, or review
              the configuration if the issue continues.
            </p>
            <Button
              className="mt-6"
              onClick={() => window.location.assign(ROUTES.dashboard)}
            >
              Return to dashboard
            </Button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
