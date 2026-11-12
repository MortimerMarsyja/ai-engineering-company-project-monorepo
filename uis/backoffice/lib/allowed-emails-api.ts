import type { AllowedEmailEntry } from "./allowed-emails";
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

export async function fetchAllowedEmails(): Promise<AllowedEmailEntry[]> {
  const res = await authenticatedFetch("/api/proxy/allowed-emails", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't load the allowed-emails list right now.");
  }
  const json = await res.json().catch(() => null);
  return (json?.data ?? []) as AllowedEmailEntry[];
}

export async function addAllowedEmail(email: string): Promise<AllowedEmailEntry> {
  const res = await authenticatedFetch("/api/proxy/allowed-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't add that email. Please try again.");
  }
  const json = await res.json().catch(() => null);
  return json?.data as AllowedEmailEntry;
}

export async function removeAllowedEmail(id: string): Promise<void> {
  const res = await authenticatedFetch(`/api/proxy/allowed-emails/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw await buildApiError(res, "We couldn't remove that email. Please try again.");
  }
}
