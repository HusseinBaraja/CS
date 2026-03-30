import type { HealthStatus } from '@cs/shared';

export * from "./logging";

export const coreHealth = (): HealthStatus => ({
  service: "api",
  ok: true,
});
