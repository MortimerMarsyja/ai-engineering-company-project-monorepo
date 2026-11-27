"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, TrendingUp, Target } from "lucide-react";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import KPICard from "@/components/KPICard";
import RevenueForecastChart from "@/components/RevenueForecastChart";
import ModelComparisonChart from "@/components/ModelComparisonChart";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import RestrictedState from "@/components/RestrictedState";
import { useStaffGate } from "@/hooks/useStaffGate";
import { isRetryableError } from "@/lib/api-error";
import { fetchSalesForecast } from "@/lib/sales-forecast-api";
import { formatUSD, MODEL_LABELS, type ModelKey, type SalesForecastResponse } from "@/lib/sales-forecast";

const ICON_CLASS = "size-5";

/** Same shape as a real response, used only to keep KPICard/the charts
 * mounted (with the real layout, no real numbers) while the first fetch
 * is in flight — PageSkeleton's CSS then masks every value and visual
 * into a placeholder. Never shown as real data: `isLoading` always gates it. */
function buildPlaceholderReport(): SalesForecastResponse {
  const months = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, "0")}-01`);
  const flat = months.map((month) => ({ month, revenue_usd: 1 }));
  const metrics = { mse: 1, rmse: 1, mae: 1, r2: 1, wape: 1, gini_regression: 1 };
  return {
    random_forest_revenue: { name: "", metrics },
    random_forest_growth: { name: "", metrics },
    baseline: { name: "", metrics },
    best_model: { winner: "random_forest_growth", ranking: [{ model: "random_forest_growth", mae: 1 }] },
    forecast: flat,
    historical: flat,
    test_period: { months, actual: months.map(() => 1), random_forest_revenue: months.map(() => 1), random_forest_growth: months.map(() => 1), seasonal_naive: months.map(() => 1) },
    forecast_by_model: { random_forest_revenue: flat, random_forest_growth: flat, seasonal_naive: flat },
  };
}
const PLACEHOLDER_REPORT = buildPlaceholderReport();

export default function SalesForecastPage() {
  const sessionLoading = usePageLoading();
  const staffStatus = useStaffGate();

  const [report, setReport] = useState<SalesForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchSalesForecast();
      setReport(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || staffStatus !== "staff") return;
    load();
  }, [sessionLoading, staffStatus, load]);

  function messageOf(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  const showLoadingSkeleton = sessionLoading || staffStatus === "checking" || isLoading;
  const displayReport = report ?? PLACEHOLDER_REPORT;
  const winner = displayReport.best_model.winner as ModelKey;
  const nextMonth = displayReport.forecast[0];
  const twelveMonthTotal = displayReport.forecast.reduce((sum, m) => sum + m.revenue_usd, 0);

  return (
    <PageSkeleton loading={showLoadingSkeleton && !error}>
      <div className="space-y-8">
        <PageHeader
          title="Sales Forecast"
          description="Monthly revenue forecast — three models trained on data/raw/sales/brasaland_sales.csv, compared on the same held-out test period."
        />

        {!showLoadingSkeleton && staffStatus !== "staff" ? (
          <RestrictedState />
        ) : !showLoadingSkeleton && error ? (
          <ErrorState
            message={messageOf(error, "We couldn't load the sales forecast right now. Please try again.")}
            onRetry={isRetryableError(error) ? load : undefined}
          />
        ) : !showLoadingSkeleton && !report ? (
          <EmptyState
            title="No forecast available yet"
            message="The sales-profit-forecast pipeline hasn't been run yet. Run data/pipelines/sales-profit-forecast/pipeline.py to generate it."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <KPICard
                title="Best model"
                value={MODEL_LABELS[winner]}
                subtitle={`Lowest test-set MAE (${formatUSD(displayReport.best_model.ranking[0].mae)})`}
                icon={<Trophy aria-hidden="true" className={ICON_CLASS} />}
              />
              <KPICard
                title="Next month forecast"
                value={formatUSD(nextMonth.revenue_usd)}
                subtitle={nextMonth.month}
                icon={<Target aria-hidden="true" className={ICON_CLASS} />}
              />
              <KPICard
                title="Next 12 months (total)"
                value={formatUSD(twelveMonthTotal)}
                subtitle={`Forecast using ${MODEL_LABELS[winner]}`}
                icon={<TrendingUp aria-hidden="true" className={ICON_CLASS} />}
              />
            </div>

            <RevenueForecastChart
              historical={displayReport.historical}
              forecastByModel={displayReport.forecast_by_model}
              winner={winner}
            />

            <ModelComparisonChart
              metricsByModel={{
                random_forest_revenue: displayReport.random_forest_revenue.metrics,
                random_forest_growth: displayReport.random_forest_growth.metrics,
                seasonal_naive: displayReport.baseline.metrics,
              }}
              winner={winner}
            />

            <p className="text-xs text-[#221810]/45">
              This pipeline forecasts <strong>revenue</strong>, not profit — see{" "}
              <code>data/pipelines/sales-profit-forecast/README.md</code> for why, and for the full metric
              definitions and known limitations.
            </p>
          </>
        )}
      </div>
    </PageSkeleton>
  );
}
