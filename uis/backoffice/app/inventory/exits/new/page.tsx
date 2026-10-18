import OutboundOrderForm from "@/components/OutboundOrderForm";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";

export default function NewExitPage() {
  return (
    <div>
      <BackLink href="/inventory">Back to inventory</BackLink>

      <PageHeader
        title="Log consumption / exit"
        description="Record ingredient usage in the kitchen, waste, or a transfer out of a location."
      />

      <OutboundOrderForm />
    </div>
  );
}
