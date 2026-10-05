import type {
  AnalyzeSummary,
  Incident,
  IncidentCreateInput,
  IncidentMetrics,
  IncidentsListResponse,
  IncidentStatusUpdateInput,
  IncidentUpdateInput,
} from "./incidents";
import { authenticatedFetch } from "./authenticated-fetch";
import {
  ACCESS_DENIED_ACTION_MESSAGE,
  ACCESS_DENIED_MESSAGE,
  ACTION_UNAVAILABLE_MESSAGE,
  ApiError,
} from "./api-error";

export interface FetchIncidentsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  branch?: string;
  origin?: string;
}

/** Build a clean, user-friendly error for a failed response — never a raw
 * status code or stack trace. 403 always gets the "wrong role" message
 * regardless of the backend's detail text, since no amount of retrying
 * changes what a role is allowed to do. */
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

export async function fetchIncidents(
  params: FetchIncidentsParams = {},
): Promise<IncidentsListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);
  if (params.branch) query.set("branch", params.branch);
  if (params.origin) query.set("origin", params.origin);

  const qs = query.toString();
  const res = await authenticatedFetch(`/api/proxy/incidents${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load incidents right now. Please try again.");
  }
  const json = await res.json().catch(() => null);
  return {
    data: json?.data ?? [],
    total: json?.total ?? 0,
    page: json?.page ?? params.page ?? 1,
    limit: json?.limit ?? params.limit ?? 20,
  } satisfies IncidentsListResponse;
}

export async function fetchIncident(id: string): Promise<Incident> {
  const res = await authenticatedFetch(`/api/proxy/incidents/${id}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load this incident. Please try again.", {
      notFound: "We couldn't find this incident. It may have been removed.",
    });
  }
  return (await res.json()) as Incident;
}

export async function createIncident(payload: IncidentCreateInput): Promise<Incident> {
  const res = await authenticatedFetch("/api/proxy/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't log this incident. Please check the details and try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
  return (await res.json()) as Incident;
}

export async function updateIncident(
  id: string,
  payload: IncidentUpdateInput,
): Promise<Incident> {
  const res = await authenticatedFetch(`/api/proxy/incidents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't save these changes. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
  return (await res.json()) as Incident;
}

export async function updateIncidentStatus(
  id: string,
  payload: IncidentStatusUpdateInput,
): Promise<Incident> {
  const res = await authenticatedFetch(`/api/proxy/incidents/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't update this incident's status. Please try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
  return (await res.json()) as Incident;
}

export async function fetchIncidentMetrics(): Promise<IncidentMetrics | null> {
  const res = await authenticatedFetch("/api/proxy/incidents/metrics", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load incident metrics right now.");
  }
  const json = await res.json().catch(() => null);
  return (json?.data ?? null) as IncidentMetrics;
}

export async function analyzeIncidentsCsv(file: File): Promise<AnalyzeSummary> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await authenticatedFetch("/api/proxy/incidents/analyze", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw await buildApiError(res, "We couldn't analyze that CSV. Please check the file and try again.", {
      forbidden: ACCESS_DENIED_ACTION_MESSAGE,
    });
  }
  const json = await res.json().catch(() => null);
  return json?.data as AnalyzeSummary;
}
