export interface SalesForecastModelMetrics {
  mse: number;
  rmse: number;
  mae: number;
  r2: number;
  wape: number;
  gini_regression: number;
  psi_predicted_distribution_train_vs_test?: number | null;
}

export interface SalesForecastCandidate {
  name: string;
  metrics: SalesForecastModelMetrics;
}

export interface SalesForecastRankingEntry {
  model: string;
  mae: number;
}

export interface SalesForecastBestModel {
  winner: string;
  ranking: SalesForecastRankingEntry[];
}

export interface SalesForecastMonth {
  month: string;
  revenue_usd: number;
}

export interface SalesForecastTestPeriod {
  months: string[];
  actual: number[];
  random_forest_revenue: number[];
  random_forest_growth: number[];
  seasonal_naive: number[];
}

export interface SalesForecastByModel {
  random_forest_revenue: SalesForecastMonth[];
  random_forest_growth: SalesForecastMonth[];
  seasonal_naive: SalesForecastMonth[];
}

export interface SalesForecastResponse {
  random_forest_revenue: SalesForecastCandidate;
  random_forest_growth: SalesForecastCandidate;
  baseline: SalesForecastCandidate;
  best_model: SalesForecastBestModel;
  forecast: SalesForecastMonth[];
  historical: SalesForecastMonth[];
  test_period: SalesForecastTestPeriod;
  forecast_by_model: SalesForecastByModel;
}

export type ModelKey = "random_forest_revenue" | "random_forest_growth" | "seasonal_naive";

export const MODEL_LABELS: Record<ModelKey, string> = {
  random_forest_revenue: "Random Forest (revenue)",
  random_forest_growth: "Random Forest (YoY growth)",
  seasonal_naive: "Seasonal naive",
};

/** Fixed categorical order/colors, reused everywhere this page shows all
 * three candidates — never cycled, never reassigned when one is
 * filtered out, so a model's color always means the same model. */
export const MODEL_COLORS: Record<ModelKey, string> = {
  random_forest_revenue: "#1d4ed8", // --color-info
  random_forest_growth: "#15803d", // --color-success — also the winner here
  seasonal_naive: "#6b7280", // neutral gray — reference baseline, not a "model"
};

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatMonthLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
