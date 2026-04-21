import { env } from '@cs/config';
import {
  logEvent,
  logger as defaultLogger,
  redactJidForLog,
  serializeErrorForLog,
  withLogBindings,
} from '@cs/core';
import {
  evaluateInboundAccess,
  resolveAccessControlPolicy,
  type AccessControlMode,
  type IgnoredInboundEvent,
  type IgnoredInboundEventReason,
  getBotRuntimeReconnectDelayMs,
  getBotRuntimeNextActionHint,
  getBotRuntimeOperatorState,
  getBotRuntimeOperatorSummary,
  type NormalizedInboundMessage,
  type BotRuntimeOperatorSnapshot,
  type BotRuntimePairingArtifact,
  type BotRuntimeSessionRecord,
  type CompanyRuntimeProfile,
} from '@cs/shared';
import { normalizeInboundMessages } from './inbound';
import {
  createOutboundMessenger as defaultCreateOutboundMessenger,
  type CreateOutboundMessengerOptions,
  type OutboundMessenger,
} from './outbound';
import { createBotRuntimeConfig, type BotRuntimeConfig } from './runtimeConfig';
import {
  type BotPairingStatus,
  startBot as defaultStartBot,
  type BotLogger,
  type BotProcess,
  type BotRuntimeHandle,
  type BotSessionStatus,
  type StartBotOptions,
} from './runtime';
import {
  createConvexCompanyRuntimeStore,
  type CompanyRuntimeStore,
} from './companyRuntimeStore';
import { retryInitialSessionReconcile } from './sessionManagerStartupRetry';

const HEARTBEAT_INTERVAL_MS = 20_000;
const SESSION_LEASE_MS = 60_000;

export interface ManagedTenantSession {
  profile: CompanyRuntimeProfile;
  status: BotSessionStatus;
}

interface ManagedTenantSessionInternal {
  outbound?: OutboundMessenger;
  profile: CompanyRuntimeProfile;
  status: BotSessionStatus;
  pairing: BotPairingStatus | null;
  stopping: boolean;
  runtimeConfig: BotRuntimeConfig;
  handle?: BotRuntimeHandle;
}

export interface SessionManagerStore extends CompanyRuntimeStore {}

export interface SessionManagerTimer {
  setInterval(handler: () => void | Promise<void>, delayMs: number): unknown;
  clearInterval(intervalId: unknown): void;
}

export interface TenantSessionManagerHandle {
  getRuntimeOwnerId(): string;
  getSession(companyId: string): ManagedTenantSession | undefined;
  getOutbound(companyId: string): OutboundMessenger | undefined;
  listSessions(): ManagedTenantSession[];
  stop(): Promise<void>;
}

export interface StartTenantSessionManagerOptions {
  botProcess?: BotProcess;
  inboundRouter?: InboundMessageRouter;
  logger?: BotLogger;
  now?: () => number;
  runtimeOwnerId?: string;
  registerProcessHandlers?: boolean;
  startBot?: (options: StartBotOptions) => Promise<BotRuntimeHandle>;
  store?: SessionManagerStore;
  timer?: SessionManagerTimer;
  createRuntimeConfig?: (overrides?: Parameters<typeof createBotRuntimeConfig>[0]) => BotRuntimeConfig;
  createOutboundMessenger?: (options: CreateOutboundMessengerOptions) => OutboundMessenger;
}

export interface InboundMessageRouter {
  handleOwnerCommand(message: NormalizedInboundMessage, context: InboundRouteContext): Promise<void>;
  handleCustomerConversation(message: NormalizedInboundMessage, context: InboundRouteContext): Promise<void>;
  handleIgnored(event: IgnoredInboundEvent, context: InboundRouteContext): Promise<void> | void;
}

export interface InboundRouteContext {
  outbound?: OutboundMessenger;
  profile: CompanyRuntimeProfile;
  logger: BotLogger;
}

const defaultTimer: SessionManagerTimer = {
  setInterval: (handler, delayMs) => globalThis.setInterval(handler, delayMs),
  clearInterval: (intervalId) => globalThis.clearInterval(intervalId as ReturnType<typeof setInterval>),
};

const OPERATOR_SHELL_PATH = "/runtime/bot";

const defaultInboundRouter: InboundMessageRouter = {
  handleCustomerConversation: async () => undefined,
  handleIgnored: async () => undefined,
  handleOwnerCommand: async () => undefined,
};

