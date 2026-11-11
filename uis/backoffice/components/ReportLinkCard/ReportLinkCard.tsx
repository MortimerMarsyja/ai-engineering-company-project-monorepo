import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

export interface ReportLinkCardProps {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/** A card linking to one infographic report. Pure navigation — no data
 * fetching here, so this hub page never depends on either report's
 * backend being reachable to render itself. */
export default function ReportLinkCard({ href, title, description, icon: Icon }: ReportLinkCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-6 shadow-sm outline-none transition-colors hover:border-brasa-red focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-brasa-red">
        <Icon aria-hidden="true" className="size-5" strokeWidth={2} />
      </span>
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-brasa-red">
        View report
        <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
