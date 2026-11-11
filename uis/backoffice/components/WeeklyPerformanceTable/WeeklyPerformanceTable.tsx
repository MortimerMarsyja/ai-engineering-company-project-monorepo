import {
  COUNTRY_NAMES,
  formatCurrency,
  formatRatio,
  type WeeklyLocationPerformanceEntry,
} from "@/lib/reporting";

export interface WeeklyPerformanceTableProps {
  locations: WeeklyLocationPerformanceEntry[];
}

/** One row per location, at the exact grain the pipeline computed it —
 * every KPI from docs/company-briefing.md section 2, labeled with the
 * same names used there, read straight from the API response. No KPI
 * formula is recomputed here. */
export default function WeeklyPerformanceTable({ locations }: WeeklyPerformanceTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Weekly cost and waste performance by location
          </caption>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-4 py-3 font-medium">Location</th>
              <th scope="col" className="px-4 py-3 font-medium">Country</th>
              <th scope="col" className="px-4 py-3 font-medium">Costo de compra por local</th>
              <th scope="col" className="px-4 py-3 font-medium">Costo de merma por local</th>
              <th scope="col" className="px-4 py-3 font-medium">Ratio de merma</th>
              <th scope="col" className="px-4 py-3 font-medium">Frecuencia de quiebre de stock</th>
              <th scope="col" className="px-4 py-3 font-medium">Frecuencia de alertas de precio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {locations.map((location) => (
              <tr key={location.location_id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{location.location_id}</td>
                <td className="px-4 py-3 text-zinc-700">{COUNTRY_NAMES[location.country]}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatCurrency(location.total_purchase_cost, location.currency)}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {formatCurrency(location.total_waste_cost, location.currency)}
                </td>
                <td className="px-4 py-3 text-zinc-700">{formatRatio(location.waste_ratio)}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {location.stockout_events_count}
                  <span className="ml-1 text-xs text-zinc-400">events</span>
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {location.price_alert_events_count}
                  <span className="ml-1 text-xs text-zinc-400">alerts</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
