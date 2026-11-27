import type { SalesForecastResponse } from "./sales-forecast";
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

/** GET /sales-forecast (via the backoffice proxy). Returns `null`
 * specifically for "the pipeline hasn't been run yet" (404) — a valid
 * empty state, distinct from throwing (the call itself failed). */
export async function fetchSalesForecast(): Promise<SalesForecastResponse | null> {
  const res = await authenticatedFetch("/api/proxy/sales-forecast", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load the sales forecast right now. Please try again.");
  }
  return (await res.json()) as SalesForecastResponse;
}
