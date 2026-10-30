"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import PageSkeleton from "@/components/PageSkeleton";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { initTelemetry, track } from "@/lib/telemetry";

const publicRoutes = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isPublicRoute = publicRoutes.has(pathname);
  const { status, error, retry } = useAuthGuard(pathname, isPublicRoute);

  // Started once for the whole app lifetime (mounted exactly once in
  // app/layout.tsx, for both public and authenticated routes). initTelemetry
  // is idempotent and the returned cleanup tears down the interval/listener,
  // so React Strict Mode's dev-only double-invoke never leaves duplicates.
  useEffect(() => initTelemetry(), []);

  // page_viewed (docs/event-schemas.json): one event per real navigation,
  // with the previous route as referrer_route (null on the first page of
  // the visit). `lastTrackedRouteRef` guards against both React Strict
  // Mode's dev-only double-invoke (which re-runs this effect once with the
  // exact same `pathname`) and any spurious re-render that doesn't
  // represent a real navigation — a *different* pathname always compares
  // unequal and tracks normally, including a later return to an earlier
  // route, since the ref only ever holds the single most recent value.
  const lastTrackedRouteRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastTrackedRouteRef.current === pathname) return;
    track("page_viewed", { route: pathname, referrer_route: lastTrackedRouteRef.current });
    lastTrackedRouteRef.current = pathname;
  }, [pathname]);

  // Web Vitals -> page_load_recorded. The approved schema only has
  // `lcp_ms`/`ttfb_ms` fields (docs/event-schemas.json); Next.js's
  // useReportWebVitals also reports CLS/FID/INP/FCP, which have no
  // approved property to carry them — those four are intentionally not
  // sent (documented gap, see the Phase 3 completion report) rather than
  // inventing new properties. Each metric arrives via its own callback
  // invocation (LCP and TTFB are never available at the same instant), so
  // each is sent as its own event with the other field `null` (both are
  // nullable in the approved schema) instead of buffering to combine them,
  // which would risk losing data if the page is left first.
  const reportWebVitals = useCallback((metric: { name: string; value: number }) => {
    if (metric.name === "LCP") {
      track("page_load_recorded", {
        route: window.location.pathname,
        lcp_ms: metric.value,
        ttfb_ms: null,
      });
    } else if (metric.name === "TTFB") {
      track("page_load_recorded", {
        route: window.location.pathname,
        lcp_ms: null,
        ttfb_ms: metric.value,
      });
    }
  }, []); // stable reference — required so Next.js's effect subscribes to web-vitals exactly once, not on every render.
  useReportWebVitals(reportWebVitals);

  if (isPublicRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (status === "unavailable") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-950">Unable to verify session</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {error ?? "The authentication service is unavailable. Try again before continuing."}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 min-h-11 rounded-md bg-brasa-red px-4 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-brasa-red-dark focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[168px] min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <PageSkeleton loading={status === "checking"}>
          {children}
        </PageSkeleton>
      </main>
    </div>
  );
}
