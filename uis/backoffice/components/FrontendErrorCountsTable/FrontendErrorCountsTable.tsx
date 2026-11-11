import type { FrontendErrorCountEntry } from "@/lib/telemetry-report";

export interface FrontendErrorCountsTableProps {
  errors: FrontendErrorCountEntry[];
}

/** Raw counts of captured `frontend_error_detected` events, by error
 * name — never shown as a rate (no meaningful denominator exists for a
 * per-error-type rate; see telemetry_analysis.py's own docstring). Rows
 * come pre-sorted (count desc) from the backend. */
export default function FrontendErrorCountsTable({ errors }: FrontendErrorCountsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Frontend error counts by type</caption>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-4 py-3 font-medium">Error type</th>
              <th scope="col" className="px-4 py-3 font-medium">Occurrences</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {errors.map((error) => (
              <tr key={error.error_name}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-700">{error.error_name}</td>
                <td className="px-4 py-3 font-semibold text-zinc-900">{error.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
