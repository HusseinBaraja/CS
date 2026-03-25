import { describe, expect, test } from 'bun:test';
import { evaluateInboundAccess, resolveAccessControlPolicy } from './accessControl';

const sortAllowed = (policy: ReturnType<typeof resolveAccessControlPolicy>): string[] =>
  Array.from(policy.allowedPhoneNumbers).sort();

describe("access control policy", () => {
  test("defaults to owner only when config is missing", () => {
    const policy = resolveAccessControlPolicy(undefined, "+966 500 000 001");

    expect(policy).toMatchObject({
      ownerPhoneNumber: "966500000001",
      configuredMode: null,
      effectiveMode: "OWNER_ONLY",
      malformed: false,
    });
    expect(sortAllowed(policy)).toEqual(["966500000001"]);
    expect(evaluateInboundAccess(policy, "966500000001")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({
      allowed: false,
      reason: "access_mode_owner_only",
    });
  });

  test("allows every sender in ALL mode", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "ALL",
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "ALL",
      malformed: false,
    });
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "966500000001")).toEqual({ allowed: true });
  });

  test("allows the owner and configured sender in SINGLE_NUMBER mode", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "SINGLE_NUMBER",
      accessControlSingleNumber: " +967 700 000 001 ",
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "SINGLE_NUMBER",
      malformed: false,
    });
    expect(sortAllowed(policy)).toEqual(["966500000001", "967700000001"]);
    expect(evaluateInboundAccess(policy, "966500000001")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "967700000002")).toEqual({
      allowed: false,
      reason: "access_mode_single_number_no_match",
    });
  });

  test("allows owner and normalized unique entries in LIST mode", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "LIST",
      accessControlAllowedNumbers: " +967 700 000 001, 967700000002, , +967-700-000-001 ",
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "LIST",
      malformed: false,
    });
    expect(sortAllowed(policy)).toEqual([
      "966500000001",
      "967700000001",
      "967700000002",
    ]);
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "967700000002")).toEqual({ allowed: true });
    expect(evaluateInboundAccess(policy, "967700000003")).toEqual({
      allowed: false,
      reason: "access_mode_list_no_match",
    });
  });

  test("fails safe for malformed access control mode", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "EVERYONE",
    }, "966500000001");

    expect(policy).toMatchObject({
      configuredMode: "EVERYONE",
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_invalid_mode",
    });
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({
      allowed: false,
      reason: "access_mode_owner_only",
    });
  });

  test("fails safe for non-string access control mode values", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: true,
    }, "966500000001");

    expect(policy).toMatchObject({
      configuredMode: "true",
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_invalid_mode",
    });
  });

  test("fails safe for invalid single number config", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "SINGLE_NUMBER",
      accessControlSingleNumber: "owner",
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_single_number_invalid",
    });
    expect(sortAllowed(policy)).toEqual(["966500000001"]);
  });

  test("fails safe for non-string single number config", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "SINGLE_NUMBER",
      accessControlSingleNumber: 967700000001,
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_single_number_invalid",
    });
  });

  test("fails safe for empty list config and keeps valid entries only from mixed input", () => {
    const emptyPolicy = resolveAccessControlPolicy({
      accessControlMode: "LIST",
      accessControlAllowedNumbers: "owner, , +",
    }, "966500000001");

    expect(emptyPolicy).toMatchObject({
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_list_empty",
    });

    const mixedPolicy = resolveAccessControlPolicy({
      accessControlMode: "LIST",
      accessControlAllowedNumbers: "owner, +967 700 000 001, , invalid",
    }, "966500000001");

    expect(mixedPolicy).toMatchObject({
      effectiveMode: "LIST",
      malformed: false,
    });
    expect(sortAllowed(mixedPolicy)).toEqual(["966500000001", "967700000001"]);
  });

  test("fails safe for non-string list config", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "LIST",
      accessControlAllowedNumbers: false,
    }, "966500000001");

    expect(policy).toMatchObject({
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_list_empty",
    });
  });

  test("fails closed when the owner phone is invalid", () => {
    const policy = resolveAccessControlPolicy({
      accessControlMode: "ALL",
    }, "owner");

    expect(policy).toMatchObject({
      ownerPhoneNumber: null,
      effectiveMode: "OWNER_ONLY",
      malformed: true,
      reason: "access_mode_owner_phone_invalid",
    });
    expect(evaluateInboundAccess(policy, "967700000001")).toEqual({
      allowed: false,
      reason: "access_mode_owner_phone_invalid",
    });
  });

  test("reports invalid sender phones separately from invalid owner configuration", () => {
    const healthyPolicy = resolveAccessControlPolicy({
      accessControlMode: "ALL",
    }, "966500000001");

    expect(evaluateInboundAccess(healthyPolicy, "sender")).toEqual({
      allowed: false,
      reason: "access_mode_sender_phone_invalid",
    });

    const malformedOwnerPolicy = resolveAccessControlPolicy({
      accessControlMode: "ALL",
    }, "owner");

    expect(evaluateInboundAccess(malformedOwnerPolicy, "sender")).toEqual({
      allowed: false,
      reason: "access_mode_owner_phone_invalid",
    });
  });
});
