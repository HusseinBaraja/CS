import { describe, expect, test } from 'bun:test';
import { shouldReconnectForDisconnectCode } from './disconnect';

describe("shouldReconnectForDisconnectCode", () => {
  test("allows a bounded number of retries for unknown disconnect codes", () => {
    expect(shouldReconnectForDisconnectCode(undefined)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 1)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 3)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 4)).toBe(false);
  });
});
