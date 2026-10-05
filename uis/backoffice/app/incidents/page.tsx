"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import KPICard from "@/components/KPICard";
import IncidentsTable from "@/components/IncidentsTable";
import FileDropzone from "@/components/FileDropzone";
import ErrorState from "@/components/ErrorState";
import { isPermissionError, isRetryableError } from "@/lib/api-error";
import { fetchIncidentMetrics, fetchIncidents, analyzeIncidentsCsv } from "@/lib/incidents-api";
import {
  CATEGORY_OPTIONS,
  ORIGIN_OPTIONS,
  STATUS_OPTIONS,
  formatSeconds,
  type AnalyzeSummary,
  type Incident,
  type IncidentMetrics,
} from "@/lib/incidents";

const emptySearchParams = new URLSearchParams();

export default function IncidentsPage() {
  return (
    <Suspense fallback={<PageSkeleton loading><IncidentsContent searchParams={emptySearchParams} /></PageSkeleton>}>
      <IncidentsWithSearchParams />
    </Suspense>
  );
}

function IncidentsWithSearchParams() {
  const searchParams = useSearchParams();
  return <IncidentsContent searchParams={searchParams} />;
}

function IncidentsContent({
  searchParams,
}: {
  searchParams: Pick<URLSearchParams, "get" | "toString">;
}) {
  const sessionLoading = usePageLoading();
  const router = useRouter();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [total, setTotal] = useState(0);
  const [metrics, setMetrics] = useState<IncidentMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [metricsError, setMetricsError] = useState<unknown>(null);

  const [showImport, setShowImport] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<unknown>(null);

  const status = searchParams.get("status") ?? "";
  const category = searchParams.get("category") ?? "";
  const origin = searchParams.get("origin") ?? "";
  const search = searchParams.get("search") ?? "";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/incidents?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listResult = await fetchIncidents({ status, category, origin, search, limit: 50 });
      setIncidents(listResult?.data ?? []);
      setTotal(listResult?.total ?? 0);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }

    // Metrics are a staff-only section (leadership dashboard) — a non-staff
    // role failing to load *this* must not take down the incident list
    // above, which that same role is otherwise fully allowed to see.
    try {
      const metricsResult = await fetchIncidentMetrics();
      setMetrics(metricsResult ?? null);
      setMetricsError(null);
    } catch (err) {
      setMetrics(null);
      setMetricsError(err);
    }
  }, [status, category, origin, search]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading, load]);

  const handleFileLoaded = async (content: string, name: string) => {
    const file = new File([content], name, { type: "text/csv" });
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const summary = await analyzeIncidentsCsv(file);
      setAnalysis(summary ?? null);
      // Refresh the list/metrics since valid rows were persisted.
      await load();
    } catch (err) {
      setAnalyzeError(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  function messageOf(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Incident Manager"
        description="Log, track, and resolve operational incidents across every branch, HQ, and customer report."
        actions={
          <Link
            href="/incidents/new"
            className="rounded-lg bg-brasa-red px-4 py-2 text-sm font-semibold text-white hover:bg-brasa-red/90"
          >
            Log Incident
          </Link>
        }
      />

      {error ? (
        <ErrorState
          message={messageOf(error, "We couldn't load incidents right now. Please try again.")}
          onRetry={isRetryableError(error) ? load : undefined}
        />
      ) : null}

      {/* KPI row — staff-only; a non-staff role simply doesn't see it rather
          than the whole page failing to load over a section it can't use. */}
      {metricsError ? (
        isPermissionError(metricsError) ? null : (
          <ErrorState message={messageOf(metricsError, "We couldn't load incident metrics right now.")} />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Total Incidents" value={metrics?.total ?? "—"} subtitle="all time" icon="📊" />
          <KPICard
            title="Open"
            value={metrics?.status_counts?.open ?? 0}
            subtitle="awaiting action"
            icon="🟡"
          />
          <KPICard
            title="In Progress"
            value={metrics?.status_counts?.in_progress ?? 0}
            subtitle="being worked"
            icon="🔵"
          />
          <KPICard
            title="Avg. Satisfaction"
            value={metrics?.avg_satisfaction_score != null ? metrics.avg_satisfaction_score.toFixed(2) : "—"}
            subtitle={`avg. resolution ${formatSeconds(metrics?.avg_resolution_seconds ?? null)}`}
            icon="⭐"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Search</span>
          <input
            type="text"
            defaultValue={search}
            placeholder="Title or description…"
            onChange={(e) => setParam("search", e.target.value)}
            className="w-56 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Status</span>
          <select
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Category</span>
          <select
            value={category}
            onChange={(e) => setParam("category", e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All</option>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">Origin</span>
          <select
            value={origin}
            onChange={(e) => setParam("origin", e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All</option>
            {ORIGIN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
        >
          {showImport ? "Hide CSV import" : "Import from CSV"}
        </button>
      </div>

      {/* CSV import */}
      {showImport ? (
        <div className="space-y-4">
          <FileDropzone onFileLoaded={handleFileLoaded} loading={isAnalyzing} />

          {analyzeError ? (
            <ErrorState
              message={messageOf(analyzeError, "We couldn't analyze that CSV. Please check the file and try again.")}
            />
          ) : null}

          {analysis ? <AnalysisSummaryView analysis={analysis} /> : null}
        </div>
      ) : null}

      {/* List — loading / fulfilled; the error state is shown above with a retry action */}
      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Loading incidents…
        </div>
      ) : !error ? (
        <>
          <p className="text-sm text-gray-500">{total ?? 0} incident{total === 1 ? "" : "s"}</p>
          <IncidentsTable incidents={incidents ?? []} />
        </>
      ) : null}
    </div>
  );
}

function AnalysisSummaryView({ analysis }: { analysis: AnalyzeSummary }) {
  const invalidBreakdown = analysis?.invalid_breakdown ?? [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Import Results</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total rows" value={analysis?.total_records ?? 0} />
        <Stat label="Valid" value={analysis?.valid_records ?? 0} tone="text-emerald-600" />
        <Stat label="Invalid" value={analysis?.invalid_records ?? 0} tone="text-red-500" />
        <Stat label="Persisted" value={analysis?.persisted_records ?? 0} tone="text-brasa-brown" />
      </div>
      {analysis?.note ? (
        <p className="mt-4 text-sm font-medium text-amber-700">{analysis.note}</p>
      ) : null}
      {invalidBreakdown.length > 0 ? (
        <div className="mt-4 space-y-1">
          {invalidBreakdown.map((r) => (
            <div key={r?.rule ?? r?.label} className="flex justify-between text-sm text-gray-600">
              <span>{r?.label ?? "Unknown rule"}</span>
              <span className="font-semibold text-red-500">{r?.count ?? 0}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone = "text-gray-900" }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
