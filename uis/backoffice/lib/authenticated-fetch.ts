import { TOKEN_STORAGE_KEY } from "@/lib/auth";
import { endSession, track } from "@/lib/telemetry";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}

/** The approved `endpoint` property (docs/event-schemas.json) wants a route
 * template without ids, to avoid unbounded cardinality. Every path in this
 * app is either a plain integer id (`/inventory/products/42`) or a UUID
 * (`/incidents/{uuid}`) — this heuristic covers both; the query string is
 * dropped entirely (it can carry arbitrary/sensitive values). */
function templateEndpoint(rawPath: string): string {
  const pathOnly = rawPath.split("?")[0];
  return pathOnly
    .replace(/\/\d+(?=\/|$)/g, "/{id}")
    .replace(/\/[0-9a-fA-F-]{20,}(?=\/|$)/g, "/{id}");
}

function extractPath(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url, window.location.origin).pathname;
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function redirectToLogin() {
  if (window.location.pathname !== "/login") {
    window.location.replace("/login");
  }
}

export function logout() {
  endSession();
  clearSession();
  redirectToLogin();
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);

  if (!token) {
    logout();
    throw new AuthenticationRequiredError();
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const method = (init.method ?? "GET").toUpperCase();
  const endpoint = templateEndpoint(extractPath(input));
  const startedAt = performance.now();
  const response = await fetch(input, { ...init, headers });

  // api_latency_recorded (docs/event-schemas.json): every authenticated
  // call goes through this one wrapper, so this is the single place that
  // can measure real end-to-end latency (proxy + backend) for all of them.
  // cache_hit is always null here: the backend doesn't send a cache-hit
  // signal on the response (see docs/cache-evaluation.md) for this generic
  // wrapper to read — not invented.
  track("api_latency_recorded", {
    endpoint,
    method,
    status_code: response.status,
    duration_ms: performance.now() - startedAt,
    cache_hit: null,
  });

  if (response.status === 401) {
    // session_expired (docs/event-schemas.json): reported once, here —
    // the single choke point for every 401 from an already-authenticated
    // call (the "no token at all" branch above is a different case: there
    // was no session to expire). Not reported again from any individual
    // page, so a page that calls authenticatedFetch multiple times never
    // double-reports the same expiry.
    track("session_expired", {
      route_at_expiry: window.location.pathname,
      // No `iat` claim exists on the issued token (services/api/app/core/security.py),
      // so token age cannot be computed from it — documented gap, see
      // docs/event-envelope.md section 8.
      token_age_seconds: null,
    });
    logout();
    throw new AuthenticationRequiredError();
  }

  return response;
}