import { randomUUID } from 'node:crypto';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { logEvent, logger, serializeErrorForLog, type StructuredLogger, withLogBindings } from '@cs/core';
import { checkDbConnection, createDbConnection, DB_PROVIDER, type DbConnection, getDbConnectionInfo } from '@cs/db';
import { ConfigError, ERROR_CODES, ValidationError } from '@cs/shared';
import { createApiKeyAuthMiddleware } from './auth';
import { createRateLimitMiddleware } from './rateLimit';
import { createCustomErrorResponse, createErrorResponse } from './responses';
import { createCategoriesRoutes } from './routes/categories';
import { createConversationsRoutes } from './routes/conversations';
import { createAnalyticsRoutes } from './routes/analytics';
import { createCompaniesRoutes } from './routes/companies';
import { createBotRuntimeRoutes, renderBotRuntimeShell } from './routes/botRuntime';
import { createCurrencyRatesRoutes } from './routes/currencyRates';
import { createOffersRoutes } from './routes/offers';
import { createProductsRoutes } from './routes/products';
import { type ApiRuntimeConfig, createApiRuntimeConfig } from './runtimeConfig';
import type { AnalyticsService } from './services/analytics';
import { createConvexAnalyticsService } from './services/convexAnalyticsService';
import type { CategoriesService } from './services/categories';
import { createConvexCategoriesService } from './services/convexCategoriesService';
import type { ConversationsService } from './services/conversations';
import type { CompaniesService } from './services/companies';
import type { BotRuntimeService } from './services/botRuntime';
import { createConvexCompaniesService } from './services/convexCompaniesService';
import { createConvexBotRuntimeService } from './services/convexBotRuntimeService';
import { createConvexConversationsService } from './services/convexConversationsService';
import type { CurrencyRatesService } from './services/currencyRates';
import { createConvexCurrencyRatesService } from './services/convexCurrencyRatesService';
import type { OffersService } from './services/offers';
import { createConvexOffersService } from './services/convexOffersService';
import type { ProductsService } from './services/products';
import { createConvexProductsService } from './services/convexProductsService';
import type { ProductMediaService } from './services/productMedia';
import { createConvexProductMediaService } from './services/convexProductMediaService';

export interface ApiAppOptions {
  createDbConnection?: () => DbConnection;
  checkDbReady?: (connection: DbConnection) => Promise<void> | void;
  analyticsService?: AnalyticsService;
  companiesService?: CompaniesService;
  botRuntimeService?: BotRuntimeService;
  categoriesService?: CategoriesService;
  conversationsService?: ConversationsService;
  productsService?: ProductsService;
  productMediaService?: ProductMediaService;
  offersService?: OffersService;
  currencyRatesService?: CurrencyRatesService;
  logger?: StructuredLogger;
  runtimeConfig?: Partial<ApiRuntimeConfig>;
  now?: () => number;
  getClientId?: (context: Context) => string;
  createRequestId?: () => string;
}

const MAX_ERROR_MESSAGE_LENGTH = 120;
const REQUEST_ID_HEADER = "X-Request-Id";

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

const createSanitizedLogError = (error: unknown): Error => {
  const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
  const sanitizedError = new Error(message);
  sanitizedError.name = error instanceof Error ? error.name : "UnknownError";
  return sanitizedError;
};

const getRequestOutcome = (statusCode: number): string => {
  if (statusCode >= 500) {
    return "error";
  }

  if (statusCode === 429) {
    return "rate_limited";
  }

  if (statusCode >= 400) {
    return "client_error";
  }

  return "success";
};

const getAuthOutcome = (context: Context): string => {
  const authOutcome = context.get("authOutcome");
  if (typeof authOutcome === "string") {
    return authOutcome;
  }

  if (context.res.status === 401) {
    return "unauthorized";
  }

  if (context.res.status === 403) {
    return "forbidden";
  }

  return context.res.status === 429 ? "rate_limited" : "not_required";
};

const getRequestLogger = (
  context: Context,
  fallbackLogger: StructuredLogger,
): StructuredLogger => context.get("requestLogger") ?? fallbackLogger;

