export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogPayload extends Record<string, unknown> {
  event: string;
  runtime: string;
  surface: string;
  outcome: string;
}

export interface StructuredLogger {
  debug?(payload: Record<string, unknown>, message: string): void;
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
  child?(bindings: Record<string, unknown>): StructuredLogger;
}