const malformedIgnoredReasons = new Set<IgnoredInboundEventReason>([
  "missing_message_id",
  "missing_remote_jid",
  "missing_sender_phone",
  "missing_timestamp",
  "unsupported_message_type",
  "empty_payload",
]);

const createAccessControlBlockedEvent = (
  profile: CompanyRuntimeProfile,
  message: NormalizedInboundMessage,
  accessMode: AccessControlMode,
  accessReason?: string,
): IgnoredInboundEvent => {
  return {
    transport: "whatsapp",
    companyId: profile.companyId,
    sessionKey: profile.sessionKey,
    reason: "access_control_blocked",
    source: {
      upsertType: message.source.upsertType,
      rawMessageId: message.messageId,
      remoteJid: message.sender.transportId,
      fromMe: false,
      accessMode,
      ...(accessReason !== undefined ? { accessReason } : {}),
    },
  };
};

const cloneStatus = (status: BotSessionStatus): BotSessionStatus => ({
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
});

const toSessionRecord = (
  runtimeOwnerId: string,
  companyId: string,
  now: number,
  status: BotSessionStatus,
): BotRuntimeSessionRecord => ({
  companyId,
  runtimeOwnerId,
  sessionKey: status.sessionKey,
  state: status.state,
  attempt: status.attempt,
  hasQr: status.hasQr,
  ...(status.disconnectCode !== undefined ? { disconnectCode: status.disconnectCode } : {}),
  ...(status.isNewLogin !== undefined ? { isNewLogin: status.isNewLogin } : {}),
  updatedAt: now,
  leaseExpiresAt: now + SESSION_LEASE_MS,
});

const clonePairing = (pairing: BotPairingStatus): BotPairingStatus => ({
  sessionKey: pairing.sessionKey,
  state: pairing.state,
  updatedAt: pairing.updatedAt,
  ...(pairing.expiresAt !== undefined ? { expiresAt: pairing.expiresAt } : {}),
  ...(pairing.qrText !== undefined ? { qrText: pairing.qrText } : {}),
});

const createSessionLogger = (
  logger: BotLogger,
  profile: CompanyRuntimeProfile,
  surface: string,
): BotLogger =>
  withLogBindings(logger, {
    companyId: profile.companyId,
    sessionKey: profile.sessionKey,
    surface,
  });

const getOperatorShellUrl = (companyId: string): string => {
  return `http://127.0.0.1:${env.API_PORT}${OPERATOR_SHELL_PATH}?companyId=${encodeURIComponent(companyId)}`;
};

const toOperatorSnapshot = (
  runtimeOwnerId: string,
  now: number,
  session: ManagedTenantSessionInternal,
): BotRuntimeOperatorSnapshot => ({
  ...session.profile,
  session: toSessionRecord(runtimeOwnerId, session.profile.companyId, now, session.status),
  pairing: session.pairing && session.pairing.state !== "none"
    ? {
      updatedAt: session.pairing.updatedAt,
      expiresAt: session.pairing.expiresAt!,
      ...(session.pairing.qrText !== undefined ? { qrText: session.pairing.qrText } : {}),
    }
    : null,
});

const toOperatorLogPayload = (
  snapshot: BotRuntimeOperatorSnapshot,
  now: number,
  nextRetryAt?: number,
) => ({
  companyId: snapshot.companyId,
  companyName: snapshot.name,
  sessionKey: snapshot.session?.sessionKey ?? snapshot.sessionKey,
  state: snapshot.session?.state ?? "closed",
  attempt: snapshot.session?.attempt ?? 0,
  ...(snapshot.session?.disconnectCode !== undefined ? { disconnectCode: snapshot.session.disconnectCode } : {}),
  pairingState: snapshot.pairing ? (snapshot.pairing.expiresAt > now ? "ready" : "expired") : "none",
  ...(snapshot.pairing ? { expiresAt: snapshot.pairing.expiresAt } : {}),
  ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
  operatorState: getBotRuntimeOperatorState(snapshot, now),
  summary: getBotRuntimeOperatorSummary(snapshot, now).text,
  ...(getBotRuntimeNextActionHint(snapshot, now) !== undefined
    ? { nextActionHint: getBotRuntimeNextActionHint(snapshot, now) }
    : {}),
});

