export type AppRuntime = "api" | "bot" | "worker" | "cli";

export interface HealthStatus {
  service: AppRuntime;
  ok: true;
}

export * from "./analytics";
export * from "./companyRuntime";
export * from "./errors";
export * from "./inbound";
export * from "./outbound";
