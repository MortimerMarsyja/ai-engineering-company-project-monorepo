import {
  EMPTY_SUPPLIER_FORM,
  validateSupplierForm,
  supplierFormToPayload,
  type SupplierFormState,
} from "./supplier-form";

function buildForm(overrides: Partial<SupplierFormState> = {}): SupplierFormState {
  return {
    full_name: "Isabella Martinez",
    email: "isabella@example.com",
    phone: "+57 300 123 4567",
    country: "Colombia",
    city: "Bogotá",
    favorite_location: "",
    product_category: "Meat",
    rate: "4.5",
    status: "active",
    how_did_you_find_us: "Referral",
    date_of_birth: "1990-01-01",
    ...overrides,
  };
}

describe("validateSupplierForm", () => {
  it("returns no errors for a fully valid form", () => {
    expect(validateSupplierForm(buildForm())).toEqual({});
  });

  it("requires full_name", () => {
    expect(validateSupplierForm(buildForm({ full_name: "" })).full_name).toBe("Required");
  });

  it("requires email", () => {
    expect(validateSupplierForm(buildForm({ email: "" })).email).toBe("Required");
  });

  it("rejects a malformed email", () => {
    expect(validateSupplierForm(buildForm({ email: "not-an-email" })).email).toBe("Invalid email");
  });

  it("requires phone", () => {
    expect(validateSupplierForm(buildForm({ phone: "" })).phone).toBe("Required");
  });

  it("requires country", () => {
    expect(validateSupplierForm(buildForm({ country: "" })).country).toBe("Required");
  });

  it("requires city", () => {
    expect(validateSupplierForm(buildForm({ city: "" })).city).toBe("Required");
  });

  it("requires product_category", () => {
    expect(validateSupplierForm(buildForm({ product_category: "" })).product_category).toBe(
      "Required",
    );
  });

  describe("rate", () => {
    it("requires a value", () => {
      expect(validateSupplierForm(buildForm({ rate: "" })).rate).toBe("Required");
    });

    it("rejects non-numeric input", () => {
      expect(validateSupplierForm(buildForm({ rate: "abc" })).rate).toBe(
        "Must be a positive number",
      );
    });

    it("rejects zero", () => {
      expect(validateSupplierForm(buildForm({ rate: "0" })).rate).toBe(
        "Must be a positive number",
      );
    });

    it("rejects negative numbers", () => {
      expect(validateSupplierForm(buildForm({ rate: "-2" })).rate).toBe(
        "Must be a positive number",
      );
    });

    it("accepts a positive decimal", () => {
      expect(validateSupplierForm(buildForm({ rate: "3.2" })).rate).toBeUndefined();
    });
  });

  it("requires how_did_you_find_us", () => {
    expect(
      validateSupplierForm(buildForm({ how_did_you_find_us: "" })).how_did_you_find_us,
    ).toBe("Required");
  });

  it("does not require favorite_location", () => {
    expect(
      validateSupplierForm(buildForm({ favorite_location: "" })).favorite_location,
    ).toBeUndefined();
  });

  it("reports every invalid field at once", () => {
    const errors = validateSupplierForm(
      buildForm({ full_name: "", email: "", phone: "", country: "", rate: "" }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["country", "email", "full_name", "phone", "rate"].sort(),
    );
  });
});

describe("supplierFormToPayload", () => {
  it("trims strings and lowercases email", () => {
    const payload = supplierFormToPayload(
      buildForm({ full_name: "  Isabella  ", email: " ISABELLA@EXAMPLE.COM " }),
    );
    expect(payload.full_name).toBe("Isabella");
    expect(payload.email).toBe("isabella@example.com");
  });

  it("converts rate to a number", () => {
    const payload = supplierFormToPayload(buildForm({ rate: "4.5" }));
    expect(payload.rate).toBe(4.5);
    expect(typeof payload.rate).toBe("number");
  });

  it("converts a blank favorite_location to undefined", () => {
    expect(supplierFormToPayload(buildForm({ favorite_location: "  " })).favorite_location).toBeUndefined();
  });

  it("keeps a provided favorite_location, trimmed", () => {
    expect(
      supplierFormToPayload(buildForm({ favorite_location: " Chapinero " })).favorite_location,
    ).toBe("Chapinero");
  });

  it("always sets accepts_terms true and wants_email_offers false", () => {
    const payload = supplierFormToPayload(buildForm());
    expect(payload.accepts_terms).toBe(true);
    expect(payload.wants_email_offers).toBe(false);
  });

  it("passes country/category/status through as typed literals", () => {
    const payload = supplierFormToPayload(buildForm({ country: "United States", product_category: "Seafood" }));
    expect(payload.country).toBe("United States");
    expect(payload.product_category).toBe("Seafood");
  });
});

describe("EMPTY_SUPPLIER_FORM", () => {
  it("is not itself a valid form (forces the user to fill it in)", () => {
    expect(Object.keys(validateSupplierForm(EMPTY_SUPPLIER_FORM)).length).toBeGreaterThan(0);
  });

  it("defaults status to active", () => {
    expect(EMPTY_SUPPLIER_FORM.status).toBe("active");
  });
});
