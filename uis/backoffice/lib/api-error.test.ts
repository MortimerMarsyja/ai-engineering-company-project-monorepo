import {
  ApiError,
  getForbiddenField,
  isPermissionError,
  isRetryableError,
  ACCESS_DENIED_MESSAGE,
  ACCESS_DENIED_ACTION_MESSAGE,
  ACTION_UNAVAILABLE_MESSAGE,
} from "./api-error";

describe("ApiError", () => {
  it("carries the message and status", () => {
    const err = new ApiError("Not found", 404);
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.name).toBe("ApiError");
  });

  it("is a real Error instance", () => {
    const err = new ApiError("boom", 500);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("isPermissionError", () => {
  it("is true for a 403 ApiError", () => {
    expect(isPermissionError(new ApiError(ACCESS_DENIED_MESSAGE, 403))).toBe(true);
  });

  it("is false for other statuses", () => {
    expect(isPermissionError(new ApiError("not found", 404))).toBe(false);
    expect(isPermissionError(new ApiError("server error", 500))).toBe(false);
  });

  it("is false for a plain Error with no status", () => {
    expect(isPermissionError(new Error("oops"))).toBe(false);
  });

  it("is false for non-error values", () => {
    expect(isPermissionError(null)).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
    expect(isPermissionError("string error")).toBe(false);
  });

  it("works with any object carrying a numeric status, not just ApiError", () => {
    expect(isPermissionError({ status: 403 })).toBe(true);
    expect(isPermissionError({ status: "403" })).toBe(false); // must be a number
  });
});

describe("isRetryableError", () => {
  it("is false for 403 (permissions)", () => {
    expect(isRetryableError(new ApiError(ACCESS_DENIED_MESSAGE, 403))).toBe(false);
  });

  it("is false for 404 (not found)", () => {
    expect(isRetryableError(new ApiError("not found", 404))).toBe(false);
  });

  it("is false for 405 (method not allowed / routing bug)", () => {
    expect(isRetryableError(new ApiError(ACTION_UNAVAILABLE_MESSAGE, 405))).toBe(false);
  });

  it("is true for 500 (transient server error)", () => {
    expect(isRetryableError(new ApiError("server error", 500))).toBe(true);
  });

  it("is true for 503 (service unavailable)", () => {
    expect(isRetryableError(new ApiError("unavailable", 503))).toBe(true);
  });

  it("defaults to true when there's no status at all (network error etc.)", () => {
    expect(isRetryableError(new Error("network down"))).toBe(true);
    expect(isRetryableError(null)).toBe(true);
  });
});

describe("getForbiddenField", () => {
  it("returns the rejected field name for a 422 extra_forbidden issue", () => {
    const err = new ApiError("Unprocessable", 422, [
      { type: "extra_forbidden", loc: ["body", "current_stock"], msg: "Extra inputs are not permitted" },
    ]);
    expect(getForbiddenField(err)).toBe("current_stock");
  });

  it("returns null for a 422 that isn't an extra_forbidden issue (e.g. location mismatch)", () => {
    // services/api's location-mismatch 422 is a plain string detail, not a
    // structured issue list — buildApiError only sets rawDetail when the
    // backend's `detail` is an array in the first place.
    const err = new ApiError("Order location must match the product's location.", 422, undefined);
    expect(getForbiddenField(err)).toBeNull();
  });

  it("returns null for a 422 with a structured but unrelated validation issue", () => {
    const err = new ApiError("Unprocessable", 422, [
      { type: "greater_than", loc: ["body", "quantity"], msg: "Input should be greater than 0" },
    ]);
    expect(getForbiddenField(err)).toBeNull();
  });

  it("returns null for any non-422 status, even with a matching rawDetail", () => {
    const err = new ApiError("boom", 400, [
      { type: "extra_forbidden", loc: ["body", "current_stock"] },
    ]);
    expect(getForbiddenField(err)).toBeNull();
  });

  it("returns null for a non-ApiError", () => {
    expect(getForbiddenField(new Error("plain error"))).toBeNull();
    expect(getForbiddenField(null)).toBeNull();
  });
});

describe("message constants", () => {
  it("are distinct, non-empty, user-friendly strings", () => {
    const messages = [ACCESS_DENIED_MESSAGE, ACCESS_DENIED_ACTION_MESSAGE, ACTION_UNAVAILABLE_MESSAGE];
    const unique = new Set(messages);
    expect(unique.size).toBe(messages.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(10);
      // Never leak raw HTTP vocabulary to the user.
      expect(message.toLowerCase()).not.toMatch(/status code|method not allowed|forbidden/);
    }
  });
});
