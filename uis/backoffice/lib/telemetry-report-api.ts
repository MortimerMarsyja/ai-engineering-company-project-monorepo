import type { TelemetryReportResponse } from "./telemetry-report";
import { authenticatedFetch } from "./authenticated-fetch";
import { ACCESS_DENIED_MESSAGE, ApiError } from "./api-error";

async function buildApiError(res: Response, fallback: string): Promise<ApiError> {
  if (res.status === 403) {
    return new ApiError(ACCESS_DENIED_MESSAGE, 403);
  }
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  const message = typeof detail === "string" && detail.trim() ? detail : fallback;
  return new ApiError(message, res.status);
}

export interface FetchTelemetryReportParams {
  startDate?: string; // ISO 8601, tz-aware
  endDate?: string;
}

/** GET /telemetry/report (via the backoffice proxy). Both bounds omitted
 * defaults, server-side, to the last 7 days (services/api/app/routers/
 * telemetry.py). Unlike /reporting/weekly-location-performance, this
 * endpoint never 404s for "no data in range" — it returns real zero
 * counts for `events_per_day` (every day is zero-filled) and empty arrays
 * for the other metrics (an operation/error with no occurrences is simply
 * absent, never a fabricated zero row) — see
 * app.services.telemetry_analysis's module docstring. */
export async function fetchTelemetryReport(
  params: FetchTelemetryReportParams = {},
): Promise<TelemetryReportResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set("start_date", params.startDate);
  if (params.endDate) query.set("end_date", params.endDate);
  const qs = query.toString();

  const res = await authenticatedFetch(`/api/proxy/telemetry/report${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load the telemetry report right now. Please try again.");
  }
  return (await res.json()) as TelemetryReportResponse;
}
