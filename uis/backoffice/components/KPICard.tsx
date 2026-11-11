import type { ReactNode } from "react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  trend?: number;
  /** A lucide-react icon element, e.g. `<DollarSign className="size-5" />` —
   * replaces the previous emoji prop for visual consistency with the rest
   * of the app (lucide is already the icon set used everywhere else). */
  icon: ReactNode;
}

export default function KPICard({ title, value, subtitle, trend, icon }: KPICardProps) {
  return (
    <div className="rounded-xl border border-admin-border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#221810]/60">{title}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#221810]">{value}</p>
          <p className="mt-1 text-xs text-[#221810]/45">{subtitle}</p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brasa-red/10 text-brasa-red"
        >
          {icon}
        </span>
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-sm font-semibold ${trend >= 0 ? "text-success" : "text-brasa-error"}`}>
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </span>
          <span className="text-xs text-[#221810]/40">vs last 7 days</span>
        </div>
      )}
    </div>
  );
}
