// Incident Manager — types and display helpers matching the backend schema
// (services/api/app/models/schemas.py::IncidentFields and friends).

export type IncidentStatus = "open" | "in_progress" | "resolved" | "discarded";

export type IncidentOrigin = "customer" | "branch" | "headquarters";

export type IncidentCategory =
  | "CUSTOMER_COMPLAINT"
  | "EQUIPMENT"
  | "SUPPLY"
  | "FOOD_QUALITY"
  | "STAFF";

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  status: IncidentStatus;
  origin: IncidentOrigin;
  branch: string;
  customer_id: string | null;
  satisfaction_score: number | null;
  reporter_id: string | null;
  incident_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentCreateInput {
  title: string;
  description: string;
  category: IncidentCategory;
  origin: IncidentOrigin;
  branch: string;
  customer_id?: string;
  reporter_id?: string;
}

export interface IncidentUpdateInput {
  title?: string;
  description?: string;
  category?: IncidentCategory;
  branch?: string;
}

export interface IncidentStatusUpdateInput {
  status: IncidentStatus;
  satisfaction_score?: number;
}

export interface IncidentsListResponse {
  data: Incident[];
  total: number;
  page: number;
  limit: number;
}

export interface IncidentMetrics {
  total: number;
  status_counts: Partial<Record<IncidentStatus, number>>;
  category_counts: Partial<Record<IncidentCategory, number>>;
  branch_counts: Record<string, number>;
  origin_counts: Partial<Record<IncidentOrigin, number>>;
  avg_satisfaction_score: number | null;
  avg_resolution_seconds: number | null;
}

// ── CSV import summary (POST /incidents/analyze response) ───────

export interface InvalidBreakdownEntry {
  rule: string;
  label: string;
  count: number;
}

export interface CategoryBreakdownEntry {
  category: string;
  count: number;
  percentage: number;
}

export interface StatusBreakdownEntry {
  status: string;
  count: number;
  percentage: number;
}

export interface SatisfactionIndex {
  total_closed: number;
  scored_cases: number;
  average_score: number;
  score_distribution: { score: number; label: string; count: number }[];
}

export interface AnalyzeSummary {
  total_records: number;
  valid_records: number;
  invalid_records: number;
  persisted_records: number;
  invalid_breakdown: InvalidBreakdownEntry[];
  category_breakdown: CategoryBreakdownEntry[];
  status_breakdown: StatusBreakdownEntry[];
  satisfaction_index: SatisfactionIndex;
  note?: string;
}

// ── Display helpers ──────────────────────────────────────────

export const STATUS_OPTIONS: { value: IncidentStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "discarded", label: "Discarded" },
];

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  discarded: "Discarded",
};

export const STATUS_COLORS: Record<IncidentStatus, string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  discarded: "bg-gray-50 text-gray-500 border-gray-200",
};

export const STATUS_ICONS: Record<IncidentStatus, string> = {
  open: "🟡",
  in_progress: "🔵",
  resolved: "✅",
  discarded: "⚪",
};

// Legal next statuses for the lifecycle open -> in_progress -> resolved,
// with discarded reachable from either open or in_progress.
export const STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["in_progress", "discarded"],
  in_progress: ["resolved", "discarded"],
  resolved: [],
  discarded: [],
};

export const ORIGIN_OPTIONS: { value: IncidentOrigin; label: string }[] = [
  { value: "branch", label: "Branch" },
  { value: "headquarters", label: "Headquarters" },
  { value: "customer", label: "Customer" },
];

export const ORIGIN_LABELS: Record<IncidentOrigin, string> = {
  customer: "Customer",
  branch: "Branch",
  headquarters: "Headquarters",
};

export const CATEGORY_OPTIONS: { value: IncidentCategory; label: string }[] = [
  { value: "CUSTOMER_COMPLAINT", label: "Customer Complaint" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "SUPPLY", label: "Supply" },
  { value: "FOOD_QUALITY", label: "Food Quality" },
  { value: "STAFF", label: "Staff" },
];

export const CATEGORY_LABELS: Record<string, string> = {
  CUSTOMER_COMPLAINT: "Customer Complaint",
  EQUIPMENT: "Equipment",
  SUPPLY: "Supply",
  FOOD_QUALITY: "Food Quality",
  STAFF: "Staff",
};

export const CATEGORY_ICONS: Record<string, string> = {
  CUSTOMER_COMPLAINT: "💬",
  EQUIPMENT: "🔧",
  SUPPLY: "📦",
  FOOD_QUALITY: "🍽️",
  STAFF: "👥",
};

export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const hours = seconds / 3600;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
