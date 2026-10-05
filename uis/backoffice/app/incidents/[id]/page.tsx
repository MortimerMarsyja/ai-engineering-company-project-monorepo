"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import InfoRow from "@/components/InfoRow";
import Badge from "@/components/Badge";
import Toast from "@/components/Toast";
import ErrorState from "@/components/ErrorState";
import { isRetryableError } from "@/lib/api-error";
import { fetchIncident, updateIncidentStatus } from "@/lib/incidents-api";
import {
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  type Incident,
  type IncidentStatus,
} from "@/lib/incidents";

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [scoreInput, setScoreInput] = useState("");
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchIncident(id);
      setIncident(data);
      if (data?.satisfaction_score != null) setScoreInput(String(data.satisfaction_score));
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const transitionTo = async (status: IncidentStatus) => {
    if (!incident) return;

    if (status === "resolved" && incident.satisfaction_score == null && !scoreInput) {
      setToast({ kind: "error", message: "Please enter a satisfaction score (1-5) before resolving this incident." });
      return;
    }

    setIsTransitioning(true);
    try {
      const updated = await updateIncidentStatus(incident.id, {
        status,
        satisfaction_score: scoreInput ? Number(scoreInput) : undefined,
      });
      setIncident(updated);
      setToast({ kind: "success", message: `Incident marked as ${STATUS_LABELS[status] ?? status}.` });
    } catch (err) {
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "We couldn't update this incident's status. Please try again.",
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageSkeleton loading>
        <div className="space-y-6">
          <BackLink href="/incidents">Back to Incident Manager</BackLink>
          <PageHeader title="Loading incident…" />
          <div className="h-48 rounded-xl border border-gray-200 bg-white shadow-sm" />
        </div>
      </PageSkeleton>
    );
  }

  // ── Rejected ─────────────────────────────────────────────
  if (error || !incident) {
    return (
      <div className="space-y-4">
        <BackLink href="/incidents">Back to Incident Manager</BackLink>
        <ErrorState
          message={error instanceof Error ? error.message : "We couldn't find this incident."}
          onRetry={isRetryableError(error) ? load : undefined}
          backHref="/incidents"
          backLabel="Back to Incident Manager"
        />
      </div>
    );
  }

  // ── Fulfilled ────────────────────────────────────────────
  const status = incident.status ?? "open";
  const nextStatuses = STATUS_TRANSITIONS[status] ?? [];

  return (
    <div className="space-y-6">
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
      <BackLink href="/incidents">Back to Incident Manager</BackLink>

      <PageHeader
        title={incident.title ?? "Untitled incident"}
        actions={
          <Badge label={STATUS_LABELS[status] ?? status} className={`border ${STATUS_COLORS[status] ?? ""}`}>
            {STATUS_ICONS[status] ?? ""} {STATUS_LABELS[status] ?? status}
          </Badge>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          <InfoRow label="Description">{incident.description || "—"}</InfoRow>
          <InfoRow label="Category">{CATEGORY_LABELS[incident.category] ?? incident.category ?? "—"}</InfoRow>
          <InfoRow label="Origin">{ORIGIN_LABELS[incident.origin] ?? incident.origin ?? "—"}</InfoRow>
          <InfoRow label="Branch">{incident.branch || "—"}</InfoRow>
          {incident.customer_id ? <InfoRow label="Customer ID">{incident.customer_id}</InfoRow> : null}
          {incident.reporter_id ? <InfoRow label="Reporter ID">{incident.reporter_id}</InfoRow> : null}
          <InfoRow label="Satisfaction score">
            {incident.satisfaction_score != null ? `${incident.satisfaction_score} / 5` : "—"}
          </InfoRow>
          <InfoRow label="Logged">{formatDateSafe(incident.created_at)}</InfoRow>
          <InfoRow label="Last updated">{formatDateSafe(incident.updated_at)}</InfoRow>
        </dl>
      </div>

      {nextStatuses.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Update status</h3>

          {nextStatuses.includes("resolved") ? (
            <div className="mb-4 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700">Satisfaction score (required to resolve)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          ) : null}

          <div className="flex gap-3">
            {nextStatuses.map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                disabled={isTransitioning}
                onClick={() => transitionTo(nextStatus)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {STATUS_ICONS[nextStatus] ?? ""} Mark as {STATUS_LABELS[nextStatus] ?? nextStatus}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">This incident is in a terminal state.</p>
      )}
    </div>
  );
}
