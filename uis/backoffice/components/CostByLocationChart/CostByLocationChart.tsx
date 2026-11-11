import { formatCurrency, type ReportingCurrency, type WeeklyLocationPerformanceEntry } from "@/lib/reporting";

export interface CostByLocationChartProps {
  locations: WeeklyLocationPerformanceEntry[];
}

/** Purchase cost vs. waste cost per location — "Costo de compra por
 * local" and "Costo de merma por local" (docs/company-briefing.md
 * section 2), read straight from the API response. One chart per
 * currency: COP and USD locations are never plotted on the same bar
 * scale, so nothing here implies a currency conversion that doesn't
 * exist (docs/company-briefing.md section 7, "nunca mezcles monedas"). */
export default function CostByLocationChart({ locations }: CostByLocationChartProps) {
  const byCurrency = new Map<ReportingCurrency, WeeklyLocationPerformanceEntry[]>();
  for (const location of locations) {
    const group = byCurrency.get(location.currency) ?? [];
    group.push(location);
    byCurrency.set(location.currency, group);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Purchase cost vs. waste cost by location</h3>
          <p className="text-sm text-gray-500">Costo de compra por local vs. costo de merma por local</p>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-brasa-red" aria-hidden="true" />
            Purchase cost
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-400" aria-hidden="true" />
            Waste cost
          </span>
        </div>
      </div>

      <div className="space-y-8">
        {[...byCurrency.entries()].map(([currency, group]) => {
          const maxValue = Math.max(1, ...group.map((l) => Math.max(l.total_purchase_cost, l.total_waste_cost)));
          return (
            <div key={currency}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{currency}</p>
              <div data-skeleton-visual className="space-y-3">
                {group.map((location) => (
                  <div key={location.location_id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 truncate text-sm font-medium text-gray-700" title={location.location_id}>
                      {location.location_id}
                    </span>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-3 rounded bg-brasa-red"
                            style={{ width: `${(location.total_purchase_cost / maxValue) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs text-gray-500">
                          {formatCurrency(location.total_purchase_cost, currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-3 rounded bg-amber-400"
                            style={{ width: `${(location.total_waste_cost / maxValue) * 100}%` }}
                          />
                        </div>
                        <span className="w-24 shrink-0 text-right text-xs text-gray-500">
                          {formatCurrency(location.total_waste_cost, currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
