import type { Candidate } from "./types";

// Shape-only record for shared detail/form components before a response arrives.
export const candidatePlaceholder: Candidate = {
  id: "loading", full_name: "\u00a0", email: "\u00a0", phone: "\u00a0",
  position: "\u00a0", linkedin_url: null, cv_url: null,
  status: "received", stage: "pending", experience_years: 0,
  notes_count: 0, applied_at: "2000-01-01", updated_at: "2000-01-01",
};