const toPairingArtifact = (
  runtimeOwnerId: string,
  companyId: string,
  pairing: BotPairingStatus,
): BotRuntimePairingArtifact => {
  if (
    (pairing.state !== "ready" && pairing.state !== "expired") ||
    pairing.qrText === undefined ||
    pairing.expiresAt === undefined
  ) {
    throw new Error("Expected a pairing status with QR data");
  }

  return {
    companyId,
    runtimeOwnerId,
    sessionKey: pairing.sessionKey,
    qrText: pairing.qrText,
    updatedAt: pairing.updatedAt,
    expiresAt: pairing.expiresAt,
  };
};

export const startTenantSessionManager = async (
  options: StartTenantSessionManagerOptions = {},
): Promise<TenantSessionManagerHandle> => {
  const botLogger = withLogBindings(options.logger ?? defaultLogger, {
    runtime: "bot",
  });
  const botProcess = options.botProcess ?? process;
  const now = options.now ?? Date.now;
  const registerProcessHandlers = options.registerProcessHandlers ?? true;
  const runtimeOwnerId = options.runtimeOwnerId ?? crypto.randomUUID();
  const inboundRouter = options.inboundRouter ?? defaultInboundRouter;
  const startBot = options.startBot ?? defaultStartBot;
  const store = options.store ?? createConvexCompanyRuntimeStore();
  const timer = options.timer ?? defaultTimer;
  const createRuntimeConfig = options.createRuntimeConfig ?? createBotRuntimeConfig;
  const createOutboundMessenger = options.createOutboundMessenger ?? defaultCreateOutboundMessenger;
  const sessions = new Map<string, ManagedTenantSessionInternal>();
  const sessionManagerLogger = withLogBindings(botLogger, { runtimeOwnerId, surface: "session_manager" });
  let heartbeatId: unknown;
  let heartbeatInFlight: Promise<void> | null = null;
  let reconcileInFlight: Promise<void> | null = null;
  let stopping = false;

  const upsertStatus = async (companyId: string, status: BotSessionStatus): Promise<void> => {
    await store.upsertSession(toSessionRecord(runtimeOwnerId, companyId, now(), status));
  };

  const getCurrentProfile = (
    companyId: string,
    fallbackProfile: CompanyRuntimeProfile,
  ): CompanyRuntimeProfile => sessions.get(companyId)?.profile ?? fallbackProfile;

  const isSessionStopping = (companyId: string): boolean => sessions.get(companyId)?.stopping === true;

  const updateSessionProfile = (profile: CompanyRuntimeProfile): void => {
    const existing = sessions.get(profile.companyId);
    if (!existing) {
      return;
    }

    sessions.set(profile.companyId, {
      ...existing,
      profile,
    });
  };

  const clearPairingArtifact = async (
    profile: CompanyRuntimeProfile,
    cleanupRuntimeOwnerId: string,
  ): Promise<void> => {
    try {
      await store.clearPairingArtifact(profile.companyId, cleanupRuntimeOwnerId);
    } catch (error) {
      logEvent(
        createSessionLogger(botLogger, profile, "session"),
        "error",
        {
          event: "bot.session.pairing_artifact_cleanup_failed",
          runtime: "bot",
          surface: "session",
          outcome: "error",
          error: serializeErrorForLog(error),
          companyId: profile.companyId,
          sessionKey: profile.sessionKey,
        },
        "tenant session pairing artifact cleanup failed",
      );
    }
  };

  const logIgnoredInboundEvent = (profile: CompanyRuntimeProfile, event: IgnoredInboundEvent): void => {
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
      const warn = botLogger.warn?.bind(botLogger) ?? botLogger.info.bind(botLogger);
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
      const warn = botLogger.warn?.bind(botLogger) ?? botLogger.info.bind(botLogger);
      warn(payload, "tenant inbound event ignored");
      return;
    }

    const debug = botLogger.debug?.bind(botLogger) ?? botLogger.info.bind(botLogger);
    debug(payload, "tenant inbound event ignored");
  };

  const routeInboundEvent = async (
    profile: CompanyRuntimeProfile,
    event: IgnoredInboundEvent | NormalizedInboundMessage,
    route?: "owner_command" | "customer_conversation",
  ): Promise<void> => {
    const currentProfile = getCurrentProfile(profile.companyId, profile);
    if (stopping || isSessionStopping(currentProfile.companyId)) {
      return;
    }

    const context: InboundRouteContext = {
      profile: currentProfile,
      outbound: sessions.get(profile.companyId)?.outbound,
      logger: withLogBindings(createSessionLogger(botLogger, currentProfile, "router"), {
        ...(route ? { route } : {}),
        ...(route
          ? {
            requestId: (event as NormalizedInboundMessage).messageId,
          }
          : (event as IgnoredInboundEvent).source.rawMessageId !== undefined
            ? { requestId: (event as IgnoredInboundEvent).source.rawMessageId }
            : {}),
      }),
    };

    try {
      if (route === "owner_command") {
        await inboundRouter.handleOwnerCommand(event as NormalizedInboundMessage, context);
        return;
      }

      if (route === "customer_conversation") {
        await inboundRouter.handleCustomerConversation(event as NormalizedInboundMessage, context);
        return;
      }

      logIgnoredInboundEvent(currentProfile, event as IgnoredInboundEvent);
      await inboundRouter.handleIgnored(event as IgnoredInboundEvent, context);
    } catch (error) {
      logEvent(
        context.logger,
        "error",
        {
          event: "bot.router.routing_failed",
          runtime: "bot",
          surface: "router",
          outcome: "error",
          companyId: currentProfile.companyId,
          error: serializeErrorForLog(error),
          sessionKey: currentProfile.sessionKey,
        },
        "tenant inbound message routing failed",
      );
    }
  };

  const handleMessagesUpsert = async (
    profile: CompanyRuntimeProfile,
    event: Parameters<typeof normalizeInboundMessages>[1],
  ): Promise<void> => {
    const currentProfile = getCurrentProfile(profile.companyId, profile);
    if (stopping || isSessionStopping(currentProfile.companyId)) {
      return;
    }

    const dispatches = normalizeInboundMessages(currentProfile, event);
    const accessControlPolicy = resolveAccessControlPolicy(currentProfile.config, currentProfile.ownerPhone);

    for (const dispatch of dispatches) {
      if (dispatch.kind === "ignored") {
        await routeInboundEvent(currentProfile, dispatch.event);
        continue;
      }

      const evaluation = evaluateInboundAccess(accessControlPolicy, dispatch.message.sender.phoneNumber);
      if (!evaluation.allowed) {
        await routeInboundEvent(
          currentProfile,
          createAccessControlBlockedEvent(
            currentProfile,
            dispatch.message,
            accessControlPolicy.effectiveMode,
            accessControlPolicy.reason ?? evaluation.reason,
          ),
        );
        continue;
      }

      await routeInboundEvent(currentProfile, dispatch.message, dispatch.route);
    }
  };

  const handleStatusChange = async (
    profile: CompanyRuntimeProfile,
    status: BotSessionStatus,
  ): Promise<void> => {
    const currentProfile = getCurrentProfile(profile.companyId, profile);
    if (stopping) {
      return;
    }

    const existing = sessions.get(currentProfile.companyId);
    if (existing?.stopping) {
      return;
    }

    const nextStatus = cloneStatus(status);
    sessions.set(currentProfile.companyId, {
      profile: currentProfile,
      pairing: existing?.pairing ?? null,
      stopping: false,
      runtimeConfig: existing?.runtimeConfig ?? createRuntimeConfig({
        sessionKey: currentProfile.sessionKey,
      }),
      status: nextStatus,
      ...(existing?.outbound ? { outbound: existing.outbound } : {}),
      ...(existing?.handle ? { handle: existing.handle } : {}),
    });

    const currentSession = sessions.get(currentProfile.companyId);
    if (currentSession) {
      const logNow = now();
      const snapshot = toOperatorSnapshot(runtimeOwnerId, logNow, currentSession);

      if (nextStatus.state === "reconnecting") {
        const nextRetryAt = logNow + getBotRuntimeReconnectDelayMs(
          nextStatus.attempt,
          currentSession.runtimeConfig.reconnectBackoff,
        );
        logEvent(
          createSessionLogger(botLogger, currentProfile, "session"),
          "info",
          {
            event: "bot.session.reconnect_scheduled",
            runtime: "bot",
            surface: "session",
            outcome: "scheduled",
            ...toOperatorLogPayload(snapshot, logNow, nextRetryAt),
          },
          "bot reconnect scheduled",
        );
      }
    }

    try {
      await upsertStatus(currentProfile.companyId, nextStatus);
    } catch (error) {
      logEvent(
        createSessionLogger(botLogger, currentProfile, "session"),
        "error",
        {
          event: "bot.session.status_persistence_failed",
          runtime: "bot",
          surface: "session",
          outcome: "error",
          companyId: currentProfile.companyId,
          error: serializeErrorForLog(error),
          sessionKey: nextStatus.sessionKey,
        },
        "tenant session status persistence failed",
      );
    }
  };

  const handlePairingChange = async (
    profile: CompanyRuntimeProfile,
    pairing: BotPairingStatus,
  ): Promise<void> => {
    const currentProfile = getCurrentProfile(profile.companyId, profile);
    if (stopping) {
      return;
    }

    const nextPairing = clonePairing(pairing);
    const existing = sessions.get(currentProfile.companyId);
    if (existing?.stopping) {
      return;
    }

    if (existing) {
      sessions.set(currentProfile.companyId, {
        ...existing,
        pairing: nextPairing,
      });
    }

    const currentSession = sessions.get(currentProfile.companyId);
    if (currentSession) {
      const logNow = now();
      const snapshot = toOperatorSnapshot(runtimeOwnerId, logNow, currentSession);

      if (nextPairing.state === "ready") {
        logEvent(
          createSessionLogger(botLogger, currentProfile, "session"),
          "info",
          {
            event: "bot.session.pairing_available",
            runtime: "bot",
            surface: "session",
            outcome: "ready",
            ...toOperatorLogPayload(snapshot, logNow),
            operatorUrl: getOperatorShellUrl(currentProfile.companyId),
          },
          "bot pairing available",
        );
      }

      if (nextPairing.state === "expired") {
        logEvent(
          createSessionLogger(botLogger, currentProfile, "session"),
          "info",
          {
            event: "bot.session.pairing_expired",
            runtime: "bot",
            surface: "session",
            outcome: "expired",
            ...toOperatorLogPayload(snapshot, logNow),
          },
          "bot pairing expired",
        );
      }
    }

    if (nextPairing.state === "none") {
      await clearPairingArtifact(currentProfile, runtimeOwnerId);
      return;
    }

    try {
      await store.upsertPairingArtifact(toPairingArtifact(runtimeOwnerId, currentProfile.companyId, nextPairing));
    } catch (error) {
      logEvent(
        createSessionLogger(botLogger, currentProfile, "session"),
        "error",
        {
          event: "bot.session.pairing_artifact_persistence_failed",
          runtime: "bot",
          surface: "session",
          outcome: "error",
          companyId: currentProfile.companyId,
          error: serializeErrorForLog(error),
          sessionKey: nextPairing.sessionKey,
        },
        "tenant session pairing artifact persistence failed",
      );
    }
  };

  const startManagedSession = async (profile: CompanyRuntimeProfile): Promise<void> => {
    let handle: BotRuntimeHandle | undefined;
    let runtimeConfig: BotRuntimeConfig | undefined;

    try {
      await store.clearPairingArtifactsByCompany(profile.companyId);

      const initialStatus: BotSessionStatus = {
        sessionKey: profile.sessionKey,
        state: "initializing",
        attempt: 0,
        hasQr: false,
      };
      runtimeConfig = createRuntimeConfig({
        sessionKey: profile.sessionKey,
      });
      sessions.set(profile.companyId, {
        profile,
        status: initialStatus,
        pairing: null,
        stopping: false,
        runtimeConfig,
      });
      await handleStatusChange(profile, initialStatus);

      handle = await startBot({
        logger: createSessionLogger(botLogger, profile, "session"),
        onMessagesUpsert: (event) => handleMessagesUpsert(profile, event),
        onPairingChange: (pairing) => handlePairingChange(profile, pairing),
        onStatusChange: (status) => handleStatusChange(profile, status),
        registerProcessHandlers: false,
        runtimeConfig,
      });

      const startedSession = sessions.get(profile.companyId);
      if (stopping || !startedSession || startedSession.stopping) {
        await handle.stop();
        return;
      }

      const currentStatus = cloneStatus(handle.getStatus());
      const outbound = createOutboundMessenger({
        logger: createSessionLogger(botLogger, profile, "outbound"),
        transport: handle,
      });
      sessions.set(profile.companyId, {
        outbound,
        profile: getCurrentProfile(profile.companyId, profile),
        status: currentStatus,
        pairing: sessions.get(profile.companyId)?.pairing ?? null,
        stopping: false,
        runtimeConfig,
        handle,
      });
      await upsertStatus(profile.companyId, currentStatus);
    } catch (error) {
      if (handle) {
        try {
          await handle.stop();
        } catch (stopError) {
          logEvent(
            createSessionLogger(botLogger, profile, "session"),
            "error",
            {
              event: "bot.session.startup_cleanup_failed",
              runtime: "bot",
              surface: "session",
              outcome: "error",
              companyId: profile.companyId,
              error: serializeErrorForLog(stopError),
              sessionKey: profile.sessionKey,
            },
            "tenant session shutdown after startup failure failed",
          );
        }
      }

      const failedStatus: BotSessionStatus = {
        sessionKey: profile.sessionKey,
        state: "failed",
        attempt: 0,
        hasQr: false,
      };
      let fallbackConfig = runtimeConfig;
      if (!fallbackConfig) {
        try {
          fallbackConfig = createRuntimeConfig({ sessionKey: profile.sessionKey });
        } catch {
          fallbackConfig = createBotRuntimeConfig({ sessionKey: profile.sessionKey });
        }
      }

      sessions.set(profile.companyId, {
        profile,
        status: failedStatus,
        pairing: sessions.get(profile.companyId)?.pairing ?? null,
        stopping: false,
        runtimeConfig: fallbackConfig,
      });
      await upsertStatus(profile.companyId, failedStatus).catch((persistError) => {
        logEvent(
          createSessionLogger(botLogger, profile, "session"),
          "error",
          {
            event: "bot.session.status_persistence_failed",
            runtime: "bot",
            surface: "session",
            outcome: "error",
            companyId: profile.companyId,
            error: serializeErrorForLog(persistError),
            sessionKey: profile.sessionKey,
          },
          "tenant session status persistence failed",
        );
      });
      logEvent(
        createSessionLogger(botLogger, profile, "session"),
        "error",
        {
          event: "bot.session.startup_failed",
          runtime: "bot",
          surface: "session",
          outcome: "failed",
          companyId: profile.companyId,
          error: serializeErrorForLog(error),
          sessionKey: profile.sessionKey,
        },
        "tenant session startup failed",
      );
    }
  };

  const stopManagedSession = async (
    companyId: string,
    options: {
      clearPersistedState?: boolean;
    } = {},
  ): Promise<void> => {
    const session = sessions.get(companyId);
    if (!session || session.stopping) {
      return;
    }

    sessions.set(companyId, {
      ...session,
      stopping: true,
    });

    try {
      await session.handle?.stop();
    } catch (error) {
      logEvent(
        createSessionLogger(botLogger, session.profile, "session"),
        "error",
        {
          companyId,
          event: "bot.session.shutdown_failed",
          runtime: "bot",
          surface: "session",
          outcome: "error",
          error: serializeErrorForLog(error),
          sessionKey: session.profile.sessionKey,
        },
        "tenant session shutdown failed",
      );
    }

    if (!options.clearPersistedState) {
      await clearPairingArtifact(session.profile, runtimeOwnerId);
      sessions.delete(companyId);
      return;
    }

    try {
      await store.clearSession(companyId, runtimeOwnerId);
    } catch (error) {
      logEvent(
        createSessionLogger(botLogger, session.profile, "session"),
        "error",
        {
          companyId,
          event: "bot.session.cleanup_failed",
          runtime: "bot",
          surface: "session",
          outcome: "error",
          error: serializeErrorForLog(error),
          sessionKey: session.profile.sessionKey,
        },
        "tenant session cleanup failed",
      );
    }

    await clearPairingArtifact(session.profile, runtimeOwnerId);
    sessions.delete(companyId);
  };

  const reconcileManagedSessions = async (): Promise<void> => {
    const enabledProfiles = await store.listEnabledCompanies();
    const enabledByCompanyId = new Map(enabledProfiles.map((profile) => [profile.companyId, profile]));

    for (const profile of enabledProfiles) {
      const existing = sessions.get(profile.companyId);
      if (existing?.stopping) {
        continue;
      }

      if (!existing || (!existing.handle && existing.status.state === "failed")) {
        if (existing) {
          sessions.delete(profile.companyId);
        }

        await startManagedSession(profile);
        continue;
      }

      updateSessionProfile(profile);
    }

    for (const companyId of Array.from(sessions.keys())) {
      if (!enabledByCompanyId.has(companyId)) {
        await stopManagedSession(companyId, { clearPersistedState: true });
      }
    }
  };

  const renewHeartbeat = async (): Promise<void> => {
    const updates = Array.from(sessions.values()).map(async (session) => {
      if (stopping || session.stopping) {
        return;
      }

      try {
        await upsertStatus(session.profile.companyId, session.status);
      } catch (error) {
        logEvent(
          createSessionLogger(botLogger, session.profile, "session"),
          "error",
          {
            companyId: session.profile.companyId,
            event: "bot.session.heartbeat_persistence_failed",
            runtime: "bot",
            surface: "session",
            outcome: "error",
            error: serializeErrorForLog(error),
            sessionKey: session.status.sessionKey,
          },
          "tenant session heartbeat persistence failed",
        );
      }
    });

    await Promise.all(updates);
  };

  const runHeartbeat = (): Promise<void> => {
    if (heartbeatInFlight) {
      return heartbeatInFlight;
    }

    heartbeatInFlight = renewHeartbeat().finally(() => {
      heartbeatInFlight = null;
    });

    return heartbeatInFlight;
  };

  const triggerReconcileManagedSessions = (): void => {
    if (stopping || reconcileInFlight) {
      return;
    }

    reconcileInFlight = (async () => {
      try {
        await reconcileManagedSessions();
      } catch (error) {
        logEvent(
          sessionManagerLogger,
          "error",
          {
            runtimeOwnerId,
            event: "bot.session.reconcile_failed",
            runtime: "bot",
            surface: "session_manager",
            outcome: "error",
            error: serializeErrorForLog(error),
          },
          "tenant session reconcile failed",
        );
      } finally {
        reconcileInFlight = null;
      }
    })();
  };

  const stop = async (): Promise<void> => {
    if (stopping) {
      return;
    }

    stopping = true;

    if (heartbeatId !== undefined) {
      timer.clearInterval(heartbeatId);
      heartbeatId = undefined;
    }

    if (heartbeatInFlight) {
      await Promise.allSettled([heartbeatInFlight]);
    }

    if (reconcileInFlight) {
      await Promise.allSettled([reconcileInFlight]);
    }

    await Promise.allSettled(
      Array.from(sessions.keys()).map(async (companyId) => stopManagedSession(companyId)),
    );

    await Promise.allSettled([
      store.releaseSessionsByOwner(runtimeOwnerId),
      store.releasePairingArtifactsByOwner(runtimeOwnerId),
    ]);
  };
  try {
    await retryInitialSessionReconcile(reconcileManagedSessions, ({ attempt, retryDelayMs, error }) => {
      logEvent(sessionManagerLogger, "warn", {
        runtimeOwnerId,
        event: "bot.session.initial_reconcile_retry_scheduled",
        runtime: "bot",
        surface: "session_manager",
        outcome: "retrying",
        attempt,
        retryDelayMs,
        error: serializeErrorForLog(error),
      }, "initial tenant session reconcile failed; retrying");
    });
  } catch (error) {
    logEvent(sessionManagerLogger, "error", {
      runtimeOwnerId,
      event: "bot.session.initial_reconcile_failed",
      runtime: "bot",
      surface: "session_manager",
      outcome: "error",
      error: serializeErrorForLog(error),
    }, "initial tenant session reconcile failed; continuing and letting heartbeat retry");
  }
  heartbeatId = timer.setInterval(async () => {
    await runHeartbeat();
    triggerReconcileManagedSessions();
  }, HEARTBEAT_INTERVAL_MS);

  if (registerProcessHandlers) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      botProcess.once(signal, () => stop());
    }
  }

  return {
    getRuntimeOwnerId: () => runtimeOwnerId,
    getOutbound: (companyId) => sessions.get(companyId)?.outbound,
    getSession: (companyId) => {
      const session = sessions.get(companyId);
      if (!session) {
        return undefined;
      }

      return {
        profile: session.profile,
        status: cloneStatus(session.status),
      };
    },
    listSessions: () =>
      Array.from(sessions.values()).map((session) => ({
        profile: session.profile,
        status: cloneStatus(session.status),
      })),
    stop,
  };
};
