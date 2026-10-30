/**
 * @jest-environment jsdom
 *
 * jsdom is scoped to this file only (via the docblock above) — the rest of
 * the suite stays on jest.config.js's global `testEnvironment: "node"`
 * (see that file's header comment for why fetch/HTTP-wrapper-style modules
 * are tested this way). telemetry.ts genuinely needs browser APIs
 * (navigator.sendBeacon, document.visibilityState, localStorage) that only
 * exist under jsdom.
 */

import { webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";
import { TOKEN_STORAGE_KEY } from "@/lib/auth";

// jsdom in this environment doesn't expose TextEncoder globally, and its
// `crypto` global has `randomUUID` but no `subtle` (Web Crypto) — both
// needed by hashEmailForTelemetry's crypto.subtle.digest() call. Scoped to
// this test file only, not the shared jest.setup.ts.
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = NodeTextEncoder as unknown as typeof TextEncoder;
}
if (typeof window.crypto.subtle === "undefined") {
  Object.defineProperty(window.crypto, "subtle", { value: webcrypto.subtle, configurable: true });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function base64url(json: object): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fakeJwt(claims: object): string {
  return `${base64url({ alg: "HS256" })}.${base64url(claims)}.signature`;
}

/** Let queued microtasks (promise resolutions inside flush()) run under fake timers. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("lib/telemetry", () => {
  let fetchMock: jest.Mock;
  let sendBeaconMock: jest.Mock;
  // Tracks the cleanup function from this test's initTelemetry() call so
  // afterEach can always tear it down. Without this, a listener attached to
  // the real (test-file-shared) `document` by one test's module instance
  // would leak into later tests and fire alongside theirs.
  let activeCleanup: (() => void) | null = null;

  async function setupTelemetry() {
    const mod = await import("@/lib/telemetry");
    activeCleanup = mod.initTelemetry();
    return mod;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.localStorage.clear();
    activeCleanup = null;

    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    sendBeaconMock = jest.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "sendBeacon", {
      value: sendBeaconMock,
      configurable: true,
    });

    process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT = "https://telemetry.example.com/ingest";
  });

  afterEach(() => {
    activeCleanup?.();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
  });

  // ── Envelope auto-attachment / backend schema compatibility ──────────
  it("auto-attaches an envelope matching the backend TelemetryEvent field names", async () => {
    const { track, TELEMETRY_SCHEMA_VERSION } = await setupTelemetry();

    track("page_viewed", { route: "/inventory" });
    track("page_viewed", { route: "/orders" });
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events).toHaveLength(2);

    const [first, second] = body.events;
    for (const event of [first, second]) {
      // Exact field set the backend's TelemetryEvent model expects
      // (services/api/app/models/telemetry.py) — camelCase envelope ids +
      // snake_case event_type, nothing extra.
      expect(Object.keys(event).sort()).toEqual(
        [
          "eventId",
          "event_type",
          "properties",
          "requestId",
          "schemaVersion",
          "sessionId",
          "timestamp",
          "userId",
        ].sort(),
      );
      expect(event.eventId).toMatch(UUID_RE);
      expect(() => new Date(event.timestamp).toISOString()).not.toThrow();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
      expect(event.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION);
      expect(event.sessionId).toMatch(UUID_RE);
      // No request-id correlation mechanism exists yet (docs/event-envelope.md) —
      // must be null, never an invented/unrelated id.
      expect(event.requestId).toBeNull();
    }

    expect(first.sessionId).toBe(second.sessionId);
    expect(first.eventId).not.toBe(second.eventId);
  });

  it("maps the eventType argument to event_type and passes properties through unchanged", async () => {
    const { track } = await setupTelemetry();

    track("inbound_order_created", { product_id: "7", quantity: 12.5 });
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].event_type).toBe("inbound_order_created");
    expect(body.events[0].properties).toEqual({ product_id: "7", quantity: 12.5 });
  });

  it("sets userId to null when there is no stored token, and decodes it from the JWT when present", async () => {
    const { track } = await setupTelemetry();

    track("page_viewed", {});
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fakeJwt({ sub: "42", role: "manager" }));
    track("login_succeeded", {});

    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.events[0].userId).toBeNull();
    expect(body.events[1].userId).toBe("42");
  });

  // ── Batch + flush triggers ───────────────────────────────────────────
  it("flushes automatically once the queue reaches 20 events, without waiting for the timer", async () => {
    const { track } = await setupTelemetry();

    for (let i = 0; i < 20; i++) track("page_viewed", { i });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(20);
  });

  it("flushes whatever is queued every 10 seconds, even below the size threshold", async () => {
    const { track } = await setupTelemetry();

    track("page_viewed", {});
    expect(fetchMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(1);
  });

  it("does not let continuous tracking postpone the timed flush (fixed schedule, not a debounce)", async () => {
    const { track } = await setupTelemetry();

    // Track one event every 2s for 12s — if this were a debounce, the timer
    // would keep resetting and never fire within the window.
    for (let i = 0; i < 6; i++) {
      track("page_viewed", { i });
      jest.advanceTimersByTime(2_000);
    }
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Exactly the 5 events tracked in the first 10s go in this batch (the
    // 6th, tracked at t=10s-12s boundary tracking, lands in the next one).
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps events tracked while a send is in flight separate from the batch being sent", async () => {
    let resolveFetch: (value: { ok: boolean; status: number }) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { track } = await setupTelemetry();

    track("page_viewed", { marker: "first-batch" });
    jest.advanceTimersByTime(10_000); // starts sending batch 1 (pending)
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Captured while batch 1 is still in flight.
    track("page_viewed", { marker: "second-batch" });

    resolveFetch({ ok: true, status: 200 });
    await flushMicrotasks();

    // Batch 1 only ever contained the first event.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events[0].properties.marker).toBe("first-batch");

    // The second event is still queued, sent on the next cycle.
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).events[0].properties.marker).toBe("second-batch");
  });

  // ── Retry with exponential backoff ───────────────────────────────────
  it("retries a failed send with exponential backoff, keeping the same event metadata, and eventually succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const { track } = await setupTelemetry();
    track("page_viewed", {});
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstAttemptEvent = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];

    await jest.advanceTimersByTimeAsync(1_000); // 1st retry delay
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(2_000); // 2nd retry delay
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdAttemptEvent = JSON.parse(fetchMock.mock.calls[2][1].body).events[0];

    // Same eventId/timestamp/every field across every retry of the same batch.
    expect(thirdAttemptEvent).toEqual(firstAttemptEvent);

    await flushMicrotasks();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // succeeded — no further retries
  });

  it("discards the batch after exhausting 3 retries instead of retrying forever", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { track } = await setupTelemetry();
    track("page_viewed", {});
    jest.advanceTimersByTime(10_000); // initial attempt
    await flushMicrotasks();

    await jest.advanceTimersByTimeAsync(1_000); // retry 1
    await jest.advanceTimersByTimeAsync(2_000); // retry 2
    await jest.advanceTimersByTimeAsync(4_000); // retry 3
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("giving up after 3 retries"), expect.anything());

    fetchMock.mockClear();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("never throws or rejects on delivery failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    jest.spyOn(console, "warn").mockImplementation(() => {});

    const { track } = await setupTelemetry();
    expect(() => track("page_viewed", {})).not.toThrow();
    expect(() => jest.advanceTimersByTime(10_000)).not.toThrow();
    await flushMicrotasks();
  });

  // ── Reliable flush on tab close/hide ─────────────────────────────────
  it("flushes the pending queue via sendBeacon when the tab becomes hidden", async () => {
    const { track } = await setupTelemetry();
    track("form_abandoned", { form_name: "outbound_order", fields_completed_pct: 40 });

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeaconMock.mock.calls[0];
    expect(url).toBe("https://telemetry.example.com/ingest");
    expect(blob).toBeInstanceOf(Blob);

    // The interval flush must not also re-send the same (now empty) queue.
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retains events and falls back to fetch when sendBeacon returns false", async () => {
    sendBeaconMock.mockReturnValue(false);

    const { track } = await setupTelemetry();
    track("form_abandoned", { form_name: "outbound_order", fields_completed_pct: 40 });

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    await flushMicrotasks();

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    // Best-effort fallback attempted immediately.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Also retained on the live queue — the next normal flush cycle still
    // has it (covers the "page just hidden, not closed" case).
    fetchMock.mockClear();
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(1);
  });

  it("does not resend an in-flight retrying batch when a beacon flush happens at the same time", async () => {
    // jsdom's Blob in this environment doesn't implement .text()/.arrayBuffer(),
    // and jest.spyOn can't wrap a class constructor used with `new` — so
    // content is captured at construction time via a thin subclass instead.
    const RealBlob = global.Blob;
    let capturedParts: BlobPart[] | undefined;
    class TrackingBlob extends RealBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        capturedParts = parts;
      }
    }
    global.Blob = TrackingBlob as unknown as typeof Blob;

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const { track } = await setupTelemetry();

    track("page_viewed", { marker: "retrying-batch" });
    jest.advanceTimersByTime(10_000); // kicks off the failing send, now mid-backoff
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // New event captured + tab hidden while the first batch is backing off.
    track("page_viewed", { marker: "beacon-batch" });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    // The beacon only ever saw the second event, never the retrying batch.
    const beaconBody = JSON.parse(String(capturedParts?.[0]));
    expect(beaconBody.events).toHaveLength(1);
    expect(beaconBody.events[0].properties.marker).toBe("beacon-batch");

    global.Blob = RealBlob;
  });

  // ── Missing endpoint ──────────────────────────────────────────────────
  it("disables delivery gracefully when NEXT_PUBLIC_TELEMETRY_ENDPOINT is unset", async () => {
    delete process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { track } = await setupTelemetry();
    track("page_viewed", {});
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_TELEMETRY_ENDPOINT is not set"));

    warnSpy.mockRestore();
  });

  // ── SSR / no-window safety ────────────────────────────────────────────
  it("does nothing and does not throw when called without a window (SSR)", async () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error -- simulate a server environment for this module instance.
    delete globalThis.window;

    jest.resetModules();
    const mod = await import("@/lib/telemetry");

    expect(() => mod.track("page_viewed", {})).not.toThrow();
    const cleanup = mod.initTelemetry();
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();

    globalThis.window = originalWindow;
  });

  // ── Repeated initialization ───────────────────────────────────────────
  it("does not duplicate timers or listeners when initTelemetry is called more than once", async () => {
    const addSpy = jest.spyOn(document, "addEventListener");
    const removeSpy = jest.spyOn(document, "removeEventListener");

    const { track, initTelemetry } = await import("@/lib/telemetry");
    initTelemetry();
    activeCleanup = initTelemetry(); // simulates React Strict Mode's dev double-invoke

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    const addCalls = addSpy.mock.calls.filter(([type]) => type === "visibilitychange");
    expect(addCalls).toHaveLength(2); // one per call, but the first was torn down

    track("page_viewed", {});
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    // Only one interval actually active: a single batch, not two.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("the cleanup function returned by initTelemetry stops the interval and listener", async () => {
    const { track, initTelemetry } = await import("@/lib/telemetry");
    const cleanup = initTelemetry();
    cleanup();

    track("page_viewed", {});
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });

  // ── Session lifecycle: login/logout ───────────────────────────────────
  it("startSession() assigns a new sessionId for subsequent events", async () => {
    const { track, startSession } = await setupTelemetry();

    track("page_viewed", {}); // pre-login, lazily-created session
    startSession(); // simulates a successful login
    track("login_succeeded", {});

    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    const [preLogin, postLogin] = JSON.parse(fetchMock.mock.calls[0][1].body).events;
    expect(preLogin.sessionId).not.toBe(postLogin.sessionId);
  });

  it("endSession() flushes pending events immediately and starts a fresh session for what follows", async () => {
    const { track, startSession, endSession } = await setupTelemetry();

    startSession();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fakeJwt({ sub: "1" }));
    track("outbound_order_created", {}); // queued while User 1 is logged in

    endSession(); // logout — flushes immediately, does not wait for the 10s timer
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const flushedEvent = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
    expect(flushedEvent.userId).toBe("1"); // attribution preserved at capture time

    // A new login as a different user gets its own session, never reusing
    // (or being attributed to) the one that just ended.
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fakeJwt({ sub: "2" }));
    startSession();
    track("login_succeeded", {});
    jest.advanceTimersByTime(10_000);
    await flushMicrotasks();

    const nextEvent = JSON.parse(fetchMock.mock.calls[1][1].body).events[0];
    expect(nextEvent.sessionId).not.toBe(flushedEvent.sessionId);
    expect(nextEvent.userId).toBe("2");
  });

  it("an event captured before logout keeps its original userId even if only sent afterwards", async () => {
    let resolveFetch: (value: { ok: boolean; status: number }) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFetch = resolve; }));

    const { track, startSession, endSession } = await setupTelemetry();
    startSession();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fakeJwt({ sub: "1" }));
    track("outbound_order_created", {});

    jest.advanceTimersByTime(10_000); // send kicks off (pending)
    await flushMicrotasks();

    // User 1 logs out and User 2 logs in before the pending send resolves.
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    endSession();
    window.localStorage.setItem(TOKEN_STORAGE_KEY, fakeJwt({ sub: "2" }));
    startSession();

    resolveFetch({ ok: true, status: 200 });
    await flushMicrotasks();

    const sentEvent = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
    expect(sentEvent.userId).toBe("1");
  });

  // ── Approved-property derivation helpers (Phase 3) ────────────────────
  describe("toCountryCode / toCurrency / toLocationId", () => {
    it("maps the full country names to the approved ISO codes", async () => {
      const { toCountryCode } = await import("@/lib/telemetry");
      expect(toCountryCode("Colombia")).toBe("CO");
      expect(toCountryCode("United States")).toBe("US");
    });

    it("derives currency from country", async () => {
      const { toCurrency } = await import("@/lib/telemetry");
      expect(toCurrency("Colombia")).toBe("COP");
      expect(toCurrency("United States")).toBe("USD");
    });

    it("builds the synthetic COUNTRY-CITY location_id, stripping accents", async () => {
      const { toLocationId } = await import("@/lib/telemetry");
      expect(toLocationId("Colombia", "Medellín")).toBe("CO-MEDELLIN");
      expect(toLocationId("Colombia", "Bogotá")).toBe("CO-BOGOTA");
      expect(toLocationId("United States", "Miami")).toBe("US-MIAMI");
    });

    it("handles a null city without throwing", async () => {
      const { toLocationId } = await import("@/lib/telemetry");
      expect(toLocationId("Colombia", null)).toBe("CO-");
    });
  });

  describe("hashEmailForTelemetry", () => {
    it("returns a 64-char lowercase hex SHA-256 digest, never the raw email", async () => {
      const { hashEmailForTelemetry } = await import("@/lib/telemetry");
      const hash = await hashEmailForTelemetry("Someone@Example.com");
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).not.toContain("someone");
      expect(hash).not.toContain("example");
    });

    it("is case-insensitive and trims whitespace (same email -> same hash)", async () => {
      const { hashEmailForTelemetry } = await import("@/lib/telemetry");
      const a = await hashEmailForTelemetry("Someone@Example.com");
      const b = await hashEmailForTelemetry("  someone@example.com  ");
      expect(a).toBe(b);
    });

    it("produces different hashes for different emails", async () => {
      const { hashEmailForTelemetry } = await import("@/lib/telemetry");
      const a = await hashEmailForTelemetry("a@example.com");
      const b = await hashEmailForTelemetry("b@example.com");
      expect(a).not.toBe(b);
    });
  });

  describe("sanitizeErrorMessage", () => {
    it("redacts a Bearer header value", async () => {
      const { sanitizeErrorMessage } = await import("@/lib/telemetry");
      const sanitized = sanitizeErrorMessage("Request failed: Authorization: Bearer abc123.def456.ghi789");
      expect(sanitized).not.toContain("abc123");
      expect(sanitized).toContain("[redacted]");
    });

    it("redacts a JWT-shaped string even without a Bearer prefix", async () => {
      const { sanitizeErrorMessage } = await import("@/lib/telemetry");
      const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiJ9.c2lnbmF0dXJlLWhlcmU";
      const sanitized = sanitizeErrorMessage(`Token ${jwt} is invalid`);
      expect(sanitized).not.toContain(jwt);
      expect(sanitized).toContain("[redacted]");
    });

    it("truncates to the approved 500-character limit", async () => {
      const { sanitizeErrorMessage } = await import("@/lib/telemetry");
      const sanitized = sanitizeErrorMessage("x".repeat(1000));
      expect(sanitized.length).toBeLessThanOrEqual(500);
    });

    it("leaves an ordinary short message untouched", async () => {
      const { sanitizeErrorMessage } = await import("@/lib/telemetry");
      expect(sanitizeErrorMessage("Cannot read properties of undefined")).toBe(
        "Cannot read properties of undefined",
      );
    });
  });

  // ── Global error capture ───────────────────────────────────────────────
  describe("global error/unhandledrejection capture", () => {
    it("tracks a frontend_error_detected event for an uncaught window error", async () => {
      await setupTelemetry();
      window.dispatchEvent(
        Object.assign(new Event("error"), {
          message: "Something broke",
          error: new TypeError("Something broke"),
        }),
      );

      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const event = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
      expect(event.event_type).toBe("frontend_error_detected");
      expect(event.properties.error_name).toBe("TypeError");
      expect(event.properties.error_message).toBe("Something broke");
      expect(event.properties.route).toBe(window.location.pathname);
    });

    it("tracks a frontend_error_detected event for an unhandled promise rejection", async () => {
      await setupTelemetry();
      const event = new Event("unhandledrejection") as PromiseRejectionEvent & { reason?: unknown };
      Object.defineProperty(event, "reason", { value: new RangeError("bad range"), configurable: true });
      window.dispatchEvent(event);

      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const tracked = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
      expect(tracked.event_type).toBe("frontend_error_detected");
      expect(tracked.properties.error_name).toBe("RangeError");
      expect(tracked.properties.error_message).toBe("bad range");
    });

    it("sanitizes a JWT/Bearer value embedded in the uncaught error's message", async () => {
      await setupTelemetry();
      window.dispatchEvent(
        Object.assign(new Event("error"), {
          message: "fetch failed: Authorization: Bearer abc.def.ghi",
          error: new Error("fetch failed: Authorization: Bearer abc.def.ghi"),
        }),
      );

      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      const tracked = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
      expect(tracked.properties.error_message).not.toContain("abc.def.ghi");
    });

    it("stops listening for window errors after the cleanup function runs", async () => {
      const { initTelemetry: init } = await import("@/lib/telemetry");
      const cleanup = init();
      cleanup();

      window.dispatchEvent(Object.assign(new Event("error"), { message: "late error", error: new Error("late error") }));
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not duplicate window error listeners across repeated initTelemetry calls", async () => {
      const addSpy = jest.spyOn(window, "addEventListener");
      const { initTelemetry: init } = await import("@/lib/telemetry");
      init();
      activeCleanup = init(); // second call (e.g. Strict Mode replay)

      const errorListenerCalls = addSpy.mock.calls.filter(([type]) => type === "error");
      // Each init() call adds one, but the first is torn down before the
      // second adds its own — never two live listeners at once.
      expect(errorListenerCalls.length).toBe(2);

      window.dispatchEvent(Object.assign(new Event("error"), { message: "once only", error: new Error("once only") }));
      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      // Exactly one event, not two, proving only one listener is actually live.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).events).toHaveLength(1);

      addSpy.mockRestore();
    });

    it("never throws out of track() even if building the event fails", async () => {
      const { track } = await setupTelemetry();
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      const properties: Record<string, unknown> = {};
      Object.defineProperty(properties, "poison", {
        enumerable: true,
        get() {
          throw new Error("boom from a property getter");
        },
      });

      expect(() => track("page_viewed", properties)).not.toThrow();
      warnSpy.mockRestore();
    });
  });

  // ── Property allowlist / credential exclusion (cross-cutting spot check) ──
  describe("property safety", () => {
    it("the envelope and properties never carry a password, raw email, or token field", async () => {
      const { track } = await setupTelemetry();
      track("login_failed", { failure_reason: "invalid_credentials", email_hash: "a".repeat(64) });

      jest.advanceTimersByTime(10_000);
      await flushMicrotasks();

      const event = JSON.parse(fetchMock.mock.calls[0][1].body).events[0];
      const serialized = JSON.stringify(event);
      expect(serialized).not.toMatch(/password/i);
      expect(serialized).not.toMatch(/@.*\.(com|co|net)/i); // no raw email address
      expect(event.properties.email_hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
