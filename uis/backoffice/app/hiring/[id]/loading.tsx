import PageSkeleton from "@/components/PageSkeleton";
import CandidateDetails from "@/components/CandidateDetails";
import { candidatePlaceholder } from "@/lib/candidate-placeholder";

export default function LoadingCandidate() {
  return <PageSkeleton loading><CandidateDetails candidate={candidatePlaceholder} /></PageSkeleton>;
}
