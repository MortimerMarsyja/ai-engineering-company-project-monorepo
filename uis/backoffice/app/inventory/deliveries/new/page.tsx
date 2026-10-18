import InboundOrderForm from "@/components/InboundOrderForm";
import BackLink from "@/components/BackLink";
import PageHeader from "@/components/PageHeader";

export default function NewDeliveryPage() {
  return (
    <div>
      <BackLink href="/inventory">Back to inventory</BackLink>

      <PageHeader
        title="Register delivery"
        description="Log an ingredient delivery received at a restaurant location."
      />

      <InboundOrderForm />
    </div>
  );
}
