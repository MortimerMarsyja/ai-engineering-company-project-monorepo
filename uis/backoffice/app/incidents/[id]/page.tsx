"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";
import InfoRow from "@/components/InfoRow";
import Badge from "@/components/Badge";
import Toast from "@/components/Toast";
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

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [scoreInput, setScoreInput] = useState("");
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const data = await fetchIncident(id);
        setIncident(data);
        if (data.satisfaction_score != null) setScoreInput(String(data.satisfaction_score));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load incident.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const transitionTo = async (status: IncidentStatus) => {
    if (!incident) return;

    if (status === "resolved" && incident.satisfaction_score == null && !scoreInput) {
      setToast({ kind: "error", message: "Enter a satisfaction score (1-5) before resolving." });
      return;
    }

    setIsTransitioning(true);
    try {
      const updated = await updateIncidentStatus(incident.id, {
        status,
        satisfaction_score: scoreInput ? Number(scoreInput) : undefined,
      });
      setIncident(updated);
      setToast({ kind: "success", message: `Incident marked as ${STATUS_LABELS[status]}.` });
    } catch (err) {
      setToast({ kind: "error", message: err instanceof Error ? err.message : "Failed to update status." });
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading incident…</p>;
  }

  if (error || !incident) {
    return (
      <div className="space-y-4">
        <BackLink href="/incidents">Back to Incident Manager</BackLink>
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Incident not found."}
        </div>
      </div>
    );
  }

  const nextStatuses = STATUS_TRANSITIONS[incident.status];

  return (
    <div className="space-y-6">
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
      <BackLink href="/incidents">Back to Incident Manager</BackLink>

      <PageHeader
        title={incident.title}
        actions={
          <Badge label={STATUS_LABELS[incident.status]} className={`border ${STATUS_COLORS[incident.status]}`}>
            {STATUS_ICONS[incident.status]} {STATUS_LABELS[incident.status]}
          </Badge>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          <InfoRow label="Description">{incident.description}</InfoRow>
          <InfoRow label="Category">{CATEGORY_LABELS[incident.category] ?? incident.category}</InfoRow>
          <InfoRow label="Origin">{ORIGIN_LABELS[incident.origin]}</InfoRow>
          <InfoRow label="Branch">{incident.branch}</InfoRow>
          {incident.customer_id ? <InfoRow label="Customer ID">{incident.customer_id}</InfoRow> : null}
          {incident.reporter_id ? <InfoRow label="Reporter ID">{incident.reporter_id}</InfoRow> : null}
          <InfoRow label="Satisfaction score">
            {incident.satisfaction_score != null ? `${incident.satisfaction_score} / 5` : "—"}
          </InfoRow>
          <InfoRow label="Logged">{new Date(incident.created_at).toLocaleString()}</InfoRow>
          <InfoRow label="Last updated">{new Date(incident.updated_at).toLocaleString()}</InfoRow>
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
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                disabled={isTransitioning}
                onClick={() => transitionTo(status)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {STATUS_ICONS[status]} Mark as {STATUS_LABELS[status]}
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
