export const TOKEN_STORAGE_KEY = "brasaland_access_token";

/** Minimal, dependency-free decode of a JWT's payload segment (base64url
 * JSON) — no signature verification, this is for reading claims already
 * trusted because the token came from our own `localStorage`, not for
 * authenticating anything. Returns `null` for a missing/malformed token
 * rather than guessing a value. Shared by `lib/telemetry.ts` (for `userId`)
 * and `app/login/page.tsx` (for `role`, used by the `login_succeeded`
 * telemetry event) so the decode logic lives in exactly one place. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface RegistrationPayload {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  address?: string;
}

interface LoginData {
  access_token: string;
  token_type: string;
}

interface ApiEnvelope<T> {
  data: T;
  message: string;
  success: boolean;
}

interface ValidationIssue {
  loc?: Array<string | number>;
  msg?: string;
}

interface ApiErrorPayload {
  detail?: string | ValidationIssue[];
  message?: string;
}

export class AuthRequestError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "AuthRequestError";
    this.fieldErrors = fieldErrors;
  }
}

async function post<T>(
  url: string,
  body: object,
  fallbackField?: string,
): Promise<ApiEnvelope<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthRequestError("Unable to connect to the authentication service.");
  }

  const payload = (await response.json().catch(() => ({}))) as
    | ApiEnvelope<T>
    | ApiErrorPayload;

  if (response.ok) {
    return payload as ApiEnvelope<T>;
  }

  const errorPayload = payload as ApiErrorPayload;
  const fieldErrors: Record<string, string> = {};

  if (Array.isArray(errorPayload.detail)) {
    for (const issue of errorPayload.detail) {
      const field = issue.loc?.at(-1);
      if (typeof field === "string" && issue.msg) {
        fieldErrors[field] = issue.msg.replace(/^Value error,\s*/i, "");
      }
    }
  }

  const message =
    typeof errorPayload.detail === "string"
      ? errorPayload.detail
      : errorPayload.message ?? "The request could not be completed.";

  if (fallbackField && Object.keys(fieldErrors).length === 0) {
    fieldErrors[fallbackField] = message;
  }

  throw new AuthRequestError(message, fieldErrors);
}

export async function registerUser(payload: RegistrationPayload) {
  return post<unknown>("/api/proxy/users", payload, "email");
}

export async function loginUser(email: string, password: string) {
  const response = await post<LoginData>(
    "/api/proxy/auth/login",
    { email, password },
    "password",
  );

  return response.data;
}

export async function requestPasswordReset(email: string) {
  return post<unknown>("/api/proxy/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string) {
  return post<unknown>(
    "/api/proxy/auth/reset-password",
    { token, new_password: newPassword },
    "new_password",
  );
}