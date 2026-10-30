import { decodeJwtPayload, TOKEN_STORAGE_KEY } from "@/lib/auth";
import type { Country } from "@/lib/inventory-types";

/**
 * Client-side telemetry queue/sender for the backoffice.
 *
 * Contract: docs/event-envelope.md (envelope fields), docs/event-delivery-strategy.md
 * (batch cadence, retry/backoff, reliable flush on tab close), and the
 * backend's `TelemetryEvent` model (services/api/app/models/telemetry.py).
 *
 * Public surface:
 * - `track(eventType, properties)` — the single tracking entry point. Every
 *   backoffice call site that wants to emit a telemetry event must go
 *   through it instead of calling `fetch`/`axios` directly.
 * - `initTelemetry()` — starts the background flush timer and the
 *   `visibilitychange` listener once, for the app's lifetime. Returns a
 *   cleanup function (see `components/AppShell/AppShell.tsx`).
 * - `startSession()` / `endSession()` — integration points for the real
 *   login/logout lifecycle (see `app/login/page.tsx` and
 *   `lib/authenticated-fetch.ts`), not a general tracking API.
 */

// ── Shared constant (envelope `schemaVersion`) ──────────────────────────
// No shared constant for this existed anywhere in the repo yet (checked
// docs/ and packages/shared/types) — this is the first version of every
// event's `properties` shape defined in docs/event-schemas.json.
export const TELEMETRY_SCHEMA_VERSION = "1.0.0";

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE_SIZE = 20;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;

/**
 * The envelope this module builds internally. Intentionally separate from
 * `@repo/shared-types`'s `BrasalandTelemetryEventSchemas`: that type is a
 * closed, 20-way discriminated union with a strict `properties` shape per
 * `event_type` (docs/event-schemas.json), whereas `track()` accepts any
 * `eventType` string with an open `properties` bag — the two can't share a
 * type without weakening the strict one. Field names/order match the
 * backend's `TelemetryEvent` model exactly (eventId, timestamp, sessionId,
 * userId, event_type, schemaVersion, requestId, properties).
 */
interface QueuedTelemetryEvent {
  eventId: string;
  timestamp: string;
  sessionId: string;
  userId: string | null;
  event_type: string;
  schemaVersion: string;
  requestId: string | null;
  properties: Record<string, unknown>;
}

let queue: QueuedTelemetryEvent[] = [];
let sessionId: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let warnedMissingEndpoint = false;

// ── UUID generation ──────────────────────────────────────────────────────
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback RFC 4122 v4 generator for environments without crypto.randomUUID
  // (older browsers; some test environments).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── sessionId: tied to the real authenticated-session lifecycle ─────────
// `startSession()` is called from app/login/page.tsx right after a
// successful login (token persisted); `endSession()` is called from
// lib/authenticated-fetch.ts's `logout()` — the single choke point for the
// manual "Log out" button, the no-token guard, and the 401 interceptor.
//
// Unauthenticated tracking policy (undefined by the plan, documented here):
// a `sessionId` is still required on every event (docs/event-envelope.md
// section 1 treats it as non-null for anything originating in a browser
// session), so `getSessionId()` lazily creates one on first use if no
// session has been started yet — covering e.g. a `page_viewed` on the
// login page, or a `login_failed` event, before any successful login. This
// lazily-created id is distinct from, and never reused as, an
// authenticated session's id: `startSession()` always overwrites it with a
// fresh one at login, and `endSession()` clears it so nothing captured
// after logout can be attributed to the session that just ended.
export function startSession(): void {
  sessionId = generateUUID();
}

export function endSession(): void {
  flush();
  sessionId = null;
}

function getSessionId(): string {
  if (!sessionId) {
    sessionId = generateUUID();
  }
  return sessionId;
}

// ── userId: decoded fresh from the stored JWT at CAPTURE time ───────────
// Matches the existing style in lib/authenticated-fetch.ts (reads
// TOKEN_STORAGE_KEY fresh each time, no caching). Reading it at capture
// time (inside buildEvent, not at send time) is deliberate: an event
// queued while User A is logged in keeps `userId: "A"` even if it is only
// actually sent after User A logs out (or User B logs in) — queued events
// are never re-attributed to a different user.
function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  return typeof claims?.sub === "string" ? claims.sub : null;
}

