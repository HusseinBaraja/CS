import 'hono';
import type { StructuredLogger } from '@cs/core';

declare module 'hono' {
  interface ContextVariableMap {
    authenticatedClientId: string | undefined;
    authOutcome: string | undefined;
    requestId: string;
    requestLogger: StructuredLogger;
  }
}

export {};
