import { describe, expect, test } from 'bun:test';
import { canonicalizePhoneNumber } from './inbound';

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
