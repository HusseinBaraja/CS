import { describe, expect, test } from 'bun:test';
import { canonicalizePhoneNumber, isSamePhoneNumber } from './inbound';

describe("canonicalizePhoneNumber", () => {
  test("normalizes plain digits and leading plus", () => {
    expect(canonicalizePhoneNumber("966500000001")).toBe("966500000001");
    expect(canonicalizePhoneNumber("+966500000001")).toBe("966500000001");
  });

  test("removes whitespace and punctuation", () => {
    expect(canonicalizePhoneNumber(" +966 500-000-001 ")).toBe("966500000001");
    expect(canonicalizePhoneNumber("(967) 700 000 001")).toBe("967700000001");
  });

  test("returns null for empty or non-numeric input", () => {
    expect(canonicalizePhoneNumber("")).toBeNull();
    expect(canonicalizePhoneNumber("   ")).toBeNull();
    expect(canonicalizePhoneNumber("+")).toBeNull();
    expect(canonicalizePhoneNumber("owner")).toBeNull();
  });
});

describe("isSamePhoneNumber", () => {
  test("matches equivalent phone formats", () => {
    expect(isSamePhoneNumber("+966 500-000-001", "966500000001")).toBe(true);
  });

  test("rejects mismatched or invalid phone inputs", () => {
    expect(isSamePhoneNumber("966500000001", "966500000002")).toBe(false);
    expect(isSamePhoneNumber("owner", "966500000002")).toBe(false);
    expect(isSamePhoneNumber("966500000002", "owner")).toBe(false);
  });
});
