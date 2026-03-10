"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "rgb(var(--theme-background))" }}
    >
      <div className="flex flex-col items-center max-w-md text-center gap-6">
        <div className="p-4 rounded-full bg-amber-500/10">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold" style={{ color: "rgb(var(--theme-text))" }}>
            Something went wrong
          </h1>
          <p className="text-sm" style={{ color: "rgb(var(--theme-text-muted))" }}>
            An error occurred loading this page. You can try again or return to the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button variant="outline" onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="secondary" className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
