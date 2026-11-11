"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import KPICard from "@/components/KPICard";
import EventsPerDayChart from "@/components/EventsPerDayChart";
import ApiOperationsTable from "@/components/ApiOperationsTable";
import FrontendErrorCountsTable from "@/components/FrontendErrorCountsTable";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { isRetryableError } from "@/lib/api-error";
import { fetchTelemetryReport } from "@/lib/telemetry-report-api";
import { formatReportPeriod, joinApiOperations, type TelemetryReportResponse } from "@/lib/telemetry-report";

const emptySearchParams = new URLSearchParams();

export default function TelemetryReportPage() {
  return (
    <Suspense fallback={<PageSkeleton loading><TelemetryReportContent searchParams={emptySearchParams} /></PageSkeleton>}>
      <TelemetryReportWithSearchParams />
    </Suspense>
  );
}

function TelemetryReportWithSearchParams() {
  const searchParams = useSearchParams();
  return <TelemetryReportContent searchParams={searchParams} />;
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function TelemetryReportContent({
  searchParams,
}: {
  searchParams: Pick<URLSearchParams, "get" | "toString">;
}) {
  const sessionLoading = usePageLoading();
  const router = useRouter();

  const startDate = searchParams.get("start_date") ?? "";
  const endDate = searchParams.get("end_date") ?? "";

  const [report, setReport] = useState<TelemetryReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, `${value}T00:00:00Z`);
    else params.delete(key);
    router.push(`/telemetry-report?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchTelemetryReport({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setReport(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading, load]);

  function messageOf(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  const metrics = report?.metrics;
  const totalEvents = metrics?.events_per_day.reduce((sum, day) => sum + day.event_count, 0) ?? 0;
  const operations = metrics ? joinApiOperations(metrics.api_latency_by_operation, metrics.error_rate_by_operation) : [];
  const totalErrors = metrics?.error_rate_by_operation.reduce((sum, op) => sum + op.error_count, 0) ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Telemetry Operations Report"
        description="Event volume, API latency, and error rates captured across the backoffice and website."
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700">From</span>
              <input
                type="date"
                value={startDate ? toDateInputValue(startDate) : ""}
                onChange={(e) => setParam("start_date", e.target.value)}
                className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                aria-label="Report start date (defaults to 7 days ago)"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700">To</span>
              <input
                type="date"
                value={endDate ? toDateInputValue(endDate) : ""}
                onChange={(e) => setParam("end_date", e.target.value)}
                className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                aria-label="Report end date (defaults to today)"
              />
            </label>
          </div>
        }
      />

      {error ? (
        <ErrorState
          message={messageOf(error, "We couldn't load the telemetry report right now. Please try again.")}
          onRetry={isRetryableError(error) ? load : undefined}
        />
      ) : null}

      {!error && !isLoading && !report ? (
        <EmptyState
          title="No telemetry report available"
          message="The telemetry reporting service didn't return a report for this period."
        />
      ) : null}

      {!error && report ? (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Showing data for{" "}
            <span className="font-semibold text-zinc-900">{formatReportPeriod(report.period.from, report.period.to)}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard title="Total events" value={totalEvents.toLocaleString()} subtitle="captured this period" icon="📈" />
            <KPICard
              title="API operations tracked"
              value={operations.length}
              subtitle="distinct endpoint + method pairs"
              icon="🔌"
            />
            <KPICard title="Total API errors" value={totalErrors.toLocaleString()} subtitle="status ≥ 400" icon="🚨" />
            <KPICard
              title="Frontend error types"
              value={metrics?.frontend_error_counts_by_type.length ?? 0}
              subtitle="distinct error names"
              icon="🐞"
            />
          </div>

          {metrics && metrics.events_per_day.length > 0 ? (
            <EventsPerDayChart days={metrics.events_per_day} />
          ) : null}

          <div>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">API operations</h2>
            {operations.length === 0 ? (
              <EmptyState
                title="No API calls captured"
                message="No authenticated API calls were recorded in this period."
              />
            ) : (
              <ApiOperationsTable operations={operations} />
            )}
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-zinc-900">Frontend errors</h2>
            {metrics && metrics.frontend_error_counts_by_type.length === 0 ? (
              <EmptyState
                title="No frontend errors captured"
                message="No frontend_error_detected events were recorded in this period — this is a genuine zero, not missing data."
              />
            ) : metrics ? (
              <FrontendErrorCountsTable errors={metrics.frontend_error_counts_by_type} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
