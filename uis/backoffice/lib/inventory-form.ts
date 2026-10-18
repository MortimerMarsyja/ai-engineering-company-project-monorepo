/** Shared quantity validation for the inbound/outbound order forms. */
export function validateQuantity(value: string): string | undefined {
  if (!value.trim()) return "Required";
  const num = Number(value);
  if (isNaN(num) || num <= 0) return "Must be a positive number";
  return undefined;
}
