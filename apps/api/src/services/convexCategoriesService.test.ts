import { describe, expect, test } from "bun:test";
import { ERROR_CODES } from "@cs/shared";
import { createConvexCategoriesService } from "./convexCategoriesService";
import {
  CategoriesServiceError,
  createConflictServiceError,
  createDatabaseServiceError,
  createValidationServiceError,
} from "./categories";

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexCategoriesService({
    createClient: () => client as never,
  });

describe("createConvexCategoriesService", () => {
  test("rethrows existing CategoriesServiceError instances unchanged", async () => {
    const error = new CategoriesServiceError(
      ERROR_CODES.CONFLICT,
      "Category name already exists for this company",
      409,
    );
    const service = createService({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toBe(error);
  });

  test("maps tagged Convex errors to conflict service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("CONFLICT: Category name already exists for this company");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toEqual(
      createConflictServiceError("Category name already exists for this company"),
    );
  });

  test("maps decode and argument validation failures to validation service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("ArgumentValidationError: Unable to decode value");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
    });

    await expect(service.list("company-1")).rejects.toEqual(
      createValidationServiceError("Invalid company or category identifier"),
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

    await expect(service.list("company-1")).rejects.toEqual(
      createDatabaseServiceError("Category data is temporarily unavailable"),
    );
  });
});
