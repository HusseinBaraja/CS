import { logEvent, redactJidForLog, type StructuredLogger } from '@cs/core';
import type { CompanyRuntimeProfile, IgnoredInboundEvent, IgnoredInboundEventReason } from '@cs/shared';

const malformedIgnoredReasons = new Set<IgnoredInboundEventReason>([
  "missing_message_id",
  "missing_remote_jid",
  "missing_sender_phone",
  "missing_timestamp",
  "unsupported_message_type",
  "empty_payload",
]);

export const logIgnoredInboundEvent = (
  logger: StructuredLogger,
  profile: CompanyRuntimeProfile,
  event: IgnoredInboundEvent,
): void => {
  const payload = {
    event: "bot.router.inbound_ignored",
    runtime: "bot",
    surface: "router",
    outcome: "ignored",
    companyId: profile.companyId,
    reason: event.reason,
    sessionKey: profile.sessionKey,
    ...(event.source.rawMessageId !== undefined ? { requestId: event.source.rawMessageId } : {}),
    ...(event.source.rawMessageId !== undefined ? { messageId: event.source.rawMessageId } : {}),
    ...(event.source.remoteJid !== undefined ? { remoteJid: redactJidForLog(event.source.remoteJid) } : {}),
    ...(event.source.accessMode !== undefined ? { accessMode: event.source.accessMode } : {}),
    ...(event.source.accessReason !== undefined ? { accessReason: event.source.accessReason } : {}),
  };

  if (malformedIgnoredReasons.has(event.reason)) {
    const warn = logger.warn?.bind(logger) ?? logger.info.bind(logger);
    warn(payload, "tenant inbound event ignored");
    return;
  }

  if (
    event.reason === "access_control_blocked" &&
    event.source.accessReason !== undefined &&
    event.source.accessReason !== "access_mode_owner_only" &&
    event.source.accessReason !== "access_mode_single_number_no_match" &&
    event.source.accessReason !== "access_mode_list_no_match"
  ) {
    const warn = logger.warn?.bind(logger) ?? logger.info.bind(logger);
    warn(payload, "tenant inbound event ignored");
    return;
  }

  const debug = logger.debug?.bind(logger) ?? logger.info.bind(logger);
  debug(payload, "tenant inbound event ignored");
};
