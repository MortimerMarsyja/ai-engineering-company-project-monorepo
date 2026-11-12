// Registration whitelist — types matching the backend schema
// (services/api/app/models/allowed_email.py::AllowedEmailResponse).
// Admin-only: who may self-register a backoffice account via /register.

export interface AllowedEmailEntry {
  id: string;
  email: string;
  added_by: number | null;
  created_at: string;
  /** True when an account with this email already exists. */
  registered: boolean;
}
