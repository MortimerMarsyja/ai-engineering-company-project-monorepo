import PageHeader from "@/components/PageHeader";
import IncidentForm from "@/components/IncidentForm";

export default function NewIncidentPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Log Incident"
        description="Anyone — a branch, HQ, or a customer-reported issue — can log it here."
      />
      <IncidentForm />
    </div>
  );
}
