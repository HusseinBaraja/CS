import type { HealthStatus } from '@cs/shared';

export * from "./logging";
export * from "./convexTransport";
export * from "./conversationSessionLog";

export const coreHealth = (): HealthStatus => ({
  service: "api",
  ok: true,
});
