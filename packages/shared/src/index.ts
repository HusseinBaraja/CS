export type AppRuntime = "api" | "bot" | "worker" | "cli";

export interface HealthStatus {
  service: AppRuntime;
  ok: true;
}
