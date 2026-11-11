// Weekly Cost & Waste Report — types matching the backend schema
// (services/api/app/models/schemas.py::WeeklyLocationPerformanceEntry/
// WeeklyLocationPerformanceResponse), which is itself the exact contract
// of docs/company-briefing.md section 6. Field names here are the same
// field names the pipeline (data/pipelines/weekly-location-performance/)
// already computed and persisted — this module never recomputes a KPI,
// it only labels and displays what the API returns.

export type ReportingCountry = "CO" | "US";
export type ReportingCurrency = "COP" | "USD";

/** One row per location for one ISO week — the grain of
 * docs/company-briefing.md section 4 ("una fila por location_id por
 * semana ISO"). */
export interface WeeklyLocationPerformanceEntry {
  location_id: string;
  country: ReportingCountry;
  /** KPI: "Costo de compra por local" */
  total_purchase_cost: number;
  /** KPI: "Costo de merma por local" */
  total_waste_cost: number;
  /** KPI: "Ratio de merma" — total_waste_cost / total_purchase_cost */
  waste_ratio: number;
  /** KPI: "Frecuencia de quiebre de stock" */
  stockout_events_count: number;
  /** KPI: "Frecuencia de alertas de precio" */
  price_alert_events_count: number;
  currency: ReportingCurrency;
}

export interface WeeklyLocationPerformanceResponse {
  week_start: string; // ISO date (Monday, UTC) — the week these rows cover.
  locations: WeeklyLocationPerformanceEntry[];
}

export const COUNTRY_NAMES: Record<ReportingCountry, string> = {
  CO: "Colombia",
  US: "United States",
};

/** The Monday-to-Sunday range a `week_start` covers, for display
 * (docs/company-briefing.md section 4: week_start is the Monday, UTC). */
export function formatWeekRange(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function formatCurrency(value: number, currency: ReportingCurrency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export interface CurrencyTotals {
  currency: ReportingCurrency;
  totalPurchaseCost: number;
  totalWasteCost: number;
}

/** Plain sums of the two cost KPIs per currency — never mixing COP and
 * USD totals together (docs/company-briefing.md section 7). This is
 * presentation-layer addition for an overview card, not a recomputed
 * KPI formula: `waste_ratio` is deliberately NOT aggregated here (an
 * average/sum of per-location ratios would not equal the pipeline's own
 * definition of that KPI) — read it per location only, from
 * `WeeklyPerformanceTable`. */
export function totalsByCurrency(locations: WeeklyLocationPerformanceEntry[]): CurrencyTotals[] {
  const totals = new Map<ReportingCurrency, CurrencyTotals>();
  for (const location of locations) {
    const existing = totals.get(location.currency) ?? {
      currency: location.currency,
      totalPurchaseCost: 0,
      totalWasteCost: 0,
    };
    existing.totalPurchaseCost += location.total_purchase_cost;
    existing.totalWasteCost += location.total_waste_cost;
    totals.set(location.currency, existing);
  }
  return [...totals.values()];
}

/** Combined counts across every location/currency — safe to sum because
 * neither KPI carries a currency (docs/company-briefing.md section 2:
 * both are plain event counts). */
export function totalEventCounts(locations: WeeklyLocationPerformanceEntry[]): {
  stockoutEventsCount: number;
  priceAlertEventsCount: number;
} {
  return locations.reduce(
    (acc, location) => ({
      stockoutEventsCount: acc.stockoutEventsCount + location.stockout_events_count,
      priceAlertEventsCount: acc.priceAlertEventsCount + location.price_alert_events_count,
    }),
    { stockoutEventsCount: 0, priceAlertEventsCount: 0 },
  );
}
