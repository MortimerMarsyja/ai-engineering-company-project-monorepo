"use client";

import { useEffect } from "react";
import ErrorState from "@/components/ErrorState";
import { sanitizeErrorMessage, track } from "@/lib/telemetry";

/**
 * Next.js App Router error boundary — catches render/effect errors thrown
 * by any route segment below the root layout. This IS the "Error Boundary"
 * referenced in the Phase 3 instrumentation plan; no separate hand-rolled
 * class component is needed alongside it.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("frontend_error_detected", {
      route: window.location.pathname,
      error_name: error.name || "Error",
      error_message: sanitizeErrorMessage(error.message || "Unknown error"),
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm">
        <ErrorState
          message="Something went wrong loading this page. You can try again, or go back to the dashboard."
          onRetry={reset}
          backHref="/dashboard"
        />
      </div>
    </main>
  );
}
