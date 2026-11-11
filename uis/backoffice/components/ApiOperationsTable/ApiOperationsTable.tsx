import { formatDurationMs, formatErrorRate, type ApiOperationRow } from "@/lib/telemetry-report";

export interface ApiOperationsTableProps {
  operations: ApiOperationRow[];
}

/** Latency + error rate per API operation (endpoint + method) — already
 * joined by `joinApiOperations` (a presentation-layer merge, not a
 * recomputed metric). An operation never captured in the period simply
 * isn't a row here; it is never shown with a fabricated 0ms/0% value. */
export default function ApiOperationsTable({ operations }: ApiOperationsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">API latency and error rate by operation</caption>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th scope="col" className="px-4 py-3 font-medium">Operation</th>
              <th scope="col" className="px-4 py-3 font-medium">Requests</th>
              <th scope="col" className="px-4 py-3 font-medium">Avg. latency</th>
              <th scope="col" className="px-4 py-3 font-medium">p95 latency</th>
              <th scope="col" className="px-4 py-3 font-medium">Errors</th>
              <th scope="col" className="px-4 py-3 font-medium">Error rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {operations.map((op) => (
              <tr key={`${op.method} ${op.endpoint}`}>
                <td className="px-4 py-3">
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-semibold text-zinc-600">
                    {op.method}
                  </span>{" "}
                  <span className="font-mono text-xs text-zinc-700">{op.endpoint}</span>
                </td>
                <td className="px-4 py-3 text-zinc-700">{op.requestCount ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{formatDurationMs(op.meanDurationMs)}</td>
                <td className="px-4 py-3 text-zinc-700">{formatDurationMs(op.p95DurationMs)}</td>
                <td className="px-4 py-3 text-zinc-700">{op.errorCount ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      op.errorRate !== null && op.errorRate > 0
                        ? "font-semibold text-rose-600"
                        : "text-zinc-700"
                    }
                  >
                    {formatErrorRate(op.errorRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
