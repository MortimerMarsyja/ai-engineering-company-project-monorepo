import { notFound } from "next/navigation";
import { fetchCandidate } from "@/lib/api";
import CandidateEdit from "@/components/CandidateEdit";

export default async function EditCandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let candidate;

  try {
    candidate = await fetchCandidate(id);
  } catch {
    notFound();
  }

  return <CandidateEdit candidate={candidate} />;
}
