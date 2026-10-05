"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import CandidateDetails from "@/components/CandidateDetails";
import ErrorState from "@/components/ErrorState";
import BackLink from "@/components/BackLink";
import { candidatePlaceholder } from "@/lib/candidate-placeholder";
import { fetchCandidate, fetchNotes } from "@/lib/api";
import { isRetryableError } from "@/lib/api-error";
import type { Candidate, CandidateNote } from "@/lib/types";

export default function CandidatePage() {
  const { id } = useParams<{ id: string }>();
  const sessionLoading = usePageLoading();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [candidateResult, notesResult] = await Promise.all([
        fetchCandidate(id),
        fetchNotes(id).catch(() => [] as CandidateNote[]),
      ]);
      setCandidate(candidateResult);
      setNotes(notesResult ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading, load]);

  // ── Loading ──────────────────────────────────────────────
  if (sessionLoading || isLoading) {
    return (
      <PageSkeleton loading>
        <CandidateDetails candidate={candidatePlaceholder} />
      </PageSkeleton>
    );
  }

  // ── Rejected ─────────────────────────────────────────────
  if (error || !candidate) {
    return (
      <div className="space-y-4">
        <BackLink href="/hiring">Back to candidates</BackLink>
        <ErrorState
          message={error instanceof Error ? error.message : "We couldn't find this candidate."}
          onRetry={isRetryableError(error) ? load : undefined}
          backHref="/hiring"
          backLabel="Back to candidates"
        />
      </div>
    );
  }

  // ── Fulfilled ────────────────────────────────────────────
  return <CandidateDetails candidate={candidate} notes={notes ?? []} />;
}
