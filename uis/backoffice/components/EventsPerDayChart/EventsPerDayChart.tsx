import type { EventsPerDayEntry } from "@/lib/telemetry-report";

export interface EventsPerDayChartProps {
  days: EventsPerDayEntry[];
}

/** Daily captured-event volume — every calendar day in the selected
 * period, zero-filled by the backend (a day with no events is a genuine
 * 0, not missing data). Read straight from the API; no recomputation. */
export default function EventsPerDayChart({ days }: EventsPerDayChartProps) {
  const maxCount = Math.max(1, ...days.map((d) => d.event_count));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Events per day</h3>
        <p className="text-sm text-gray-500">All captured telemetry events, by UTC calendar day</p>
      </div>

      <div data-skeleton-visual className="flex h-40 items-end gap-1.5 overflow-x-auto">
        {days.map((day) => {
          const height = (day.event_count / maxCount) * 100;
          const dayLabel = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          });
          return (
            <div key={day.date} className="group relative flex min-w-[28px] flex-1 flex-col items-center">
              <div className="mb-2 hidden rounded bg-gray-800 px-2 py-1 text-xs text-white group-hover:block">
                {day.event_count.toLocaleString()}
              </div>
              <div
                className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
                style={{ height: `${height}%`, minHeight: day.event_count > 0 ? "2px" : "0" }}
              />
              <span className="mt-2 whitespace-nowrap text-[10px] text-gray-400">{dayLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
