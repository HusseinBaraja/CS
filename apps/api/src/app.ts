import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '@cs/core';
import { checkDbConnection, createDbConnection, DB_PROVIDER, type DbConnection, getDbConnectionInfo } from '@cs/db';
import { ConfigError, ERROR_CODES } from '@cs/shared';
import { createApiKeyAuthMiddleware } from './auth';
import { createRateLimitMiddleware } from './rateLimit';
import { createErrorResponse } from './responses';
import { createCategoriesRoutes } from './routes/categories';
import { createCompaniesRoutes } from './routes/companies';
import { createProductsRoutes } from './routes/products';
import { type ApiRuntimeConfig, createApiRuntimeConfig } from './runtimeConfig';
import type { CategoriesService } from './services/categories';
import { createConvexCategoriesService } from './services/convexCategoriesService';
import type { CompaniesService } from './services/companies';
import { createConvexCompaniesService } from './services/convexCompaniesService';
import type { ProductsService } from './services/products';
import { createConvexProductsService } from './services/convexProductsService';

export interface ApiAppOptions {
  createDbConnection?: () => DbConnection;
  checkDbReady?: (connection: DbConnection) => Promise<void> | void;
  companiesService?: CompaniesService;
  categoriesService?: CategoriesService;
  productsService?: ProductsService;
  logger?: {
    warn: (payload: Record<string, unknown>, message: string) => void;
  };
  runtimeConfig?: Partial<ApiRuntimeConfig>;
  now?: () => number;
  getClientId?: (context: Context) => string;
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
  const checkDbReady = options.checkDbReady ?? checkDbConnection;
  const appLogger = options.logger ?? logger;
  const runtimeConfig = createApiRuntimeConfig(options.runtimeConfig);
  const apiCors = cors({
    origin: runtimeConfig.corsOrigins.includes("*")
      ? "*"
      : (origin) =>
          runtimeConfig.corsOrigins.includes(origin) ? origin : null,
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 86_400
  });
  const authMiddleware = createApiKeyAuthMiddleware({
    apiKey: runtimeConfig.apiKey
  });
  const companiesService = options.companiesService ?? createConvexCompaniesService();
  const categoriesService = options.categoriesService ?? createConvexCategoriesService();
  const productsService = options.productsService ?? createConvexProductsService();
  const rateLimitMiddleware = createRateLimitMiddleware({
    max: runtimeConfig.rateLimitMax,
    windowMs: runtimeConfig.rateLimitWindowMs,
    trustedProxyHops: runtimeConfig.trustProxyHops,
    trustedProxyIps: runtimeConfig.trustedProxyIps,
    now: options.now,
    getClientId: options.getClientId
  });

  app.use("*", apiCors, authMiddleware, rateLimitMiddleware);

  app.onError((error, c) => {
    if (
      error instanceof SyntaxError &&
      c.req.header("content-type")?.includes("application/json")
    ) {
      return c.json(
        createErrorResponse(ERROR_CODES.VALIDATION_FAILED, "Malformed JSON body"),
        400
      );
    }

    return c.json(
      createErrorResponse("INTERNAL_SERVER_ERROR", "Internal server error"),
      500
    );
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      runtime: "api"
    })
  );

  app.get("/api", (c) =>
    c.json({
      ok: true,
      runtime: "api",
      auth: "api-key"
    })
  );

  app.get("/api/ready", async (c) => {
    try {
      const db = connectToDb();
      await checkDbReady(db);

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

  app.route(
    "/api/companies/:companyId/categories",
    createCategoriesRoutes({
      categoriesService
    })
  );

  app.route(
    "/api/companies/:companyId/products",
    createProductsRoutes({
      productsService
    })
  );

  app.route(
    "/api/companies",
    createCompaniesRoutes({
      companiesService
    })
  );

  app.notFound((c) =>
    c.json(createErrorResponse("NOT_FOUND", "Route not found"), 404)
  );

  return app;
};
