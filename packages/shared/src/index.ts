export type AppRuntime = "api" | "bot" | "worker" | "cli";

export interface HealthStatus {
  service: AppRuntime;
  ok: true;
}

export * from "./analytics";
export * from "./accessControl";
export * from "./companyRuntime";
export * from "./conversationState";
export * from "./conversationalIntelligenceDiagnostics";
export * from "./conversations";
export * from "./errors";
export * from "./inbound";
export * from "./ownerNotifications";
export * from "./outbound";
