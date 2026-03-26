import { DisconnectReason } from '@whiskeysockets/baileys';
import { describe, expect, test } from 'bun:test';
import {
  isReplacedConnectionDisconnectCode,
  shouldReconnectForDisconnectCode,
  toClosedLifecycleState,
} from './disconnect';

describe("shouldReconnectForDisconnectCode", () => {
  test("allows a bounded number of retries for unknown disconnect codes", () => {
    expect(shouldReconnectForDisconnectCode(undefined)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 1)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 3)).toBe(true);
    expect(shouldReconnectForDisconnectCode(undefined, 4)).toBe(false);
  });

  test("treats replaced connections as non-retryable failures", () => {
    expect(shouldReconnectForDisconnectCode(DisconnectReason.connectionReplaced)).toBe(false);
    expect(isReplacedConnectionDisconnectCode(DisconnectReason.connectionReplaced)).toBe(true);
    expect(toClosedLifecycleState(DisconnectReason.connectionReplaced)).toBe("failed");
  });
});
