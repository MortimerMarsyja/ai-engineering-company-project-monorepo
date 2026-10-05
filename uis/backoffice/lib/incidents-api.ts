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

export interface FetchIncidentsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  branch?: string;
  origin?: string;
}

async function parseErrorDetail(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? fallback;
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
    throw new Error(await parseErrorDetail(res, `Failed to fetch incidents (${res.status})`));
  }
  return (await res.json()) as IncidentsListResponse;
}

export async function fetchIncident(id: string): Promise<Incident> {
  const res = await authenticatedFetch(`/api/proxy/incidents/${id}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res, `Incident not found (${res.status})`));
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
    throw new Error(await parseErrorDetail(res, `Failed to create incident (${res.status})`));
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
    throw new Error(await parseErrorDetail(res, `Failed to update incident (${res.status})`));
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
    throw new Error(await parseErrorDetail(res, `Failed to update status (${res.status})`));
  }
  return (await res.json()) as Incident;
}

export async function fetchIncidentMetrics(): Promise<IncidentMetrics> {
  const res = await authenticatedFetch("/api/proxy/incidents/metrics", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res, `Failed to fetch metrics (${res.status})`));
  }
  const json = await res.json();
  return json.data as IncidentMetrics;
}

export async function analyzeIncidentsCsv(file: File): Promise<AnalyzeSummary> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await authenticatedFetch("/api/proxy/incidents/analyze", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error(await parseErrorDetail(res, `Failed to analyze CSV (${res.status})`));
  }
  const json = await res.json();
  return json.data as AnalyzeSummary;
}
