"use client";

import { useEffect } from "react";
import { sanitizeErrorMessage, track } from "@/lib/telemetry";

/**
 * Catches errors thrown in the root layout itself (app/layout.tsx) — the
 * one case app/error.tsx structurally cannot catch, since it is rendered
 * *inside* the layout. Per Next.js App Router convention this replaces the
 * whole document when active, so it renders its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("frontend_error_detected", {
      route: typeof window !== "undefined" ? window.location.pathname : "",
      error_name: error.name || "Error",
      error_message: sanitizeErrorMessage(error.message || "Unknown error"),
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-sm text-center">
            <h1 className="text-xl font-bold text-gray-950">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              An unexpected error occurred. Try reloading the page.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 min-h-11 rounded-md bg-brasa-red px-4 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-brasa-red-dark focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
