import CandidateForm from "@/components/CandidateForm";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";

import type { Candidate } from "@/lib/types";

export default function CandidateEdit({ candidate }: { candidate: Candidate }) {
  const id = candidate.id;
  return (
    <div>
      <BackLink href={`/hiring/${id}`}>Back to candidate</BackLink>

      <PageHeader
        title="Edit candidate"
        description={`Update ${candidate.full_name}'s details.`}
      />

      <CandidateForm mode="edit" candidate={candidate} />
    </div>
  );
}
