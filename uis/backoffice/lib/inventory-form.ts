/** Shared quantity validation for the inbound/outbound order forms. */
export function validateQuantity(value: string): string | undefined {
  if (!value.trim()) return "Required";
  const num = Number(value);
  if (isNaN(num) || num <= 0) return "Must be a positive number";
  return undefined;
}

/** Same shape as validateQuantity — unit_cost must also be a positive number. */
export function validateUnitCost(value: string): string | undefined {
  if (!value.trim()) return "Required";
  const num = Number(value);
  if (isNaN(num) || num <= 0) return "Must be a positive number";
  return undefined;
}

/** Mirrors services/api/app/routers/inventory.py::PRICE_VARIANCE_THRESHOLD_PCT
 * — the approved ingredient_price_variance_detected variance_threshold_pct
 * (docs/event-schemas.json), echoed back in the telemetry properties, not
 * re-derived independently on the frontend. */
export const PRICE_VARIANCE_THRESHOLD_PCT = 10;
