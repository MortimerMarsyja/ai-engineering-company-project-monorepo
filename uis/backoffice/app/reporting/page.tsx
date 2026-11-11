"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import KPICard from "@/components/KPICard";
import WeeklyPerformanceTable from "@/components/WeeklyPerformanceTable";
import CostByLocationChart from "@/components/CostByLocationChart";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { isRetryableError } from "@/lib/api-error";
import { fetchWeeklyLocationPerformance } from "@/lib/reporting-api";
import {
  COUNTRY_NAMES,
  formatCurrency,
  formatWeekRange,
  totalEventCounts,
  totalsByCurrency,
  type WeeklyLocationPerformanceResponse,
} from "@/lib/reporting";

const emptySearchParams = new URLSearchParams();

export default function ReportingPage() {
  return (
    <Suspense fallback={<PageSkeleton loading><ReportingContent searchParams={emptySearchParams} /></PageSkeleton>}>
      <ReportingWithSearchParams />
    </Suspense>
  );
}

function ReportingWithSearchParams() {
  const searchParams = useSearchParams();
  return <ReportingContent searchParams={searchParams} />;
}

function ReportingContent({
  searchParams,
}: {
  searchParams: Pick<URLSearchParams, "get" | "toString">;
}) {
  const sessionLoading = usePageLoading();
  const router = useRouter();

  const weekStart = searchParams.get("week_start") ?? "";

  const [report, setReport] = useState<WeeklyLocationPerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const setWeekStart = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("week_start", value);
    else params.delete("week_start");
    router.push(`/reporting?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchWeeklyLocationPerformance(weekStart || undefined);
      setReport(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading, load]);

  function messageOf(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  const locations = report?.locations ?? [];
  const currencyTotals = totalsByCurrency(locations);
  const eventTotals = totalEventCounts(locations);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly Cost & Waste Report"
        description="Purchase cost, waste cost, and stock risk by location — refreshed every Monday morning (UTC)."
        actions={
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700">Week starting (Monday)</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-44 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              aria-label="Select the ISO week to view (defaults to the most recently completed report)"
            />
          </label>
        }
      />

      {error ? (
        <ErrorState
          message={messageOf(error, "We couldn't load the weekly cost & waste report right now. Please try again.")}
          onRetry={isRetryableError(error) ? load : undefined}
        />
      ) : null}

      {!error && !isLoading && !report ? (
        <EmptyState
          title="No report available for this period"
          message={
            weekStart
              ? `The weekly-location-performance pipeline hasn't produced a report for the week of ${weekStart} yet.`
              : "The weekly-location-performance pipeline hasn't completed a successful run yet. Once it has, this page will show the most recent week automatically."
          }
        />
      ) : null}

      {!error && report ? (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
            Showing data for the week of{" "}
            <span className="font-semibold text-zinc-900">{formatWeekRange(report.week_start)}</span>
            {" "}(ISO week starting {report.week_start}, UTC)
          </div>

          {locations.length === 0 ? (
            <EmptyState
              title="No location activity for this week"
              message="The report ran successfully, but no location had any purchase, waste, stockout, or price-alert activity this week."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {currencyTotals.map((totals) => (
                  <KPICard
                    key={`purchase-${totals.currency}`}
                    title={`Purchase cost — ${totals.currency}`}
                    value={formatCurrency(totals.totalPurchaseCost, totals.currency)}
                    subtitle="Costo de compra por local (sum across locations)"
                    icon="💰"
                  />
                ))}
                {currencyTotals.map((totals) => (
                  <KPICard
                    key={`waste-${totals.currency}`}
                    title={`Waste cost — ${totals.currency}`}
                    value={formatCurrency(totals.totalWasteCost, totals.currency)}
                    subtitle="Costo de merma por local (sum across locations)"
                    icon="🗑️"
                  />
                ))}
                <KPICard
                  title="Stockout events"
                  value={eventTotals.stockoutEventsCount}
                  subtitle="Frecuencia de quiebre de stock (all locations)"
                  icon="📦"
                />
                <KPICard
                  title="Price alert events"
                  value={eventTotals.priceAlertEventsCount}
                  subtitle="Frecuencia de alertas de precio (all locations)"
                  icon="⚠️"
                />
              </div>

              <CostByLocationChart locations={locations} />

              <div>
                <h2 className="mb-3 text-base font-semibold text-zinc-900">By location</h2>
                <WeeklyPerformanceTable locations={locations} />
              </div>

              <p className="text-xs text-zinc-400">
                Locations: {locations.map((l) => `${l.location_id} (${COUNTRY_NAMES[l.country]})`).join(", ")}
              </p>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
