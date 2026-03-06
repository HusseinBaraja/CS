import { Hono } from 'hono';
import { logger } from '@cs/core';
import { createDbConnection, DB_PROVIDER, type DbConnection, getDbConnectionInfo } from '@cs/db';
import { ConfigError, ERROR_CODES } from '@cs/shared';

export interface ApiAppOptions {
  createDbConnection?: () => DbConnection;
  logger?: {
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
}

const MAX_ERROR_MESSAGE_LENGTH = 120;

const redactErrorMessage = (message: string): string => {
  const sanitized = message
    .replace(/https?:\/\/\S+/giu, "[redacted-url]")
    .replace(/\b[A-Z][A-Z0-9_]{2,}\b/gu, "[redacted]");

  return sanitized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`
    : sanitized;
};

const getReadyErrorResponse = (error: unknown) => {
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === ERROR_CODES.DB_CONNECTION_FAILED
  ) {
    return {
      body: {
        ok: false,
        runtime: "api",
        dependencies: {
          db: {
            provider: DB_PROVIDER,
            ready: false,
            status: "unavailable",
            message: "Database connection failed"
          }
        }
      },
      status: 503 as const
    };
  }

  if (error instanceof ConfigError) {
    return {
      body: {
        ok: false,
        runtime: "api",
        dependencies: {
          db: {
            provider: DB_PROVIDER,
            ready: false,
            status: "misconfigured",
            message: "Database configuration is invalid or missing"
          }
        }
      },
      status: 503 as const
    };
  }

  return {
    body: {
      ok: false,
      runtime: "api",
      dependencies: {
        db: {
          provider: DB_PROVIDER,
          ready: false
        }
      }
    },
    status: 503 as const
  };
};

export const createApp = (options: ApiAppOptions = {}) => {
  const app = new Hono();
  const connectToDb = options.createDbConnection ?? createDbConnection;
  const appLogger = options.logger ?? logger;

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      runtime: "api"
    })
  );

  app.get("/api/ready", (c) => {
    try {
      const db = connectToDb();

      return c.json({
        ok: true,
        runtime: "api",
        dependencies: {
          db: {
            ...getDbConnectionInfo(db),
            ready: true
          }
        }
      });
    } catch (err) {
      const errName = err instanceof Error ? err.name : "UnknownError";
      const errMessage = redactErrorMessage(err instanceof Error ? err.message : String(err));
      const failure = getReadyErrorResponse(err);

      appLogger.warn(
        {
          dependency: "db",
          provider: DB_PROVIDER,
          errName,
          errMessage
        },
        "api readiness check failed"
      );

      return c.json(failure.body, failure.status);
    }
  });

  return app;
};
