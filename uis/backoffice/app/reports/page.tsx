import { BarChart3, Gauge } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ReportLinkCard from "@/components/ReportLinkCard";

export const metadata = {
  title: "Reports — Brasaland Backoffice",
  description: "Infographic reports built from the weekly business pipeline and operational telemetry.",
};

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Infographic reports built from the data the pipelines and telemetry collect."
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ReportLinkCard
          href="/reporting"
          icon={Gauge}
          title="Weekly Cost & Waste Report"
          description="Purchase cost, waste cost, waste ratio, stockouts, and price alerts by location — from the weekly-location-performance pipeline."
        />
        <ReportLinkCard
          href="/telemetry-report"
          icon={BarChart3}
          title="Telemetry Operations Report"
          description="Event volume, API latency, and error rates captured across the backoffice and website."
        />
      </div>
    </div>
  );
}
