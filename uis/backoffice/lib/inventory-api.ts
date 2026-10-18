import type {
  ExitReason,
  InboundOrderCreate,
  Order,
  OutboundOrderCreate,
  Product,
} from "./inventory-types";
import { authenticatedFetch } from "./authenticated-fetch";
import {
  ACCESS_DENIED_ACTION_MESSAGE,
  ACCESS_DENIED_MESSAGE,
  ACTION_UNAVAILABLE_MESSAGE,
  ApiError,
} from "./api-error";

export const PRODUCT_CATEGORIES = [
  "Meat",
  "Produce",
  "Beverages",
  "Dairy",
  "Seafood",
  "Spices",
  "Other",
] as const;

export const CATEGORY_STYLES: Record<string, string> = {
  Meat: "bg-red-100 text-red-700",
  Produce: "bg-green-100 text-green-700",
  Beverages: "bg-sky-100 text-sky-700",
  Dairy: "bg-amber-100 text-amber-700",
  Seafood: "bg-cyan-100 text-cyan-700",
  Spices: "bg-orange-100 text-orange-700",
  Other: "bg-zinc-100 text-zinc-600",
};

export const EXIT_REASON_OPTIONS: { value: ExitReason; label: string }[] = [
  { value: "kitchen_use", label: "Kitchen use" },
  { value: "waste", label: "Waste / spoilage" },
  { value: "transfer", label: "Transfer to another location" },
  { value: "other", label: "Other" },
];

export const EXIT_REASON_LABELS: Record<string, string> = {
  kitchen_use: "Kitchen use",
  waste: "Waste / spoilage",
  transfer: "Transfer",
  other: "Other",
};

/** Build a clean, user-friendly error for a failed response — never a raw
 * status code, stack trace, or raw JSON body. 403 always gets the
 * "wrong role" message and 405 the "not available" message, regardless
 * of the backend's detail text, since neither is fixed by retrying the
 * same request. A plain-string `detail` (e.g. the 400 "insufficient
 * stock" error, or the 422 "location mismatch" error) is surfaced as-is
 * since the backend already writes those for a human to read. */
async function buildApiError(
  res: Response,
  fallback: string,
  options?: { notFound?: string; forbidden?: string },
): Promise<ApiError> {
  if (res.status === 403) {
    return new ApiError(options?.forbidden ?? ACCESS_DENIED_MESSAGE, 403);
  }
  if (res.status === 405) {
    return new ApiError(ACTION_UNAVAILABLE_MESSAGE, 405);
  }
  if (res.status === 404 && options?.notFound) {
    return new ApiError(options.notFound, 404);
  }
  const body = await res.json().catch(() => null);
  const detail = body?.detail;
  const message = typeof detail === "string" && detail.trim() ? detail : fallback;
  return new ApiError(message, res.status);
}

export async function fetchProducts(): Promise<Product[]> {
  const res = await authenticatedFetch("/api/proxy/inventory/products", {
    cache: "no-store",
  });
  if (!res.ok) {
    throw await buildApiError(
      res,
      "We couldn't load the inventory right now. Please try again.",
    );
  }
  return (await res.json().catch(() => [])) ?? [];
}

export async function createInboundOrder(
  payload: InboundOrderCreate,
): Promise<void> {
  const res = await authenticatedFetch("/api/proxy/inventory/orders/inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await buildApiError(
      res,
      "We couldn't register this delivery. Please check the details and try again.",
      { forbidden: ACCESS_DENIED_ACTION_MESSAGE },
    );
  }
}

export async function createOutboundOrder(
  payload: OutboundOrderCreate,
): Promise<void> {
  const res = await authenticatedFetch("/api/proxy/inventory/orders/outbound", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await buildApiError(
      res,
      "We couldn't log this withdrawal. Please check the details and try again.",
      { forbidden: ACCESS_DENIED_ACTION_MESSAGE },
    );
  }
}

export async function fetchOrders(): Promise<Order[]> {
  const res = await authenticatedFetch("/api/proxy/inventory/orders", {
    cache: "no-store",
  });
  if (!res.ok) {
    throw await buildApiError(
      res,
      "We couldn't load the order history right now. Please try again.",
    );
  }
  return (await res.json().catch(() => [])) ?? [];
}
