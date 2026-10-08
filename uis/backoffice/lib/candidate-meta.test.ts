import {
  CANDIDATE_STAGES,
  CANDIDATE_STATUSES,
  isCandidateStage,
  isCandidateStatus,
  STAGE_LABELS,
  STAGE_OPTIONS,
  STAGE_SHORT,
  STAGE_STYLES,
  STATUS_LABELS,
  STATUS_OPTIONS,
  STATUS_SHORT,
  STATUS_STYLES,
} from "./candidate-meta";

describe("isCandidateStatus", () => {
  it.each(CANDIDATE_STATUSES)("accepts the known status %s", (status) => {
    expect(isCandidateStatus(status)).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(isCandidateStatus("hired")).toBe(false);
    expect(isCandidateStatus("")).toBe(false);
  });
});

describe("isCandidateStage", () => {
  it.each(CANDIDATE_STAGES)("accepts the known stage %s", (stage) => {
    expect(isCandidateStage(stage)).toBe(true);
  });

  it("rejects an unknown stage", () => {
    expect(isCandidateStage("onboarding")).toBe(false);
  });
});

describe("display metadata completeness", () => {
  it("has a label, short label, and style for every status", () => {
    for (const status of CANDIDATE_STATUSES) {
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(STATUS_SHORT[status]).toBeTruthy();
      expect(STATUS_STYLES[status]).toBeTruthy();
    }
  });

  it("has a label, short label, and style for every stage", () => {
    for (const stage of CANDIDATE_STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
      expect(STAGE_SHORT[stage]).toBeTruthy();
      expect(STAGE_STYLES[stage]).toBeTruthy();
    }
  });

  it("STATUS_OPTIONS covers exactly the known statuses, no more no less", () => {
    expect(STATUS_OPTIONS.map((o) => o.value).sort()).toEqual([...CANDIDATE_STATUSES].sort());
  });

  it("STAGE_OPTIONS covers exactly the known stages, no more no less", () => {
    expect(STAGE_OPTIONS.map((o) => o.value).sort()).toEqual([...CANDIDATE_STAGES].sort());
  });
});