// ── Approved-property derivation helpers (docs/event-envelope.md section 6) ──
// Shared by every call site that builds inventory event `properties`, so the
// derivation rule lives in exactly one place and every event agrees on it.

/** "Colombia"/"United States" -> "CO"/"US" (the approved `country` values —
 * the app's own data model still uses the full names, see inventory-types.ts). */
export function toCountryCode(country: Country): "CO" | "US" {
  return country === "Colombia" ? "CO" : "US";
}

/** CO -> COP, US -> USD. No currency field exists anywhere in the inventory
 * data model (docs/event-envelope.md section 8) — this is the approved
 * derivation from `country`, not a read of a real stored value. */
export function toCurrency(country: Country): "COP" | "USD" {
  return toCountryCode(country) === "CO" ? "COP" : "USD";
}

/** "{COUNTRY}-{CITY}", e.g. "CO-MEDELLIN", "US-MIAMI" — the synthetic
 * `location_id` defined in docs/event-envelope.md section 6 (there is no
 * sedes/location table with its own code in the inventory data model). */
export function toLocationId(country: Country, city: string | null): string {
  const normalizedCity = (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (Medellín -> Medellin)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${toCountryCode(country)}-${normalizedCity}`;
}

/** SHA-256 hex of the lowercased email — the approved `email_hash` shape
 * for `login_failed`/`password_reset_requested` (docs/event-envelope.md
 * section 5: seudonimizado, nunca el email en claro). Never send the raw
 * email to `track()`. */
export async function hashEmailForTelemetry(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Strips anything that looks like a JWT (three dot-separated base64url
 * segments) or a `Bearer ...` header value out of an error/stack message
 * before it is ever queued, then truncates to the approved 500-character
 * limit for `frontend_error_detected`/`form_submission_failed`
 * (docs/event-envelope.md section 5). */
export function sanitizeErrorMessage(message: string, maxLength = 500): string {
  const withoutBearer = message.replace(/Bearer\s+\S+/gi, "[redacted]");
  const withoutJwt = withoutBearer.replace(
    /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    "[redacted]",
  );
  return withoutJwt.length > maxLength ? `${withoutJwt.slice(0, maxLength - 1)}…` : withoutJwt;
}

// ── Global error capture ─────────────────────────────────────────────────
// Two listeners, each catching errors React's own render-tree error
// boundaries (app/error.tsx, app/global-error.tsx) structurally cannot:
// `error` fires for uncaught sync errors in event handlers/timers (React
// error boundaries only catch errors thrown during render/effects, never
// inside an event handler); `unhandledrejection` fires for promise
// rejections nobody awaited/caught. The two never overlap with each other
// or with the React boundaries by construction — see docs/event-envelope.md.
function handleWindowError(event: ErrorEvent): void {
  track("frontend_error_detected", {
    route: window.location.pathname,
    error_name: event.error instanceof Error ? event.error.name : "Error",
    error_message: sanitizeErrorMessage(event.message || String(event.error ?? "Unknown error")),
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  track("frontend_error_detected", {
    route: window.location.pathname,
    error_name: reason instanceof Error ? reason.name : "UnhandledRejection",
    error_message: sanitizeErrorMessage(
      reason instanceof Error ? reason.message : String(reason),
    ),
  });
}

function buildEvent(eventType: string, properties: Record<string, unknown>): QueuedTelemetryEvent {
  return {
    eventId: generateUUID(),
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    userId: getUserId(),
    event_type: eventType,
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    // No request-id correlation mechanism exists anywhere in the repo yet
    // (no middleware assigns one — see docs/event-envelope.md section 1,
    // confirmed by grep against services/api and uis/backoffice). Setting
    // this to a freshly generated, unrelated UUID would *imply* a
    // correlation with a backend request that doesn't exist, which the
    // plan explicitly warns against — so it stays `null` until a real
    // correlation mechanism exists to source it from.
    requestId: null,
    properties,
  };
}

// ── Sending, with exponential backoff ────────────────────────────────────
// Applies only to the interval/size-triggered path below — the
// visibilitychange/sendBeacon path is fire-and-forget by design (the tab
// may be closing, so there is no time left to wait and retry). `events` is
// the same array reference across retries — eventId/timestamp/every field
// are never regenerated, and events captured while a send is in flight go
// into the live `queue`, never into this array (see `flush()`).
async function sendBatch(events: QueuedTelemetryEvent[], attempt = 0): Promise<void> {
  if (events.length === 0) return;

  const endpoint = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
  if (!endpoint) {
    if (!warnedMissingEndpoint) {
      warnedMissingEndpoint = true;
      console.warn("[telemetry] NEXT_PUBLIC_TELEMETRY_ENDPOINT is not set; telemetry delivery is disabled.");
    }
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
    if (!response.ok) {
      throw new Error(`Telemetry endpoint responded with ${response.status}`);
    }
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      console.warn(
        `[telemetry] giving up after ${MAX_RETRIES} retries, discarding batch of ${events.length} event(s).`,
        error,
      );
      return;
    }
    const delay = BASE_RETRY_DELAY_MS * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return sendBatch(events, attempt + 1);
  }
}

/**
 * Snapshot-and-clear the live queue, then send it. Safe to call
 * concurrently/repeatedly (e.g. the interval firing right after a
 * size-triggered flush, or `endSession()` flushing on top of the
 * interval): each call atomically grabs only what is currently queued, so
 * two calls can never grab the same events — there is nothing to
 * de-duplicate on this side, and events captured after a flush starts are
 * never part of the batch already in flight.
 */
function flush(): void {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  void sendBatch(batch);
}

// ── Reliable flush on tab close/hide ─────────────────────────────────────
function flushWithBeacon(): void {
  if (queue.length === 0) return;
  const endpoint = process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
  if (!endpoint) return;

  const batch = queue;
  queue = [];
  const body = JSON.stringify({ events: batch });

  const beaconAccepted =
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));

  if (beaconAccepted) {
    // `true` only means the browser queued the payload for delivery, not
    // that the server received it — there is nothing more this module can
    // do about that; browser-lifecycle delivery is inherently best effort.
    return;
  }

  // sendBeacon returned false, or isn't available: the events are NOT
  // discarded. `visibilitychange` -> "hidden" does not necessarily mean the
  // tab is closing (it also fires on tab-switch/minimize, and the page
  // keeps running) — so the batch goes back onto the live queue for the
  // next normal flush()/retry cycle to pick up if the page survives, *and*
  // one best-effort fire-and-forget attempt is made right now in case the
  // tab is actually closing and there is no "next flush". If both end up
  // delivering, de-duplication by `eventId` is the ingestion layer's
  // responsibility (already flagged in docs/event-delivery-strategy.md
  // section 3.4) — preferring a possible duplicate over silent loss here.
  queue = [...batch, ...queue];
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Best effort — nothing more to do here.
  });
}

/**
 * Start the background flush timer and the `visibilitychange` listener.
 * Idempotent and safe to call more than once (tears down any previous
 * instance first), so React Strict Mode's dev-only mount→cleanup→mount and
 * Next.js hot reload never produce duplicate timers/listeners. No-ops
 * outside the browser (SSR/build).
 *
 * Call once near the app root (see AppShell.tsx) and use the returned
 * function as the effect's cleanup.
 */
export function initTelemetry(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  teardownBackgroundTasks();

  intervalId = setInterval(flush, FLUSH_INTERVAL_MS);

  visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      flushWithBeacon();
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return teardownBackgroundTasks;
}

function teardownBackgroundTasks(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (visibilityHandler !== null && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }
}

/**
 * Queue a telemetry event. Envelope fields (eventId, timestamp, sessionId,
 * userId, schemaVersion, requestId) are attached automatically — components
 * must only provide `eventType` (mapped to `event_type`) and `properties`,
 * never the envelope fields themselves.
 *
 * Does not start the background timer/listener itself — call
 * `initTelemetry()` once at the app root for that. Events tracked before
 * `initTelemetry()` runs are still queued and get sent once it does (or
 * immediately, if the queue reaches 20 events first).
 */
export function track(eventType: string, properties: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  // A bug in a caller's `properties` (e.g. a getter that throws, a value
  // JSON.stringify can't serialize later) must never propagate out of
  // track() — telemetry failures must not disrupt the app, and must not
  // recursively trigger frontend_error_detected from inside its own
  // window "error" listener (see handleWindowError above).
  try {
    queue.push(buildEvent(eventType, properties));

    if (queue.length >= MAX_QUEUE_SIZE) {
      flush();
    }
  } catch (error) {
    console.warn("[telemetry] track() failed, event dropped.", error);
  }
}
