import type { WeeklyLocationPerformanceResponse } from "./reporting";
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

/** GET /reporting/weekly-location-performance (via the backoffice proxy).
 * `week_start` omitted defaults, server-side, to the most recently
 * succeeded run's week (docs/company-briefing.md section 6). Returns
 * `null` specifically for "no report exists yet for this period" (404) —
 * distinct from throwing, which means the call itself failed — so callers
 * can render a real empty state instead of an error for a perfectly valid
 * "nothing computed yet" outcome. */
export async function fetchWeeklyLocationPerformance(
  weekStart?: string,
): Promise<WeeklyLocationPerformanceResponse | null> {
  const query = new URLSearchParams();
  if (weekStart) query.set("week_start", weekStart);
  const qs = query.toString();

  const res = await authenticatedFetch(`/api/proxy/reporting/weekly-location-performance${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load the weekly cost & waste report right now. Please try again.");
  }
  return (await res.json()) as WeeklyLocationPerformanceResponse;
}
