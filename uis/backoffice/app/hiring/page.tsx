"use client";

import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchCandidates } from "@/lib/api";
import CandidateFilters from "@/components/CandidateFilters";
import CandidatesTable from "@/components/CandidatesTable";
import PageHeader from "@/components/PageHeader";
import {
  isCandidateStatus,
  isCandidateStage,
} from "@/lib/candidate-meta";
import type {
  CandidateStage,
  CandidateStatus,
  Candidate,
} from "@/lib/types";

const emptySearchParams = new URLSearchParams();

export default function HiringPage() {
  return (
    <Suspense fallback={<PageSkeleton loading><HiringContent searchParams={emptySearchParams} /></PageSkeleton>}>
      <HiringWithSearchParams />
    </Suspense>
  );
}

function HiringWithSearchParams() {
  const searchParams = useSearchParams();
  return <HiringContent searchParams={searchParams} />;
}

function HiringContent({ searchParams }: { searchParams: Pick<URLSearchParams, "get" | "getAll" | "toString"> }) {
  const sessionLoading = usePageLoading();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    const loadCandidates = async () => {
      setIsLoading(true);
      setError("");

      const search = searchParams.get("search") ?? "";
      const statusesRaw = searchParams.getAll("status");
      const stagesRaw = searchParams.getAll("stage");

      const statuses: CandidateStatus[] | undefined = statusesRaw.length
        ? statusesRaw.filter(isCandidateStatus)
        : undefined;

      const stages: CandidateStage[] | undefined = stagesRaw.length
        ? stagesRaw.filter(isCandidateStage)
        : undefined;

      try {
        const res = await fetchCandidates({
          page: 1,
          limit: 100,
          search: search || undefined,
          statuses: statuses?.length ? statuses : undefined,
          stages: stages?.length ? stages : undefined,
        });

        setCandidates(res.data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load candidates.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadCandidates();
  }, [searchParams, sessionLoading]);

  return (
    <PageSkeleton loading={isLoading && !error}>
      <div>
        <PageHeader
          title="Hiring Pipeline"
          description="Track candidates through the recruitment process"
          actions={
            <Link
              href="/hiring/new"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              New candidate
            </Link>
          }
        />

        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <CandidateFilters searchParams={searchParams} />
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : candidates.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
            No candidates yet.
          </div>
        ) : (
          <CandidatesTable candidates={candidates} isLoading={isLoading} />
        )}
      </div>
    </PageSkeleton>
  );
}
