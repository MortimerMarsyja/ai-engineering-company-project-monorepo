import { formatDate, formatDateTime, formatYears, formatYearsLabel } from "./format";

// jest.setup.ts pins process.env.TZ = "UTC" so these are deterministic.

describe("formatDate", () => {
  it("formats an ISO datetime as a short US date", () => {
    expect(formatDate("2026-03-15T12:00:00Z")).toBe("Mar 15, 2026");
  });

  it("formats a single-digit day without zero-padding (toLocaleDateString convention)", () => {
    expect(formatDate("2026-01-05T12:00:00Z")).toBe("Jan 5, 2026");
  });
});

describe("formatDateTime", () => {
  it("includes both date and time", () => {
    const result = formatDateTime("2026-03-15T14:30:00Z");
    expect(result).toContain("Mar 15, 2026");
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatYears", () => {
  it("formats a whole number with one decimal and a trailing y", () => {
    expect(formatYears(5)).toBe("5.0y");
  });

  it("formats a fractional value", () => {
    expect(formatYears(2.5)).toBe("2.5y");
  });

  it("rounds to one decimal place", () => {
    expect(formatYears(3.14159)).toBe("3.1y");
  });

  it("handles zero", () => {
    expect(formatYears(0)).toBe("0.0y");
  });
});

describe("formatYearsLabel", () => {
  it("formats with a spelled-out 'years' suffix", () => {
    expect(formatYearsLabel(5)).toBe("5.0 years");
  });

  it("rounds to one decimal place", () => {
    expect(formatYearsLabel(2.666)).toBe("2.7 years");
  });
});
