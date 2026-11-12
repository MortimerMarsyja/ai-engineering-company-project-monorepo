import { NextResponse } from "next/server";

// Must match services/api/app/core/config.py's API_V1_PREFIX — every
// router there is mounted under this prefix (app/main.py).
const API_V1_PREFIX = "/api/v1";

// BACKEND_INTERNAL_URL is container-to-container (Docker service name as
// hostname, e.g. http://backend:8000) — these route handlers run
// server-side, so they must never resolve "localhost" to this container
// itself. NEXT_PUBLIC_API_URL is the browser-facing fallback for local
// dev outside Docker, where both processes share localhost.
//
// The API_V1_PREFIX is appended here rather than required to be baked
// into the env var: a deployed environment that sets this var to the
// bare backend origin (no "/api/v1" suffix) — the exact misconfiguration
// that caused every report page to 404 in production — still resolves
// correctly. A value that already ends with "/api/v1" (as .env.example
// shows) is left as-is, so both forms keep working.
function resolveBackendUrl(): string {
  const base =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000";
  const trimmed = base.replace(/\/+$/, "");
  return trimmed.endsWith(API_V1_PREFIX) ? trimmed : `${trimmed}${API_V1_PREFIX}`;
}

const BACKEND_URL = resolveBackendUrl();

export async function proxyPost(request: Request, endpoint: string) {
  try {
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await response.text();

    return new NextResponse(response.status === 204 ? null : body, {
      status: response.status,
      headers:
        response.status === 204 ? undefined : { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Authentication service is unavailable" },
      { status: 503 },
    );
  }
}

export async function proxyAuthenticated(
  request: Request,
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  try {
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      method,
      headers: {
        Authorization: authorization,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? await request.text() : undefined,
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Profile service is unavailable" },
      { status: 503 },
    );
  }
}