import {
  formatMonthLabel,
  formatUSD,
  MODEL_COLORS,
  MODEL_LABELS,
  type ModelKey,
  type SalesForecastByModel,
  type SalesForecastMonth,
} from "@/lib/sales-forecast";

export interface RevenueForecastChartProps {
  historical: SalesForecastMonth[];
  forecastByModel: SalesForecastByModel;
  winner: ModelKey;
}

const MODEL_KEYS: ModelKey[] = ["random_forest_revenue", "random_forest_growth", "seasonal_naive"];

const WIDTH = 760;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

/** Historical monthly revenue (solid line) plus each model's own 12-month
 * forward forecast (dashed lines, one per candidate) — "prediction by
 * model" rather than only the winning model's number. Line style
 * (solid/dashed) and the legend's text labels carry model identity, never
 * color alone; the winner is also named in the legend and in the caption,
 * not only shown with a different hue. */
export default function RevenueForecastChart({
  historical,
  forecastByModel,
  winner,
}: RevenueForecastChartProps) {
  const allValues = [
    ...historical.map((p) => p.revenue_usd),
    ...MODEL_KEYS.flatMap((key) => forecastByModel[key].map((p) => p.revenue_usd)),
  ];
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const yMin = minValue * 0.95;
  const yMax = maxValue * 1.05;

  const totalMonths = historical.length + forecastByModel[winner].length;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const xAt = (index: number) => PAD.left + (index / (totalMonths - 1)) * innerW;
  const yAt = (value: number) => PAD.top + innerH - ((value - yMin) / (yMax - yMin)) * innerH;

  const historicalPath = historical
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p.revenue_usd).toFixed(1)}`)
    .join(" ");

  const lastHistoricalIndex = historical.length - 1;
  const lastHistoricalPoint = historical[lastHistoricalIndex];

  function forecastPath(key: ModelKey): string {
    const points = [{ ...lastHistoricalPoint }, ...forecastByModel[key]];
    return points
      .map((p, i) => {
        const index = lastHistoricalIndex + i;
        return `${i === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(p.revenue_usd).toFixed(1)}`;
      })
      .join(" ");
  }

  // Yearly tick marks (January of each year present), kept sparse so
  // labels never collide at this width.
  const allMonths = [...historical, ...forecastByModel[winner]];
  const yearTicks = allMonths
    .map((p, i) => ({ index: i, month: p.month }))
    .filter((p) => p.month.endsWith("-01-01"));

  const gridValues = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="rounded-xl border border-admin-border bg-white p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-[#221810]">Revenue: historical + 12-month forecast</h3>
        <p className="mt-1 text-sm text-[#221810]/55">
          Solid line: actual monthly revenue. Dashed lines: each model&apos;s own forward forecast —{" "}
          <span className="font-semibold" style={{ color: MODEL_COLORS[winner] }}>
            {MODEL_LABELS[winner]}
          </span>{" "}
          is the selected best model.
        </p>
      </div>

      <div data-skeleton-visual>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="revenue-forecast-title revenue-forecast-desc"
          className="h-auto w-full"
        >
          <title id="revenue-forecast-title">Historical revenue and 12-month forecast by model</title>
          <desc id="revenue-forecast-desc">
            Line chart of Brasaland&apos;s historical monthly revenue from {historical[0]?.month} to{" "}
            {lastHistoricalPoint?.month}, followed by a 12-month forecast from each of three models: Random Forest
            on revenue, Random Forest on year-over-year growth, and a seasonal-naive baseline. The full numeric
            data is available in the table below the chart.
          </desc>

          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yAt(value)}
                y2={yAt(value)}
                stroke="#e4e4e7"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={yAt(value)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#6b7280">
                {formatUSD(value)}
              </text>
            </g>
          ))}

          {yearTicks.map((tick) => (
            <text
              key={tick.index}
              x={xAt(tick.index)}
              y={HEIGHT - 8}
              textAnchor="middle"
              fontSize={11}
              fill="#6b7280"
            >
              {formatMonthLabel(tick.month)}
            </text>
          ))}

          <line
            x1={xAt(lastHistoricalIndex)}
            x2={xAt(lastHistoricalIndex)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="#9ca3af"
            strokeWidth={1}
            strokeDasharray="2 3"
          />

          <path d={historicalPath} fill="none" stroke="#221810" strokeWidth={2} />

          {MODEL_KEYS.map((key) => (
            <path
              key={key}
              d={forecastPath(key)}
              fill="none"
              stroke={MODEL_COLORS[key]}
              strokeWidth={key === winner ? 2.5 : 2}
              strokeDasharray="6 4"
            />
          ))}
        </svg>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-4 bg-[#221810]" />
          Actual (historical)
        </li>
        {MODEL_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 border-t-2 border-dashed"
              style={{ borderColor: MODEL_COLORS[key] }}
            />
            {MODEL_LABELS[key]}
            {key === winner ? " (best model)" : ""}
          </li>
        ))}
      </ul>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[#221810]/60">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[#221810]/55">
                <th scope="col" className="py-1 pr-3">Month</th>
                {MODEL_KEYS.map((key) => (
                  <th scope="col" key={key} className="py-1 pr-3">
                    {MODEL_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecastByModel[winner].map((_, i) => (
                <tr key={i} className="border-t border-admin-border">
                  <td className="py-1 pr-3">{formatMonthLabel(forecastByModel[winner][i].month)}</td>
                  {MODEL_KEYS.map((key) => (
                    <td key={key} className="py-1 pr-3">
                      {formatUSD(forecastByModel[key][i].revenue_usd)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
