import type { CompanyRuntimeConfig } from './companyRuntime';
import { canonicalizePhoneNumber } from './inbound';

export const ACCESS_CONTROL_MODES = [
  "ALL",
  "OWNER_ONLY",
  "SINGLE_NUMBER",
  "LIST",
] as const;

export type AccessControlMode = (typeof ACCESS_CONTROL_MODES)[number];

export const ACCESS_CONTROL_BLOCK_REASONS = [
  "access_mode_owner_only",
  "access_mode_single_number_no_match",
  "access_mode_list_no_match",
  "access_mode_invalid_mode",
  "access_mode_single_number_invalid",
  "access_mode_list_empty",
  "access_mode_list_invalid_owner",
  "access_mode_owner_phone_invalid",
] as const;

export type AccessControlBlockReason = (typeof ACCESS_CONTROL_BLOCK_REASONS)[number];

export interface ResolvedAccessControlPolicy {
  ownerPhoneNumber: string | null;
  configuredMode: string | null;
  effectiveMode: Exclude<AccessControlMode, "ALL"> | "ALL";
  allowedPhoneNumbers: ReadonlySet<string>;
  malformed: boolean;
  reason?: AccessControlBlockReason;
}

export interface InboundAccessEvaluation {
  allowed: boolean;
  reason?: AccessControlBlockReason;
}

const ACCESS_CONTROL_MODE_SET = new Set<string>(ACCESS_CONTROL_MODES);

const normalizeConfiguredString = (value: string | number | boolean | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeAllowedNumbers = (value: string | null): Set<string> => {
  if (value === null) {
    return new Set();
  }

  const normalized = new Set<string>();
  for (const segment of value.split(",")) {
    const phoneNumber = canonicalizePhoneNumber(segment);
    if (phoneNumber) {
      normalized.add(phoneNumber);
    }
  }

  return normalized;
};

export const resolveAccessControlPolicy = (
  config: CompanyRuntimeConfig | undefined,
  ownerPhone: string,
): ResolvedAccessControlPolicy => {
  const ownerPhoneNumber = canonicalizePhoneNumber(ownerPhone);
  const configuredMode = normalizeConfiguredString(config?.accessControlMode);
  const singleNumber = canonicalizePhoneNumber(normalizeConfiguredString(config?.accessControlSingleNumber) ?? "");
  const allowedNumbers = normalizeAllowedNumbers(
    normalizeConfiguredString(config?.accessControlAllowedNumbers),
  );

  if (!ownerPhoneNumber) {
    return {
      ownerPhoneNumber: null,
      configuredMode,
      effectiveMode: "OWNER_ONLY",
      allowedPhoneNumbers: new Set(),
      malformed: true,
      reason: "access_mode_owner_phone_invalid",
    };
  }

  if (configuredMode === null) {
    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "OWNER_ONLY",
      allowedPhoneNumbers: new Set([ownerPhoneNumber]),
      malformed: false,
    };
  }

  if (!ACCESS_CONTROL_MODE_SET.has(configuredMode)) {
    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "OWNER_ONLY",
      allowedPhoneNumbers: new Set([ownerPhoneNumber]),
      malformed: true,
      reason: "access_mode_invalid_mode",
    };
  }

  if (configuredMode === "ALL") {
    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "ALL",
      allowedPhoneNumbers: new Set(),
      malformed: false,
    };
  }

  if (configuredMode === "OWNER_ONLY") {
    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "OWNER_ONLY",
      allowedPhoneNumbers: new Set([ownerPhoneNumber]),
      malformed: false,
    };
  }

  if (configuredMode === "SINGLE_NUMBER") {
    if (!singleNumber) {
      return {
        ownerPhoneNumber,
        configuredMode,
        effectiveMode: "OWNER_ONLY",
        allowedPhoneNumbers: new Set([ownerPhoneNumber]),
        malformed: true,
        reason: "access_mode_single_number_invalid",
      };
    }

    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "SINGLE_NUMBER",
      allowedPhoneNumbers: new Set([ownerPhoneNumber, singleNumber]),
      malformed: false,
    };
  }

  if (allowedNumbers.size === 0) {
    return {
      ownerPhoneNumber,
      configuredMode,
      effectiveMode: "OWNER_ONLY",
      allowedPhoneNumbers: new Set([ownerPhoneNumber]),
      malformed: true,
      reason: "access_mode_list_empty",
    };
  }

  return {
    ownerPhoneNumber,
    configuredMode,
    effectiveMode: "LIST",
    allowedPhoneNumbers: new Set([ownerPhoneNumber, ...allowedNumbers]),
    malformed: false,
  };
};

export const evaluateInboundAccess = (
  policy: ResolvedAccessControlPolicy,
  senderPhoneNumber: string,
): InboundAccessEvaluation => {
  const normalizedSender = canonicalizePhoneNumber(senderPhoneNumber);
  if (!normalizedSender) {
    return {
      allowed: false,
      reason: policy.reason ?? "access_mode_owner_phone_invalid",
    };
  }

  if (!policy.ownerPhoneNumber) {
    return {
      allowed: false,
      reason: policy.reason ?? "access_mode_owner_phone_invalid",
    };
  }

  if (normalizedSender === policy.ownerPhoneNumber) {
    return {
      allowed: true,
    };
  }

  if (policy.effectiveMode === "ALL") {
    return {
      allowed: true,
    };
  }

  if (policy.effectiveMode === "OWNER_ONLY") {
    return {
      allowed: false,
      reason: "access_mode_owner_only",
    };
  }

  if (policy.effectiveMode === "SINGLE_NUMBER") {
    return {
      allowed: policy.allowedPhoneNumbers.has(normalizedSender),
      ...(policy.allowedPhoneNumbers.has(normalizedSender)
        ? {}
        : { reason: "access_mode_single_number_no_match" }),
    };
  }

  return {
    allowed: policy.allowedPhoneNumbers.has(normalizedSender),
    ...(policy.allowedPhoneNumbers.has(normalizedSender)
      ? {}
      : { reason: "access_mode_list_no_match" }),
  };
};
