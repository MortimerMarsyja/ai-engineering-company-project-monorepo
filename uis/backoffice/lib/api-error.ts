/** An API call failed with a known HTTP status — carries the status so
 * callers can tell "this will never succeed by retrying" (403/404) apart
 * from "this might work if you try again" (network blip, 500, 503). */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** A permission problem (wrong role) is never fixed by retrying the same
 * request — only by someone granting the account more access. Works with
 * ApiError and any other error class that carries a numeric `status`
 * (e.g. ProfileRequestError), not just ApiError instances. */
export function isPermissionError(err: unknown): boolean {
  return statusOf(err) === 403;
}

/** True when retrying the exact same request could plausibly succeed —
 * i.e. not a permissions, not-found, or client/routing bug. 405 ("Method
 * Not Allowed") means the frontend called an endpoint/method combination
 * that was never wired up — identical to a 403 in that no amount of
 * retrying fixes it, only a code change does. */
export function isRetryableError(err: unknown): boolean {
  const status = statusOf(err);
  if (status === undefined) return true;
  return status !== 403 && status !== 404 && status !== 405;
}

export const ACCESS_DENIED_MESSAGE =
  "You do not have access rights to load this resource with your current role.";

export const ACCESS_DENIED_ACTION_MESSAGE =
  "You do not have access rights to perform this action with your current role.";

/** 405 Method Not Allowed is always a routing/configuration bug, never a
 * permissions or transient problem — never show the raw "Method Not
 * Allowed" text, and never suggest retrying will help. */
export const ACTION_UNAVAILABLE_MESSAGE =
  "This action isn't available right now. Please contact support if this keeps happening.";