export const createApp = (options: ApiAppOptions = {}) => {
  const app = new Hono();
  const connectToDb = options.createDbConnection ?? createDbConnection;
  const checkDbReady = options.checkDbReady ?? checkDbConnection;
  const appLogger = withLogBindings(options.logger ?? logger, {
    runtime: "api",
  });
  const runtimeConfig = createApiRuntimeConfig(options.runtimeConfig);
  const createRequestId = options.createRequestId ?? randomUUID;
  const apiCors = cors({
    origin: runtimeConfig.corsOrigins.includes("*")
      ? "*"
      : (origin) =>
          runtimeConfig.corsOrigins.includes(origin) ? origin : null,
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", REQUEST_ID_HEADER],
    maxAge: 86_400
  });
  const authMiddleware = createApiKeyAuthMiddleware({
    apiKey: runtimeConfig.apiKey
  });
  const analyticsService = options.analyticsService ?? createConvexAnalyticsService();
  const companiesService = options.companiesService ?? createConvexCompaniesService();
  const botRuntimeService = options.botRuntimeService ?? createConvexBotRuntimeService();
  const categoriesService = options.categoriesService ?? createConvexCategoriesService();
  const conversationsService = options.conversationsService ?? createConvexConversationsService();
  const productsService = options.productsService ?? createConvexProductsService();
  const productMediaService = options.productMediaService ?? createConvexProductMediaService({
    logger: withLogBindings(appLogger, {
      surface: "product_media",
    }),
  });
  const offersService = options.offersService ?? createConvexOffersService();
  const currencyRatesService = options.currencyRatesService ?? createConvexCurrencyRatesService();
  const rateLimitMiddleware = createRateLimitMiddleware({
    max: runtimeConfig.rateLimitMax,
    maxEntries: runtimeConfig.rateLimitMaxEntries,
    windowMs: runtimeConfig.rateLimitWindowMs,
    trustedProxyHops: runtimeConfig.trustProxyHops,
    trustedProxyIps: runtimeConfig.trustedProxyIps,
    now: options.now,
    getClientId: options.getClientId
  });

  app.use("*", async (c, next) => {
    const incomingRequestId = c.req.header("x-request-id")?.trim();
    const requestId =
      incomingRequestId && /^[A-Za-z0-9._:-]{1,128}$/u.test(incomingRequestId)
        ? incomingRequestId
        : createRequestId();
    const startedAt = (options.now ?? Date.now)();
    const requestLogger = withLogBindings(appLogger, {
      surface: "http",
      requestId,
    });

    c.set("requestId", requestId);
    c.set("requestLogger", requestLogger);
    c.header(REQUEST_ID_HEADER, requestId);
    await next();

    // Re-apply the request id in case downstream middleware replaced the response object.
    c.header(REQUEST_ID_HEADER, requestId);
    logEvent(
      requestLogger,
      "info",
      {
        event: "api.request.completed",
        runtime: "api",
        surface: "http",
        outcome: getRequestOutcome(c.res.status),
        authOutcome: getAuthOutcome(c),
        durationMs: (options.now ?? Date.now)() - startedAt,
        method: c.req.method,
        path: c.req.path,
        requestId,
        statusCode: c.res.status,
      },
      "api request completed",
    );
  });

  app.use("*", apiCors, rateLimitMiddleware, authMiddleware);

  app.onError((error, c) => {
    const requestLogger = getRequestLogger(c, withLogBindings(appLogger, { surface: "http" }));
    const requestId = c.get("requestId");

    if (error instanceof SyntaxError) {
      logEvent(
        requestLogger,
        "warn",
        {
          event: "api.request.validation_failed",
          runtime: "api",
          surface: "http",
          outcome: "invalid",
          error: serializeErrorForLog(error),
          method: c.req.method,
          path: c.req.path,
          requestId,
          statusCode: 400,
        },
        "api request validation failed",
      );
      return c.json(
        createErrorResponse(ERROR_CODES.VALIDATION_FAILED, "Malformed JSON body"),
        400
      );
    }

    if (error instanceof ValidationError) {
      logEvent(
        requestLogger,
        "warn",
        {
          event: "api.request.validation_failed",
          runtime: "api",
          surface: "http",
          outcome: "invalid",
          error: serializeErrorForLog(error),
          method: c.req.method,
          path: c.req.path,
          requestId,
          statusCode: 400,
        },
        "api request validation failed",
      );
      return c.json(
        createErrorResponse(ERROR_CODES.VALIDATION_FAILED, error.message),
        400
      );
    }

    logEvent(
      requestLogger,
      "error",
      {
        event: "api.request.failed",
        runtime: "api",
        surface: "http",
        outcome: "error",
        error: serializeErrorForLog(error),
        method: c.req.method,
        path: c.req.path,
        requestId,
        statusCode: 500,
      },
      "api request failed",
    );
    return c.json(
      createCustomErrorResponse("INTERNAL_SERVER_ERROR", "Internal server error"),
      500
    );
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      runtime: "api"
    })
  );

  app.get("/runtime/bot", (c) =>
    c.html(renderBotRuntimeShell(c.req.query("companyId")))
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

      logEvent(
        withLogBindings(appLogger, {
          surface: "readiness",
        }),
        "warn",
        {
          event: "api.readiness.failed",
          runtime: "api",
          surface: "readiness",
          outcome: "degraded",
          dependency: "db",
          error: serializeErrorForLog(createSanitizedLogError(err)),
          provider: DB_PROVIDER,
          errName,
          errMessage,
          requestId: c.get("requestId"),
        },
        "api readiness check failed"
      );

      return c.json(failure.body, failure.status);
    }
  });

  app.route(
    "/api/runtime/bot",
    createBotRuntimeRoutes({
      botRuntimeService,
      now: options.now,
    })
  );

  app.route(
    "/api/companies/:companyId/analytics",
    createAnalyticsRoutes({
      analyticsService
    })
  );

  app.route(
    "/api/companies/:companyId/conversations",
    createConversationsRoutes({
      conversationsService
    })
  );

  app.route(
    "/api/companies/:companyId/categories",
    createCategoriesRoutes({
      categoriesService
    })
  );

  app.route(
    "/api/companies/:companyId/products",
    createProductsRoutes({
      productsService,
      productMediaService
    })
  );

  app.route(
    "/api/companies/:companyId/offers",
    createOffersRoutes({
      offersService
    })
  );

  app.route(
    "/api/companies/:companyId/currency-rates",
    createCurrencyRatesRoutes({
      currencyRatesService
    })
  );

  app.route(
    "/api/companies",
    createCompaniesRoutes({
      companiesService
    })
  );

  app.notFound((c) =>
    c.json(createErrorResponse(ERROR_CODES.NOT_FOUND, "Route not found"), 404)
  );

  return app;
};
