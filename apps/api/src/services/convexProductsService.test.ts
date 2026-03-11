import { describe, expect, test } from "bun:test";
import { convexInternal } from "@cs/db";
import { ERROR_CODES } from "@cs/shared";
import { getFunctionName } from "convex/server";
import { createConvexProductsService } from "./convexProductsService";
import {
  createAiServiceError,
  createDatabaseServiceError,
  createNotFoundServiceError,
  createValidationServiceError,
  ProductsServiceError,
} from "./products";

type StubConvexClient = {
  query: (reference: unknown, args: unknown) => Promise<unknown>;
  mutation: (reference: unknown, args: unknown) => Promise<unknown>;
  action: (reference: unknown, args: unknown) => Promise<unknown>;
};

const createService = (client: StubConvexClient) =>
  createConvexProductsService({
    createClient: () => client as never,
  });

describe("createConvexProductsService", () => {
  test("uses internal Convex product references", async () => {
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

    await expect(service.list("company-1", {})).resolves.toEqual([]);
    expect(getFunctionName(receivedReference as never)).toBe(
      getFunctionName(convexInternal.products.list),
    );
  });

  test("rethrows existing ProductsServiceError instances unchanged", async () => {
    const error = new ProductsServiceError(
      ERROR_CODES.NOT_FOUND,
      "Product not found",
      404,
    );
    const service = createService({
      query: async () => {
        throw error;
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toBe(error);
  });

  test("maps tagged Convex errors to service errors", async () => {
    const service = createService({
      query: async () => {
        throw new Error("AI_PROVIDER_FAILED: Gemini rate limit exceeded");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createAiServiceError("Gemini rate limit exceeded"),
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
      action: async () => {
        throw new Error("action should not be called");
      },
    });

    await expect(service.list("company-1", {})).rejects.toEqual(
      createValidationServiceError("Invalid product, company, or category identifier"),
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

    await expect(service.list("company-1", {})).rejects.toEqual(
      createDatabaseServiceError("Product data is temporarily unavailable"),
    );
  });

  test("maps not found tags on actions", async () => {
    const service = createService({
      query: async () => {
        throw new Error("query should not be called");
      },
      mutation: async () => {
        throw new Error("mutation should not be called");
      },
      action: async () => {
        throw new Error("NOT_FOUND: Category not found");
      },
    });

    await expect(service.create("company-1", {
      categoryId: "category-1",
      nameEn: "Burger Box",
    })).rejects.toEqual(createNotFoundServiceError("Category not found"));
  });
});
