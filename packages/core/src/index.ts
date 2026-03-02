import pino from "pino";
import type { HealthStatus } from "@cs/shared";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug"
});

export const coreHealth = (): HealthStatus => ({
  service: "api",
  ok: true
});
