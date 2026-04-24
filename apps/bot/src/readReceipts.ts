import { logEvent, serializeErrorForLog } from '@cs/core';
import type { CompanyRuntimeProfile, NormalizedInboundMessage } from '@cs/shared';
import type { BotLogger, BotRuntimeHandle } from './runtime';
import type { BotRuntimeConfig } from './runtimeConfig';

export interface ReadReceiptTimer {
  setTimeout(handler: () => void | Promise<void>, delayMs: number): unknown;
  clearTimeout(timeoutId: unknown): void;
}

interface ManagedSessionLike {
  handle?: BotRuntimeHandle;
  profile: CompanyRuntimeProfile;
  runtimeConfig: BotRuntimeConfig;
}

interface CreateInboundReadReceiptSchedulerOptions {
  createRuntimeConfig: (overrides?: { sessionKey?: string }) => BotRuntimeConfig;
  createSessionLogger: (logger: BotLogger, profile: CompanyRuntimeProfile, surface: string) => BotLogger;
  getSession: (companyId: string) => ManagedSessionLike | undefined;
  isSessionStopping: (companyId: string) => boolean;
  logger: BotLogger;
  timer: ReadReceiptTimer;
}

const computeDelayMs = (
  minDelayMs: number,
  maxDelayMs: number,
): number => {
  if (minDelayMs === maxDelayMs) {
    return minDelayMs;
  }

  return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
};

export const createInboundReadReceiptScheduler = (
  options: CreateInboundReadReceiptSchedulerOptions,
) => {
  const pendingTimeouts = new Set<unknown>();

  const schedule = (
    profile: CompanyRuntimeProfile,
    message: NormalizedInboundMessage,
  ): void => {
    const runtimeConfig = options.getSession(profile.companyId)?.runtimeConfig ?? options.createRuntimeConfig({
      sessionKey: profile.sessionKey,
    });
    const timeoutId = options.timer.setTimeout(async () => {
      pendingTimeouts.delete(timeoutId);

      if (options.isSessionStopping(profile.companyId)) {
        return;
      }

      const currentSession = options.getSession(profile.companyId);
      if (!currentSession?.handle) {
        return;
      }

      try {
        await currentSession.handle.markRead({
          id: message.messageId,
          remoteJid: message.sender.transportId,
        });
      } catch (error) {
        logEvent(
          options.createSessionLogger(options.logger, currentSession.profile, "router"),
          "warn",
          {
            companyId: currentSession.profile.companyId,
            event: "bot.router.read_receipt_failed",
            runtime: "bot",
            surface: "router",
            outcome: "error",
            error: serializeErrorForLog(error),
            messageId: message.messageId,
            sessionKey: currentSession.profile.sessionKey,
          },
          "tenant inbound read receipt failed",
        );
      }
    }, computeDelayMs(
      runtimeConfig.inboundReadReceiptDelayMs.min,
      runtimeConfig.inboundReadReceiptDelayMs.max,
    ));

    pendingTimeouts.add(timeoutId);
  };

  const clearAll = (): void => {
    for (const timeoutId of pendingTimeouts) {
      options.timer.clearTimeout(timeoutId);
    }
    pendingTimeouts.clear();
  };

  return {
    clearAll,
    schedule,
  };
};
