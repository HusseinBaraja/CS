import { describe, expect, test } from 'bun:test';
import { createSessionKey } from './sessionKey';

describe("createSessionKey", () => {
  test("creates a deterministic base64url session key", () => {
    expect(createSessionKey("company-1")).toBe("company-Y29tcGFueS0x");
    expect(createSessionKey("company-1")).toBe(createSessionKey("company-1"));
  });

  test("avoids path separators in generated keys", () => {
    const sessionKey = createSessionKey("company/with+symbols=");

    expect(sessionKey.startsWith("company-")).toBe(true);
    expect(sessionKey.includes("/")).toBe(false);
    expect(sessionKey.includes("\\")).toBe(false);
  });
});
