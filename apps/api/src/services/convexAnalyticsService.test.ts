import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { getFunctionName } from 'convex/server';
import { createConvexAnalyticsService } from './convexAnalyticsService';
import { AnalyticsServiceError, createDatabaseServiceError, createValidationServiceError } from './analytics';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexAnalyticsService({
    createClient: () => client as never,
  });

describe("createConvexAnalyticsService", () => {
  test("uses the internal Convex analytics summary reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return null;
      },
    });

    await expect(service.getSummary("company-1", "week")).resolves.toBeNull();
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.analytics.summary),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      period: "week",
    });
  });

  test("rethrows existing analytics service errors unchanged", async () => {
    const error = new AnalyticsServiceError("DB_QUERY_FAILED", "Analytics unavailable", 503);
    const service = createService({
      query: async () => {
        throw error;
      },
    });

    await expect(service.getSummary("company-1", "today")).rejects.toBe(error);
  });

  test("maps Convex argument validation errors to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("ArgumentValidationError: Value does not match validator");
      },
    });

    await expect(service.getSummary("company-1", "today")).rejects.toEqual(
      createValidationServiceError("Invalid company identifier or analytics period"),
    );
  });

  test("maps tagged Convex validation errors to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("VALIDATION_FAILED: bad input");
      },
    });

    await expect(service.getSummary("company-1", "today")).rejects.toEqual(
      createValidationServiceError("Invalid company identifier or analytics period"),
    );
  });

  test("maps unknown errors to database unavailable errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("socket hang up");
      },
    });

    await expect(service.getSummary("company-1", "month")).rejects.toEqual(
      createDatabaseServiceError("Analytics data is temporarily unavailable"),
    );
  });
});
