import { describe, expect, test } from "bun:test";
import { parseCreateCompanyBody, parseUpdateCompanyBody } from "./companySchemas";

describe("company schema parsers", () => {
  test("parseCreateCompanyBody rejects non-object bodies", () => {
    expect(parseCreateCompanyBody("invalid")).toEqual({
      ok: false,
      message: "Request body must be a JSON object",
    });
  });

  test("parseUpdateCompanyBody trims strings and preserves nullable fields", () => {
    expect(parseUpdateCompanyBody({
      name: "  Updated Tenant  ",
      ownerPhone: " 966500000123 ",
      timezone: null,
      config: null,
    })).toEqual({
      ok: true,
      value: {
        name: "Updated Tenant",
        ownerPhone: "966500000123",
        timezone: null,
        config: null,
      },
    });
  });
});
