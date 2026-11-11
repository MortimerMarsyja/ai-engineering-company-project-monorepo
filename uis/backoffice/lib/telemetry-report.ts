// Operational telemetry report — types matching GET /telemetry/report
// (services/api/app/routers/telemetry.py +
// services/api/app/services/telemetry_analysis.py). Technical/operational
// metrics only (volume, latency, errors) — never business/sales KPIs,
// which is what /reporting (lib/reporting.ts) covers instead.

export interface EventsPerDayEntry {
  date: string; // "YYYY-MM-DD", UTC calendar day
  event_count: number;
}

export interface ApiLatencyEntry {
  endpoint: string;
  method: string;
  request_count: number;
  mean_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  max_duration_ms: number;
}

export interface ErrorRateEntry {
  endpoint: string;
  method: string;
  request_count: number;
  error_count: number;
  error_rate: number; // 0..1
}

export interface FrontendErrorCountEntry {
  error_name: string;
  count: number;
}

export interface TelemetryReportMetrics {
  events_per_day: EventsPerDayEntry[];
  api_latency_by_operation: ApiLatencyEntry[];
  error_rate_by_operation: ErrorRateEntry[];
  frontend_error_counts_by_type: FrontendErrorCountEntry[];
}

export interface TelemetryReportResponse {
  period: { from: string; to: string };
  metrics: TelemetryReportMetrics;
}

/** One row per (endpoint, method) combining latency + error-rate metrics
 * for a single operations table — a presentation-layer join by key, never
 * a recomputation: every number here is copied verbatim from one of the
 * two already-computed lists the backend returned. An operation present
 * in only one of the two lists (shouldn't normally happen, since both
 * derive from the same `api_latency_recorded` events) still gets a row,
 * with the missing side left `null` rather than fabricated as 0. */
export interface ApiOperationRow {
  endpoint: string;
  method: string;
  requestCount: number | null;
  meanDurationMs: number | null;
  p95DurationMs: number | null;
  errorCount: number | null;
  errorRate: number | null;
}

export function joinApiOperations(
  latency: ApiLatencyEntry[],
  errorRates: ErrorRateEntry[],
): ApiOperationRow[] {
  const byKey = new Map<string, ApiOperationRow>();
  const keyOf = (endpoint: string, method: string) => `${method} ${endpoint}`;

  for (const entry of latency) {
    byKey.set(keyOf(entry.endpoint, entry.method), {
      endpoint: entry.endpoint,
      method: entry.method,
      requestCount: entry.request_count,
      meanDurationMs: entry.mean_duration_ms,
      p95DurationMs: entry.p95_duration_ms,
      errorCount: null,
      errorRate: null,
    });
  }
  for (const entry of errorRates) {
    const key = keyOf(entry.endpoint, entry.method);
    const existing = byKey.get(key) ?? {
      endpoint: entry.endpoint,
      method: entry.method,
      requestCount: null,
      meanDurationMs: null,
      p95DurationMs: null,
      errorCount: null,
      errorRate: null,
    };
    existing.errorCount = entry.error_count;
    existing.errorRate = entry.error_rate;
    byKey.set(key, existing);
  }

  return [...byKey.values()].sort((a, b) =>
    a.endpoint === b.endpoint ? a.method.localeCompare(b.method) : a.endpoint.localeCompare(b.endpoint),
  );
}

export function formatDurationMs(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(0)} ms`;
}

export function formatErrorRate(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatReportPeriod(from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}
