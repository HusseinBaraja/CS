import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    authenticatedClientId: string;
  }
}

export {};
