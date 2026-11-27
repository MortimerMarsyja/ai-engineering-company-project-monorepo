import { formatUSD, MODEL_COLORS, MODEL_LABELS, type ModelKey, type SalesForecastModelMetrics } from "@/lib/sales-forecast";

export interface ModelComparisonChartProps {
  metricsByModel: Record<ModelKey, SalesForecastModelMetrics>;
  winner: ModelKey;
}

const MODEL_KEYS: ModelKey[] = ["random_forest_revenue", "random_forest_growth", "seasonal_naive"];

const ROWS: { key: "mae" | "rmse"; label: string; format: (v: number) => string }[] = [
  { key: "mae", label: "MAE (lower is better)", format: formatUSD },
  { key: "rmse", label: "RMSE (lower is better)", format: formatUSD },
];

/** MAE/RMSE for all three candidates on the held-out test period (2024-2025,
 * one-month-ahead) — same horizontal-bar pattern as CostByLocationChart,
 * so a reader already familiar with that report reads this one the same
 * way. Each bar is directly labeled with its value and the model's name
 * (never color-only identity), and the winning model is called out by
 * name in both the row and the caption. */
export default function ModelComparisonChart({ metricsByModel, winner }: ModelComparisonChartProps) {
  return (
    <div className="rounded-xl border border-admin-border bg-white p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-[#221810]">Model comparison — test period (2024-2025)</h3>
        <p className="mt-1 text-sm text-[#221810]/55">
          Same 24 held-out months, same ground truth, for all three candidates.
        </p>
      </div>

      <div className="space-y-6">
        {ROWS.map((row) => {
          const maxValue = Math.max(...MODEL_KEYS.map((key) => metricsByModel[key][row.key]));
          return (
            <div key={row.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#221810]/40">{row.label}</p>
              <div data-skeleton-visual className="space-y-2">
                {MODEL_KEYS.map((key) => {
                  const value = metricsByModel[key][row.key];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span
                        className={`w-52 shrink-0 truncate text-sm ${key === winner ? "font-semibold" : "text-[#221810]/70"}`}
                        style={key === winner ? { color: MODEL_COLORS[key] } : undefined}
                      >
                        {MODEL_LABELS[key]}
                        {key === winner ? " ★" : ""}
                      </span>
                      <div className="flex-1 overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-4 rounded"
                          style={{
                            width: `${(value / maxValue) * 100}%`,
                            backgroundColor: MODEL_COLORS[key],
                          }}
                        />
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs text-[#221810]/60">{row.format(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-[#221810]/45">
        ★ {MODEL_LABELS[winner]} has the lowest test-set error and is the model used for the forecast above.
      </p>
    </div>
  );
}
