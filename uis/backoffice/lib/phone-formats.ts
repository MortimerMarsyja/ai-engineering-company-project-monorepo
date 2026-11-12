// Phone-format guidance for the staff account registration form
// (app/register/page.tsx). Purely a frontend convenience — the backend
// (services/api/app/models/user.py) stores `phone` as free-text
// (max_length=30 only, no format constraint), so this never blocks
// submission; it only tells the admin what's expected for the selected
// country, the same way other fields already show a placeholder.

export type RegistrationCountry = "CO" | "US" | "ES";

export interface PhoneFormat {
  label: string;
  dialCode: string;
  /** Digits expected after the dial code (ignoring spaces/dashes). */
  digits: number;
  example: string;
}

export const PHONE_FORMATS: Record<RegistrationCountry, PhoneFormat> = {
  CO: { label: "Colombia", dialCode: "+57", digits: 10, example: "+57 300 123 4567" },
  US: { label: "United States", dialCode: "+1", digits: 10, example: "+1 555 123 4567" },
  ES: { label: "Spain", dialCode: "+34", digits: 9, example: "+34 612 345 678" },
};

/** Non-blocking check: does `value` look like the expected dial code +
 * digit count for `country`? Whitespace/dashes between digits are
 * ignored. Returns `null` for an empty value (nothing to judge yet). */
export function looksLikeValidPhone(country: RegistrationCountry, value: string): boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const format = PHONE_FORMATS[country];
  if (!trimmed.startsWith(format.dialCode)) return false;

  const digitsOnly = trimmed.slice(format.dialCode.length).replace(/[\s-]/g, "");
  return /^\d+$/.test(digitsOnly) && digitsOnly.length === format.digits;
}
