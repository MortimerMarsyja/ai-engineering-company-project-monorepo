import { notFound } from "next/navigation";
import { fetchCandidate, fetchNotes } from "@/lib/api";
import CandidateDetails from "@/components/CandidateDetails";
import type { CandidateNote } from "@/lib/types";

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let candidate;
  let notes: CandidateNote[] = [];

  try {
    candidate = await fetchCandidate(id);
  } catch {
    notFound();
  }

  try {
    notes = await fetchNotes(id);
  } catch {
    notes = [];
  }

  return <CandidateDetails candidate={candidate} notes={notes} />;
}
