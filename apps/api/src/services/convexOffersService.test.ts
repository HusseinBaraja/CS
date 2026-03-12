import { describe, expect, test } from 'bun:test';
import { convexInternal } from '@cs/db';
import { ERROR_CODES } from '@cs/shared';
import { getFunctionName } from 'convex/server';
import { createConvexOffersService } from './convexOffersService';
import { createDatabaseServiceError, createValidationServiceError, OffersServiceError } from './offers';

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexOffersService({
    createClient: () => client as never,
  });

describe("createConvexOffersService", () => {
  test("uses the internal Convex offers list reference", async () => {
    let receivedReference: unknown;
    let receivedArgs: unknown;
    const service = createService({
      query: async (reference, args) => {
        receivedReference = reference;
        receivedArgs = args;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1", { activeOnly: false })).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.offers.list),
    );
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      activeOnly: false,
    });
  });

  test("converts offer dates between ISO strings and epoch milliseconds", async () => {
    let receivedArgs: unknown;
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async (_reference, args) => {
        receivedArgs = args;
        return {
          id: "offer-1",
          companyId: "company-1",
          contentEn: "Weekend sale",
          active: true,
          startDate: Date.parse("2026-03-12T08:00:00.000Z"),
          endDate: Date.parse("2026-03-12T20:00:00.000Z"),
          isCurrentlyActive: true,
        };
      },
    });

    await expect(service.create("company-1", {
      contentEn: "Weekend sale",
      active: true,
      startDate: "2026-03-12T08:00:00.000Z",
      endDate: "2026-03-12T20:00:00.000Z",
    })).resolves.toEqual({
      id: "offer-1",
      companyId: "company-1",
      contentEn: "Weekend sale",
      active: true,
      startDate: "2026-03-12T08:00:00.000Z",
      endDate: "2026-03-12T20:00:00.000Z",
      isCurrentlyActive: true,
    });
    expect(receivedArgs).toEqual({
      companyId: "company-1",
      contentEn: "Weekend sale",
      active: true,
      startDate: Date.parse("2026-03-12T08:00:00.000Z"),
      endDate: Date.parse("2026-03-12T20:00:00.000Z"),
    });
  });

  test("rethrows existing OffersServiceError instances unchanged", async () => {
    const error = new OffersServiceError(
      ERROR_CODES.VALIDATION_FAILED,
      "contentEn is required",
      400,
    );
    const service = createService({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toBe(error);
  });

  test("maps tagged Convex errors to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("VALIDATION_FAILED: startDate must be less than or equal to endDate");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createValidationServiceError("startDate must be less than or equal to endDate"),
    );
  });

  test("maps unknown errors to database unavailable errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("socket hang up");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createDatabaseServiceError("Offer data is temporarily unavailable"),
    );
  });
});
