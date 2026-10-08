import {
  EMPTY_FORM,
  formStateFromCandidate,
  toRecordCreate,
  validate,
  type FormState,
} from "./candidate-form";
import type { Candidate } from "./types";

function buildForm(overrides: Partial<FormState> = {}): FormState {
  return {
    full_name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 000 1234",
    position: "Chef",
    linkedin_url: "",
    cv_url: "",
    experience_years: "3",
    ...overrides,
  };
}

describe("validate", () => {
  it("returns no errors for a fully valid form", () => {
    expect(validate(buildForm())).toEqual({});
  });

  describe("full_name", () => {
    it("requires a value", () => {
      expect(validate(buildForm({ full_name: "" })).full_name).toBe("Full name is required.");
    });

    it("requires at least 2 characters", () => {
      expect(validate(buildForm({ full_name: "J" })).full_name).toMatch(/at least 2/);
    });

    it("treats whitespace-only as empty", () => {
      expect(validate(buildForm({ full_name: "   " })).full_name).toBe("Full name is required.");
    });
  });

  describe("email", () => {
    it("requires a value", () => {
      expect(validate(buildForm({ email: "" })).email).toBe("Email is required.");
    });

    it.each(["not-an-email", "missing-at.com", "@no-local.com", "no-domain@"])(
      "rejects invalid email %s",
      (email) => {
        expect(validate(buildForm({ email })).email).toBe("Enter a valid email address.");
      },
    );

    it("accepts a well-formed email", () => {
      expect(validate(buildForm({ email: "a@b.co" })).email).toBeUndefined();
    });
  });

  describe("phone", () => {
    it("requires a value", () => {
      expect(validate(buildForm({ phone: "" })).phone).toBe("Phone is required.");
    });

    it("requires at least 6 characters", () => {
      expect(validate(buildForm({ phone: "12345" })).phone).toMatch(/at least 6/);
    });
  });

  it("requires a position", () => {
    expect(validate(buildForm({ position: "" })).position).toBe("Position is required.");
  });

  describe("experience_years", () => {
    it("requires a value", () => {
      expect(validate(buildForm({ experience_years: "" })).experience_years).toMatch(/required/);
    });

    it("rejects non-numeric input", () => {
      expect(validate(buildForm({ experience_years: "abc" })).experience_years).toMatch(/required/);
    });

    it("rejects negative values", () => {
      expect(validate(buildForm({ experience_years: "-1" })).experience_years).toMatch(/negative/);
    });

    it("rejects values above 50", () => {
      expect(validate(buildForm({ experience_years: "51" })).experience_years).toMatch(/too high/);
    });

    it("accepts 0 and 50 as boundary values", () => {
      expect(validate(buildForm({ experience_years: "0" })).experience_years).toBeUndefined();
      expect(validate(buildForm({ experience_years: "50" })).experience_years).toBeUndefined();
    });
  });

  describe("optional URLs", () => {
    it("allows linkedin_url and cv_url to be empty", () => {
      const errors = validate(buildForm({ linkedin_url: "", cv_url: "" }));
      expect(errors.linkedin_url).toBeUndefined();
      expect(errors.cv_url).toBeUndefined();
    });

    it("rejects a linkedin_url without http(s)://", () => {
      expect(validate(buildForm({ linkedin_url: "linkedin.com/in/jane" })).linkedin_url).toMatch(
        /http/,
      );
    });

    it("accepts a well-formed linkedin_url", () => {
      expect(
        validate(buildForm({ linkedin_url: "https://linkedin.com/in/jane" })).linkedin_url,
      ).toBeUndefined();
    });

    it("rejects a cv_url without http(s)://", () => {
      expect(validate(buildForm({ cv_url: "drive.google.com/file" })).cv_url).toMatch(/http/);
    });
  });

  it("reports every invalid field at once, not just the first", () => {
    const errors = validate(
      buildForm({ full_name: "", email: "bad", phone: "", position: "", experience_years: "-5" }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["email", "experience_years", "full_name", "phone", "position"].sort(),
    );
  });
});

describe("toRecordCreate", () => {
  it("trims strings and converts experience_years to a number", () => {
    const result = toRecordCreate(
      buildForm({ full_name: "  Jane Doe  ", email: " jane@example.com ", experience_years: "4" }),
    );
    expect(result.full_name).toBe("Jane Doe");
    expect(result.email).toBe("jane@example.com");
    expect(result.experience_years).toBe(4);
  });

  it("converts blank optional URLs to undefined instead of empty strings", () => {
    const result = toRecordCreate(buildForm({ linkedin_url: "   ", cv_url: "" }));
    expect(result.linkedin_url).toBeUndefined();
    expect(result.cv_url).toBeUndefined();
  });

  it("keeps a provided, trimmed URL", () => {
    const result = toRecordCreate(buildForm({ linkedin_url: " https://linkedin.com/in/jane " }));
    expect(result.linkedin_url).toBe("https://linkedin.com/in/jane");
  });
});

describe("formStateFromCandidate", () => {
  const candidate: Candidate = {
    id: "c1",
    full_name: "Jane Doe",
    email: "jane@example.com",
    phone: "+1 555 000 1234",
    position: "Chef",
    linkedin_url: null,
    cv_url: null,
    status: "received",
    stage: "pending",
    experience_years: 5,
    notes_count: 0,
    applied_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps null URLs to empty strings for controlled inputs", () => {
    const form = formStateFromCandidate(candidate);
    expect(form.linkedin_url).toBe("");
    expect(form.cv_url).toBe("");
  });

  it("stringifies experience_years for the input value", () => {
    expect(formStateFromCandidate(candidate).experience_years).toBe("5");
  });

  it("round-trips through EMPTY_FORM shape", () => {
    expect(Object.keys(formStateFromCandidate(candidate)).sort()).toEqual(
      Object.keys(EMPTY_FORM).sort(),
    );
  });

  it("keeps existing URLs when they are present (not just the null case)", () => {
    const withUrls: Candidate = {
      ...candidate,
      linkedin_url: "https://linkedin.com/in/jane",
      cv_url: "https://drive.google.com/file",
    };
    const form = formStateFromCandidate(withUrls);
    expect(form.linkedin_url).toBe("https://linkedin.com/in/jane");
    expect(form.cv_url).toBe("https://drive.google.com/file");
  });
});
