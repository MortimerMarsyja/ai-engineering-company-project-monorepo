import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  formatSeconds,
  ORIGIN_LABELS,
  ORIGIN_OPTIONS,
  STATUS_COLORS,
  STATUS_ICONS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  STATUS_TRANSITIONS,
  type IncidentStatus,
} from "./incidents";

const ALL_STATUSES: IncidentStatus[] = ["open", "in_progress", "resolved", "discarded"];

describe("STATUS_TRANSITIONS", () => {
  it("allows open to move to in_progress or discarded", () => {
    expect(STATUS_TRANSITIONS.open).toEqual(["in_progress", "discarded"]);
  });

  it("allows in_progress to move to resolved or discarded", () => {
    expect(STATUS_TRANSITIONS.in_progress).toEqual(["resolved", "discarded"]);
  });

  it("has no transitions out of resolved (terminal)", () => {
    expect(STATUS_TRANSITIONS.resolved).toEqual([]);
  });

  it("has no transitions out of discarded (terminal)", () => {
    expect(STATUS_TRANSITIONS.discarded).toEqual([]);
  });

  it("never allows skipping straight from open to resolved", () => {
    expect(STATUS_TRANSITIONS.open).not.toContain("resolved");
  });

  it("covers every known status", () => {
    expect(Object.keys(STATUS_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe("formatSeconds", () => {
  it("returns an em dash for null", () => {
    expect(formatSeconds(null)).toBe("—");
  });

  it("formats sub-day durations in hours", () => {
    expect(formatSeconds(3600)).toBe("1.0h");
    expect(formatSeconds(5400)).toBe("1.5h");
  });

  it("formats exactly 24h as hours, not days (boundary is exclusive)", () => {
    expect(formatSeconds(24 * 3600)).toBe("1.0d");
  });

  it("formats multi-day durations in days", () => {
    expect(formatSeconds(3 * 24 * 3600)).toBe("3.0d");
  });

  it("handles zero seconds", () => {
    expect(formatSeconds(0)).toBe("0.0h");
  });
});

describe("display metadata completeness", () => {
  it("has a label, color, and icon for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_COLORS[status]).toBeTruthy();
      expect(STATUS_ICONS[status]).toBeTruthy();
    }
  });

  it("STATUS_OPTIONS covers exactly the known statuses", () => {
    expect(STATUS_OPTIONS.map((o) => o.value).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("ORIGIN_OPTIONS and ORIGIN_LABELS agree on the same set of origins", () => {
    const fromOptions = ORIGIN_OPTIONS.map((o) => o.value).sort();
    const fromLabels = Object.keys(ORIGIN_LABELS).sort();
    expect(fromOptions).toEqual(fromLabels);
  });

  it("CATEGORY_OPTIONS, CATEGORY_LABELS, and CATEGORY_ICONS agree on the same set of categories", () => {
    const fromOptions = CATEGORY_OPTIONS.map((o) => o.value).sort();
    const fromLabels = Object.keys(CATEGORY_LABELS).sort();
    const fromIcons = Object.keys(CATEGORY_ICONS).sort();
    expect(fromOptions).toEqual(fromLabels);
    expect(fromOptions).toEqual(fromIcons);
  });
});
