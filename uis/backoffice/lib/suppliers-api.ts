import type {
  Supplier,
  SupplierCreate,
  ApiResponse,
} from "./suppliers-types";
import { authenticatedFetch } from "./authenticated-fetch";
import {
  ACCESS_DENIED_ACTION_MESSAGE,
  ACCESS_DENIED_MESSAGE,
  ACTION_UNAVAILABLE_MESSAGE,
  ApiError,
} from "./api-error";

/** Build a clean, user-friendly error for a failed response — never a raw
 * status code or stack trace. 403 always gets the "wrong role" message and
 * 405 the "not available" message, regardless of the backend's detail
 * text, since neither is fixed by retrying the same request. */
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

// ── Metadata constants (mirrors candidate-meta.ts pattern) ─────

export const PRODUCT_CATEGORIES = [
  "Meat",
  "Produce",
  "Beverages",
  "Dairy",
  "Seafood",
  "Spices",
  "Other",
] as const;

export const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}));

export const SUPPLIER_STATUSES = ["active", "suspended"] as const;

export const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
] as const;

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
};

export const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-rose-100 text-rose-700",
};

export const CATEGORY_STYLES: Record<string, string> = {
  Meat: "bg-red-100 text-red-700",
  Produce: "bg-green-100 text-green-700",
  Beverages: "bg-sky-100 text-sky-700",
  Dairy: "bg-amber-100 text-amber-700",
  Seafood: "bg-cyan-100 text-cyan-700",
  Spices: "bg-orange-100 text-orange-700",
  Other: "bg-zinc-100 text-zinc-600",
};

// ── API helpers ─────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL as string;

export async function fetchSuppliers(params?: {
  product_category?: string;
  status?: string;
}): Promise<Supplier[]> {
  const query = new URLSearchParams();
  if (params?.product_category) query.set("product_category", params.product_category);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  const url = `/api/proxy/suppliers${qs ? `?${qs}` : ""}`;

  const res = await authenticatedFetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load suppliers right now. Please try again.");
  }

  const json: ApiResponse<Supplier[]> = await res.json().catch(() => null) ?? { success: false, message: "", data: [] };
  if (!json.success) throw new ApiError(json.message || "We couldn't load suppliers right now. Please try again.", res.status);
  return json.data ?? [];
}

export async function fetchSupplier(id: number): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/proxy/suppliers/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load this supplier. Please try again.", {
      notFound: "We couldn't find this supplier.",
    });
  }

  const json: ApiResponse<Supplier> = await res.json();
  if (!json.success) throw new ApiError(json.message || "We couldn't find this supplier.", res.status);
  return json.data;
}

export async function createSupplier(
  payload: SupplierCreate,
): Promise<Supplier> {
  const res = await authenticatedFetch("/api/proxy/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't add this supplier. Please check the details and try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  const json: ApiResponse<Supplier> = await res.json();
  if (!json.success) throw new ApiError(json.message || "We couldn't add this supplier. Please try again.", res.status);
  return json.data;
}

export async function updateSupplierRate(
  id: number,
  rate: number,
): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/proxy/suppliers/${id}/rate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rate }),
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't update this supplier's rate. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  const json: ApiResponse<Supplier> = await res.json();
  if (!json.success) throw new ApiError(json.message || "We couldn't update this supplier's rate. Please try again.", res.status);
  return json.data;
}

export async function updateSupplierStatus(
  id: number,
  status: "active" | "suspended",
): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/proxy/suppliers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't update this supplier's status. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }

  const json: ApiResponse<Supplier> = await res.json();
  if (!json.success) throw new ApiError(json.message || "We couldn't update this supplier's status. Please try again.", res.status);
  return json.data;
}

export async function deleteSupplier(id: number): Promise<void> {
  const res = await authenticatedFetch(`/api/proxy/suppliers/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't delete this supplier. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
}
