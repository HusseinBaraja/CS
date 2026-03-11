import { describe, expect, test } from "bun:test";
import { convexInternal } from "@cs/db";
import { ERROR_CODES } from "@cs/shared";
import { getFunctionName } from "convex/server";
import { createConvexCompaniesService } from "./convexCompaniesService";
import {
  createConflictServiceError,
  createDatabaseServiceError,
  createValidationServiceError,
} from "./companies";

type StubConvexAdminClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexAdminClient) =>
  createConvexCompaniesService({
    createClient: () => client as never,
  });

describe("createConvexCompaniesService", () => {
  test("uses internal Convex company references", async () => {
    let receivedReference: unknown;
    const service = createService({
      query: async (reference) => {
        receivedReference = reference;
        return [];
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list()).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.companies.list),
    );
  });

  test("maps tagged Convex errors to conflict service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("CONFLICT: Owner phone is already assigned to another company");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list()).rejects.toEqual(
      createConflictServiceError("Owner phone is already assigned to another company"),
    );
  });

  test("maps decode and argument validation failures to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("ArgumentValidationError: Value does not match validator");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list()).rejects.toEqual(
      createValidationServiceError("Invalid company identifier or request payload"),
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
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list()).rejects.toEqual(
      createDatabaseServiceError("Company data is temporarily unavailable"),
    );
  });
});
