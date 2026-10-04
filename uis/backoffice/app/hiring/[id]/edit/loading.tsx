import PageSkeleton from "@/components/PageSkeleton";
import CandidateEdit from "@/components/CandidateEdit";
import { candidatePlaceholder } from "@/lib/candidate-placeholder";

export default function LoadingCandidateEdit() {
  return <PageSkeleton loading><CandidateEdit candidate={candidatePlaceholder} /></PageSkeleton>;
}
